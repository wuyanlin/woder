/**
 * 用量记录库：每条发出去的会话消息一行，token 用量随阶段累加。
 * 用 SQLite（better-sqlite3，N-API 预编译产物 Electron 可直接加载），
 * 文件放 userData 下，卸载应用时跟其他偏好一起走。
 */

import Database = require('better-sqlite3');
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

export interface UsageRow {
  id: number;
  ts: number;
  text: string;
  model: string;
  product: string;
  prompt: number;
  completion: number;
  total: number;
  reported: number;
}

export interface UsageTotals {
  count: number;
  prompt: number;
  completion: number;
  total: number;
}

export interface UsageQuery {
  from?: number;
  to?: number;
  model?: string;
  limit?: number;
}

export class UsageStore {
  private db: Database.Database;

  constructor() {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(path.join(dir, 'usage.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      create table if not exists usage_records (
        id integer primary key autoincrement,
        ts integer not null,
        text text not null,
        model text not null,
        product text not null,
        prompt integer not null default 0,
        completion integer not null default 0,
        total integer not null default 0,
        reported integer not null default 0
      );
      create index if not exists idx_usage_ts on usage_records (ts desc);
    `);
  }

  /** 一条需求跑完落一行：模型调用可能有好几轮，用量在回执里已经累好了 */
  record(text: string, model: string, product: string, usage: { prompt: number; completion: number; total: number; reported: boolean }): number {
    const info = this.db
      .prepare(`insert into usage_records (ts, text, model, product, prompt, completion, total, reported)
                values (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(Date.now(), text.slice(0, 400), model, product,
        usage.prompt | 0, usage.completion | 0, usage.total | 0, usage.reported ? 1 : 0);
    return Number(info.lastInsertRowid);
  }

  private where(q: UsageQuery): { sql: string; args: unknown[] } {
    const parts: string[] = [];
    const args: unknown[] = [];
    if (Number.isFinite(q.from)) { parts.push('ts >= ?'); args.push(Math.floor(q.from as number)); }
    if (Number.isFinite(q.to)) { parts.push('ts <= ?'); args.push(Math.floor(q.to as number)); }
    if (q.model) { parts.push('model = ?'); args.push(String(q.model)); }
    return { sql: parts.length ? `where ${parts.join(' and ')}` : '', args };
  }

  query(q: UsageQuery): { rows: UsageRow[]; totals: UsageTotals } {
    const { sql, args } = this.where(q);
    // limit 是拼进 SQL 的，非有限数一律回默认值，别让 NaN 流到语句里
    const n = Math.floor(Number(q.limit));
    const limit = Number.isFinite(n) && n > 0 ? Math.min(500, n) : 200;
    const rows = this.db
      .prepare(`select * from usage_records ${sql} order by ts desc limit ${limit}`)
      .all(...args) as UsageRow[];
    const totals = this.db
      .prepare(`select count(*) as count, coalesce(sum(prompt),0) as prompt,
                       coalesce(sum(completion),0) as completion, coalesce(sum(total),0) as total
                from usage_records ${sql}`)
      .get(...args) as UsageTotals;
    return { rows, totals };
  }

  models(): string[] {
    return (this.db.prepare('select distinct model from usage_records order by model').all() as { model: string }[])
      .map(r => r.model)
      .filter(Boolean);
  }
}
