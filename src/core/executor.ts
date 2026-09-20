/**
 * 执行器 - 按计划依赖顺序逐步执行，并向渲染层推送事件
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { TaskPlan, TaskStep } from './planner';
import { FileSkill } from '../skills/file-skill';
import { AIEngine } from './ai-engine';
import { diffLines, FileDiff } from './diff';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * 内置浏览器活在渲染层，主进程只能把动作下发过去等回执。
 * 由主进程注入实现，执行器不关心 IPC 细节。
 */
export interface BrowserBridge {
  call(cmd: string, params: Record<string, any>, timeoutMs?: number): Promise<any>;
}

export interface ExecutionEvent {
  taskId: string;
  stepId: string;
  stepName: string;
  status: StepStatus;
  tool: string;
  input: Record<string, any>;
  output?: string;
  error?: string;
  diff?: FileDiff;
  timestamp: number;
}

export type EventSink = (event: ExecutionEvent) => void;

/** 向用户提问要等多久：半小时够人去干别的，再久就当这一步失败，别把任务永久挂住 */
const ASK_TIMEOUT_MS = 30 * 60_000;

export interface ExecutionSummary {
  taskId: string;
  completed: number;
  failed: number;
  skipped: number;
  diffs: FileDiff[];
}

export class Executor {
  constructor(
    private files: FileSkill,
    private browser: BrowserBridge,
    private ai: AIEngine,
    private workspace: string
  ) {}

  /**
   * 把相对路径解析到工作区内，并阻止越界访问
   */
  private resolve(p: string): string {
    const root = path.resolve(this.workspace);
    const raw = typeof p === 'string' && p.trim() ? p.trim() : '.';
    const normalized = path.resolve(path.isAbsolute(raw) ? raw : path.join(root, raw));
    // 只比较前缀会放过 woder-backup 这种同级目录，必须带上分隔符
    if (normalized !== root && !normalized.startsWith(root + path.sep)) {
      throw new Error(`路径超出工作区范围: ${p}`);
    }
    return normalized;
  }

  async run(plan: TaskPlan, emit: EventSink): Promise<ExecutionSummary> {
    const status = new Map<string, StepStatus>();
    const diffs: FileDiff[] = [];
    let completed = 0;
    let failed = 0;
    let skipped = 0;

    plan.steps.forEach(s => status.set(s.id, 'pending'));

    // 逐步推进：每轮找出依赖已满足的步骤，串行执行以保证顺序可观察
    let remaining = plan.steps.slice();
    let guard = 0;
    // 上一步的输出：ai.summarize 不带 text/path 时拿它，open→read→总结才连得起来
    let lastOutput = '';

    while (remaining.length > 0 && guard++ < plan.steps.length * 2) {
      const ready = remaining.filter(s =>
        (s.dependsOn ?? []).every(dep => {
          const depStatus = status.get(dep);
          return depStatus === 'completed' || depStatus === 'failed' || depStatus === 'skipped';
        })
      );

      if (ready.length === 0) {
        // 存在循环依赖或依赖缺失，剩余步骤标记跳过
        for (const s of remaining) {
          status.set(s.id, 'skipped');
          skipped++;
          emit(this.event(plan.taskId, s, 'skipped', '依赖无法满足，已跳过'));
        }
        break;
      }

      for (const step of ready) {
        const blocked = (step.dependsOn ?? []).some(dep => status.get(dep) !== 'completed');
        remaining = remaining.filter(s => s.id !== step.id);

        if (blocked) {
          status.set(step.id, 'skipped');
          skipped++;
          emit(this.event(plan.taskId, step, 'skipped', '前置步骤未成功，已跳过'));
          continue;
        }

        status.set(step.id, 'running');
        emit(this.event(plan.taskId, step, 'running'));

        try {
          const { output, diff } = await this.dispatch(step, lastOutput);
          if (output) lastOutput = output;
          if (diff) diffs.push(diff);
          status.set(step.id, 'completed');
          completed++;
          emit(this.event(plan.taskId, step, 'completed', output, undefined, diff));
        } catch (err) {
          status.set(step.id, 'failed');
          failed++;
          emit(this.event(plan.taskId, step, 'failed', undefined, (err as Error).message));
        }
      }
    }

    return { taskId: plan.taskId, completed, failed, skipped, diffs };
  }

  private event(
    taskId: string,
    step: TaskStep,
    status: StepStatus,
    output?: string,
    error?: string,
    diff?: FileDiff
  ): ExecutionEvent {
    return {
      taskId,
      stepId: step.id,
      stepName: step.name,
      status,
      tool: step.action,
      input: step.params ?? {},
      output,
      error,
      diff,
      timestamp: Date.now()
    };
  }

  /**
   * 在工作区内跑一条终端命令。
   * 输出可能非常大（npm install、find），所以只留头尾；
   * 非零退出码按失败处理，并把输出尾巴塞进错误信息，界面第三层才有东西可看。
   */
  private runShell(command: string, cwd: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const child = spawn(command, { cwd, shell: true, env: process.env });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        reject(new Error(
          `命令超过 ${Math.round(timeoutMs / 1000)} 秒未结束，已终止\n${this.shellText(stdout, stderr) || '(此前无输出)'}`
        ));
      }, timeoutMs);

      child.stdout?.on('data', chunk => { stdout += String(chunk); });
      child.stderr?.on('data', chunk => { stderr += String(chunk); });
      child.on('error', err => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', code => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const body = this.shellText(stdout, stderr);
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        if (code === 0) resolve(`${body || '(无输出)'}\n[退出码 0 · ${elapsed} 秒]`);
        else reject(new Error(`命令退出码 ${code} · ${elapsed} 秒\n${body || '(无输出)'}`));
      });
    });
  }

  /** stdout / stderr 按预算各留头尾，中间用省略号接起来 */
  private shellText(stdout: string, stderr: string, budget = 4000): string {
    const keep = (text: string, max: number) => {
      const value = text.trimEnd();
      if (value.length <= max) return value;
      const head = value.slice(0, Math.floor(max * 0.65));
      const tail = value.slice(-Math.floor(max * 0.3));
      return `${head}\n⋯ 省略 ${value.length - head.length - tail.length} 字 ⋯\n${tail}`;
    };
    const out = keep(stdout, Math.floor(budget * 0.7));
    const err = keep(stderr, Math.floor(budget * 0.3));
    return [out && `输出：\n${out}`, err && `错误输出：\n${err}`].filter(Boolean).join('\n\n');
  }

  /**
   * 把页面读成模型接着能用的文本：正文 + 一份带序号的可交互元素清单。
   * 后续 browser.click 直接报序号，比让模型猜 CSS 选择器靠谱得多。
   */
  private pageText(res: any): string {
    const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
    const items: any[] = Array.isArray(res?.interactive) ? res.interactive : [];
    const kind = (n: any) =>
      n.tag === 'a' ? '链接'
        : n.tag === 'button' ? '按钮'
        : n.tag === 'input' ? `输入框(${n.type || 'text'})`
        : n.tag === 'textarea' ? '文本域'
        : n.tag === 'select' ? '下拉框'
        : clean(n.tag) || '元素';
    const list = items
      .map(n => `  [${n.i}] ${kind(n)} ${n.text ? `「${n.text}」` : '(无文字)'}${n.href ? ` → ${n.href}` : ''}`)
      .join('\n');

    return [
      `标题：${clean(res?.title) || '(无标题)'}`,
      `地址：${clean(res?.url)}`,
      '',
      '正文：',
      clean(res?.text) || '(没有可读文本)',
      '',
      items.length ? `可点击元素（browser.click 用 index）：\n${list}` : '可点击元素：无'
    ].join('\n');
  }

  /** 截图落到工作区的 screenshots/；文件名里的非法字符一律去掉，别让它跑出目录 */
  private saveShot(dataUrl: string, name: string): string {
    const match = dataUrl.match(/^data:image\/(png|jpeg);base64,([\s\S]+)$/);
    if (!match) throw new Error('浏览器返回的截图数据不对，未能保存');
    const safe = name.replace(/[^\w.\-]/g, '').slice(0, 60);
    const file = /\.(png|jpe?g)$/.test(safe) ? safe : `browser-${Date.now()}.png`;
    const target = path.join(this.workspace, 'screenshots', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(match[2], 'base64'));
    return path.relative(this.workspace, target);
  }

  private async dispatch(step: TaskStep, lastOutput: string): Promise<{ output?: string; diff?: FileDiff }> {
    const p = step.params ?? {};

    switch (step.action) {
      case 'ai.answer': {
        // 纯回复：不动文件系统，把模型想说的话原样交给界面
        const text = typeof p.text === 'string' ? p.text.trim() : '';
        if (!text) throw new Error('ai.answer 缺少 text');
        return { output: text };
      }

      case 'ask.user': {
        // 问答卡活在渲染层，下发问题、等用户点选。这一步可能等人想很久，
        // 超时给足半小时，不像浏览器动作那样几秒就该判失败。
        const question = typeof p.question === 'string' ? p.question.trim() : '';
        if (!question) throw new Error('ask.user 缺少 question');
        const options = (Array.isArray(p.options) ? p.options : []).slice(0, 6).map((o: any, i: number) => ({
          label: String(o?.label ?? `选项 ${i + 1}`).slice(0, 60),
          detail: String(o?.detail ?? '').slice(0, 160),
          recommended: !!o?.recommended
        }));
        const res = await this.browser.call('ask.user', { question, options }, ASK_TIMEOUT_MS);
        const answer = String(res?.answer ?? '').trim();
        if (!answer) throw new Error('没有收到回答');
        return { output: answer };
      }

      case 'file.list':
      case 'file.discover': {
        const target = this.resolve(p.path ?? '.');
        const res = this.files.listDirectory(target, !!p.recursive);
        if (!res.success) throw new Error(res.message);
        const list = res.data as Array<{ path: string; type: string }>;
        return {
          output: `${list.length} 个条目\n` +
            list.slice(0, 40).map(e => `  ${e.type === 'directory' ? '▸' : '·'} ${path.relative(this.workspace, e.path)}`).join('\n')
        };
      }

      case 'file.read': {
        const target = this.resolve(p.path);
        const res = this.files.readFile(target);
        if (!res.success) throw new Error(res.message);
        const text = String(res.data);
        return { output: text.length > 2000 ? text.slice(0, 2000) + '\n⋯ 已截断' : text };
      }

      case 'file.write': {
        const target = this.resolve(p.path);
        const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : '';
        const content = typeof p.content === 'string' ? p.content : JSON.stringify(p.content ?? '', null, 2);
        const res = this.files.writeFile(target, content);
        if (!res.success) throw new Error(res.message);
        return {
          output: `${path.relative(this.workspace, target)} 已${before ? '更新' : '创建'}`,
          diff: diffLines(before, content, path.relative(this.workspace, target))
        };
      }

      case 'file.append': {
        const target = this.resolve(p.path);
        const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : '';
        const after = before + (p.content ?? '');
        const res = this.files.writeFile(target, after);
        if (!res.success) throw new Error(res.message);
        return {
          output: `已追加到 ${path.relative(this.workspace, target)}`,
          diff: diffLines(before, after, path.relative(this.workspace, target))
        };
      }

      case 'file.mkdir': {
        const target = this.resolve(p.path);
        const res = this.files.createDirectory(target);
        if (!res.success) throw new Error(res.message);
        return { output: `目录已就绪 ${path.relative(this.workspace, target)}` };
      }

      case 'file.move': {
        const from = this.resolve(p.from);
        const to = this.resolve(p.to);
        const res = this.files.moveFile(from, to);
        if (!res.success) throw new Error(res.message);
        return { output: `${path.relative(this.workspace, from)} → ${path.relative(this.workspace, to)}` };
      }

      case 'file.delete': {
        const target = this.resolve(p.path);
        const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : '';
        const res = this.files.deleteFile(target);
        if (!res.success) throw new Error(res.message);
        return {
          output: `已删除 ${path.relative(this.workspace, target)}`,
          diff: diffLines(before, '', path.relative(this.workspace, target))
        };
      }

      case 'file.classify': {
        const target = this.resolve(p.path ?? '.');
        const res = this.files.classifyByType(target);
        if (!res.success) throw new Error(res.message);
        const groups = res.data as Record<string, string[]>;
        const summary = Object.entries(groups)
          .map(([ext, names]) => `  ${ext || '(无扩展名)'}: ${names.length}`)
          .join('\n');
        return { output: `按类型分组：\n${summary}` };
      }

      case 'ai.summarize': {
        let text = p.text as string | undefined;
        if (!text && p.path) {
          const r = this.files.readFile(this.resolve(p.path));
          if (!r.success) throw new Error(r.message);
          text = String(r.data);
        }
        if (!text && lastOutput) text = lastOutput;
        if (!text) throw new Error('缺少待总结内容');
        if (!this.ai.isConfigured()) throw new Error('未配置 OpenAI API Key，无法执行总结');
        const summary = await this.ai.summarizeText(text, p.maxLength ?? 500);
        return { output: summary };
      }

      case 'shell.run': {
        const command = String(p.command ?? '').trim();
        if (!command) throw new Error('shell.run 缺少 command');
        const cwd = typeof p.cwd === 'string' && p.cwd.trim() ? this.resolve(p.cwd) : this.workspace;
        const timeoutMs = Math.min(Math.max(Number(p.timeoutMs) || 30_000, 1_000), 120_000);
        return { output: await this.runShell(command, cwd, timeoutMs) };
      }

      case 'browser.open':
      case 'browser.navigate': {
        const url = String(p.url ?? '').trim();
        if (!url) throw new Error('browser.open 缺少 url');
        const res = await this.browser.call('open', { url, background: !!p.background }, 40_000);
        return {
          output: [
            `已在内置浏览器打开`,
            `标题：${res.title || '(无标题)'}`,
            `地址：${res.url}`,
            res.note ? `提示：${res.note}` : ''
          ].filter(Boolean).join('\n')
        };
      }

      case 'browser.read': {
        const res = await this.browser.call('read', {
          maxLength: Math.min(Math.max(Number(p.maxLength) || 3000, 500), 12000)
        }, 25_000);
        return { output: this.pageText(res) };
      }

      case 'browser.extract': {
        const selectors = (Array.isArray(p.selectors) ? p.selectors : [p.selector])
          .map((s: any) => String(s ?? '').trim())
          .filter(Boolean);
        if (!selectors.length) throw new Error('browser.extract 缺少 selectors');
        const res = await this.browser.call('extract', { selectors }, 25_000);
        const body = (res.items as Array<{ selector: string; matches: number; texts: string[] }>)
          .map(g => `【${g.selector}】${g.matches} 处\n` + g.texts.map(t => `  · ${t}`).join('\n'))
          .join('\n\n');
        return { output: `${res.url}\n\n${body || '没有匹配到内容'}` };
      }

      case 'browser.click': {
        const res = await this.browser.call('click', {
          index: Number.isInteger(Number(p.index)) ? Number(p.index) : undefined,
          selector: p.selector ? String(p.selector) : undefined,
          text: p.text ? String(p.text) : undefined
        }, 25_000);
        if (!res.ok) throw new Error(res.message ?? '点击失败');
        return { output: `已点击 ${res.target}` };
      }

      case 'browser.type': {
        const text = String(p.text ?? '');
        if (!text) throw new Error('browser.type 缺少 text');
        const res = await this.browser.call('type', {
          text,
          index: Number.isInteger(Number(p.index)) ? Number(p.index) : undefined,
          selector: p.selector ? String(p.selector) : undefined,
          submit: !!p.submit
        }, 25_000);
        if (!res.ok) throw new Error(res.message ?? '填写失败');
        return { output: `已输入「${text.slice(0, 40)}」到 ${res.target}${p.submit ? '，并提交' : ''}` };
      }

      case 'browser.screenshot': {
        const res = await this.browser.call('screenshot', {}, 25_000);
        const rel = this.saveShot(String(res.dataUrl ?? ''), String(p.path ?? p.name ?? ''));
        return { output: `已截取当前页面：${rel}\n页面地址：${res.url}` };
      }

      case 'browser.close': {
        const res = await this.browser.call('close', {});
        return { output: res.closed ? `已关闭 ${res.closed} 个浏览器标签页` : '浏览器本来就没有打开的标签页' };
      }

      case 'wait': {
        await new Promise(r => setTimeout(r, Math.min(Number(p.ms ?? 300), 3000)));
        return { output: `等待 ${p.ms ?? 300}ms` };
      }

      default:
        throw new Error(`不支持的操作类型: ${step.action}`);
    }
  }
}
