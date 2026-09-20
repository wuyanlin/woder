/**
 * Electron 主进程入口
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import * as pty from 'node-pty';
import { Planner } from '../core/planner';
import { MemoryManager } from '../core/memory';
import { FileSkill } from '../skills/file-skill';
import { AIEngine } from '../core/ai-engine';
import { Executor } from '../core/executor';
import { HistoryMessage, RequestImage, ThinkingLevel, estimateTokens, localDigest, normalizeThinking, snapContextWindow } from '../core/context';
import { UsageStore } from './usage-store';

let mainWindow: BrowserWindow | null = null;

const memoryManager = new MemoryManager();
const fileSkill = new FileSkill();
const planner = new Planner();
const usageStore = new UsageStore();

interface SavedAIConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  models?: string[];
}

/**
 * 一个模型 = 一份独立配置：各自的 Model ID / Base URL / Key。
 * 老版本只能一个 Key 配多个 Model ID，这里迁移成多条 profile。
 */
interface ModelProfile {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  /** 以下三项是「管理模型」窗口里的偏好，跟密钥无关，保存密钥列表时不能被冲掉 */
  thinking: ThinkingLevel;
  contextWindow: number;
  visible: boolean;
}

interface AISettings {
  activeId: string;
  profiles: ModelProfile[];
}

/** 发给渲染层的形状：只带 hasKey，绝不下发密钥本身 */
interface PublicProfile {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  thinking: ThinkingLevel;
  contextWindow: number;
  visible: boolean;
}

function newProfileId(seed: string): string {
  return `mp_${Buffer.from(seed).toString('base64url').slice(0, 24)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 收一份可能来自老版本 / 渲染层残缺的配置。
 * fallback 是同一 id 已存的那条：密钥列表保存时不会带偏好字段，靠它把偏好留住。
 */
function normalizeProfile(raw: any, fallback?: ModelProfile): ModelProfile {
  const model = String(raw?.model ?? '').trim();
  const baseUrl = String(raw?.baseUrl ?? '').trim();
  const thinking = raw?.thinking === undefined ? fallback?.thinking : raw.thinking;
  const contextWindow = raw?.contextWindow === undefined ? fallback?.contextWindow : raw.contextWindow;
  const visible = raw?.visible === undefined ? fallback?.visible : raw.visible;
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : newProfileId(`${model}|${baseUrl}`),
    label: String(raw?.label ?? '').trim() || model || '未命名模型',
    baseUrl,
    model,
    apiKey: String(raw?.apiKey ?? ''),
    thinking: normalizeThinking(thinking),
    contextWindow: snapContextWindow(contextWindow),
    visible: visible === undefined ? true : !!visible
  };
}

function loadAISettings(): AISettings {
  const stored = memoryManager.getPreference('aiConfig') as any;

  if (stored && Array.isArray(stored.profiles)) {
    const profiles: ModelProfile[] = stored.profiles
      .map((raw: any) => normalizeProfile(raw))
      .filter((p: ModelProfile) => p.model || p.apiKey);
    const activeId = profiles.some(p => p.id === stored.activeId) ? stored.activeId : (profiles[0]?.id ?? '');
    return { activeId, profiles };
  }

  const legacy = stored as SavedAIConfig | undefined;
  const ids = [...new Set((legacy?.models ?? []).map(m => String(m).trim()).filter(Boolean))];
  if (legacy?.model && !ids.includes(legacy.model)) ids.unshift(legacy.model);

  const profiles: ModelProfile[] = ids.map(model => normalizeProfile({ model, baseUrl: legacy?.baseUrl ?? '', apiKey: legacy?.apiKey ?? '' }));

  const active = profiles.find(p => p.model === legacy?.model) ?? profiles[0];
  return { activeId: active?.id ?? '', profiles };
}

let aiSettings: AISettings = loadAISettings();

function activeProfile(): ModelProfile | undefined {
  return aiSettings.profiles.find(p => p.id === aiSettings.activeId);
}

/** 把当前选中的 profile 推进 AIEngine：引擎只认一份生效配置 */
function syncEngine(): void {
  const profile = activeProfile();
  aiEngine.setConfig({
    apiKey: profile?.apiKey ?? '',
    baseUrl: profile?.baseUrl ?? '',
    model: profile?.model ?? '',
    thinking: profile?.thinking ?? 'off',
    contextWindow: profile?.contextWindow
  });
}

function persistAISettings(): void {
  memoryManager.savePreference('aiConfig', aiSettings);
  syncEngine();
}

/** 渲染层能看到的配置：所有 ai:* 回执都用它，密钥只以 hasKey 形式出现 */
function publicSettings() {
  const profiles: PublicProfile[] = aiSettings.profiles.map(p => ({
    id: p.id,
    label: p.label,
    baseUrl: p.baseUrl,
    model: p.model,
    hasKey: !!p.apiKey,
    thinking: p.thinking,
    contextWindow: p.contextWindow,
    visible: p.visible
  }));
  return { activeId: aiSettings.activeId, profiles, configured: aiEngine.isConfigured() };
}

const aiEngine = new AIEngine(
  { apiKey: '', baseUrl: '', model: '' },
  memoryManager,
  process.cwd()
);
// 引擎的初值直接取迁移后的选中模型，避免再读一遍老字段
syncEngine();

/* ---------------- 工作区注册表 ---------------- */

export interface WorkspaceMeta {
  id: string;
  path: string;
  name: string;
  pinned: boolean;
  createdAt: number;
}

const executors = new Map<string, Executor>();

function executorFor(workspace: WorkspaceMeta): Executor {
  let executor = executors.get(workspace.id);
  if (!executor) {
    fileSkill.authorizePath(workspace.path);
    executor = new Executor(fileSkill, { call: browserCall }, aiEngine, workspace.path);
    executors.set(workspace.id, executor);
  }
  return executor;
}

function makeWorkspace(dir: string): WorkspaceMeta {
  return {
    id: `ws_${Buffer.from(path.resolve(dir)).toString('base64url')}`,
    path: path.resolve(dir),
    name: path.basename(path.resolve(dir)),
    pinned: false,
    createdAt: Date.now()
  };
}

/** 工作区列表可以为空：首次启动不再拿 process.cwd() 兜一个默认工作区，由用户自己挑目录 */
function loadWorkspaces(): WorkspaceMeta[] {
  const stored = memoryManager.getPreference('workspaces') as WorkspaceMeta[] | undefined;
  return (stored ?? []).filter(w => w?.path && fs.existsSync(w.path));
}

let workspaces = loadWorkspaces();
workspaces.forEach(w => fileSkill.authorizePath(w.path));

function persistWorkspaces(): void {
  memoryManager.savePreference('workspaces', workspaces);
}

function findWorkspace(id?: string | null): WorkspaceMeta {
  const found = workspaces.find(w => w.id === id) ?? workspaces[0];
  if (!found) throw new Error('没有可用的工作区');
  return found;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#f7f7f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 内置浏览器用的是 <webview>。访客页拿不到这个 preload，也没有 node 能力
      webviewTag: true
    }
  });

  // 渲染层一刷新，它那些终端视图就全没了；pty 不跟着收就是每次刷新留一个孤儿 shell
  mainWindow.webContents.on('did-start-loading', () => {
    termSessions.forEach((proc, id) => {
      termSessions.delete(id);
      try {
        proc.kill();
      } catch {
        /* 已经自己退了 */
      }
    });
  });

  // Electron 28 的 <webview> 去掉了 new-window 事件，弹窗请求只剩主进程这一条拦截口：
  // 拒绝开新窗口，把 url 连同发起者的 guest id 推回渲染层，由它在当前页签里跳转
  mainWindow.webContents.on('did-attach-webview', (_e, guest) => {
    guest.setWindowOpenHandler(({ url }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browser:popup', { guestId: guest.id, url });
      }
      return { action: 'deny' };
    });
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/* ---------------- 用量查询（页面在主窗口的弹出层里） ---------------- */

ipcMain.handle('usage:query', (_e, filter: any) => {
  const from = Number(filter?.from);
  const to = Number(filter?.to);
  const model = String(filter?.model ?? '');
  const { rows, totals } = usageStore.query({
    from: Number.isFinite(from) ? from : undefined,
    to: Number.isFinite(to) ? to : undefined,
    model: model || undefined,
    limit: Number(filter?.limit)
  });
  return { success: true, rows, totals, models: usageStore.models() };
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function emit(event: unknown) {
  mainWindow?.webContents.send('task:event', event);
}

/* ---------------- 内置浏览器桥 ---------------- */

/**
 * 浏览器活在渲染层（<webview>），执行器活在主进程，所以每条 browser.* 动作
 * 都得下发给界面、等它把结果回上来。reqId 关联请求和回执，超时兜底，
 * 免得渲染层没接住时计划永远卡在「执行中」。
 */
const browserPending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

function browserCall(cmd: string, params: Record<string, any>, timeoutMs = 25_000): Promise<any> {
  const wc = mainWindow?.webContents;
  if (!wc || wc.isDestroyed()) return Promise.reject(new Error('界面还没就绪，稍等一下再试'));

  const reqId = `bq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browserPending.delete(reqId);
      reject(new Error(`浏览器「${cmd}」${Math.round(timeoutMs / 1000)} 秒内没有响应`));
    }, timeoutMs);
    browserPending.set(reqId, { resolve, reject, timer });
    wc.send('browser:command', { reqId, cmd, params: params ?? {} });
  });
}

ipcMain.handle('browser:reply', (_e, payload: any) => {
  const reqId = String(payload?.reqId ?? '');
  const pending = browserPending.get(reqId);
  if (!pending) return { success: false, message: '这个请求已经过期了' };
  browserPending.delete(reqId);
  clearTimeout(pending.timer);
  if (payload?.error) pending.reject(new Error(String(payload.error).slice(0, 300)));
  else pending.resolve(payload.data);
  return { success: true };
});

/** 只放行 http/https，别把 file:// 或 javascript: 递给系统浏览器 */
function safeHttpUrl(raw: unknown): string {
  const s = String(raw ?? '').trim();
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new Error('地址不合法');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`只支持打开 http/https 地址，不支持 ${url.protocol}`);
  }
  return url.toString();
}

ipcMain.handle('browser:open-external', async (_e, url: unknown) => {
  try {
    await shell.openExternal(safeHttpUrl(url));
    return { success: true };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
});

/**
 * 本机正在监听的端口，内置浏览器首页的「Local」分组就列这些。
 * lsof 的列数会因为命令名带空格而变（"Google Chrome"），所以从 TCP 那一列往后找地址。
 */
ipcMain.handle('browser:local-services', async () => {
  const stdout = await new Promise<string>(resolve => {
    execFile('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { timeout: 4000 }, (err, out) => resolve(err ? '' : out));
  });

  const seen = new Map<number, { port: number; name: string }>();
  stdout.split('\n').forEach(line => {
    const cols = line.trim().split(/\s+/);
    const at = cols.findIndex(c => c === 'TCP');
    const addr = at >= 0 ? cols[at + 1] ?? '' : '';
    const host = addr.slice(0, addr.lastIndexOf(':'));
    const port = Number(addr.slice(addr.lastIndexOf(':') + 1));
    if (!Number.isInteger(port) || port <= 0) return;
    if (!/^(127\.0\.0\.1|localhost|\*|\[::1\]|\[::\])$/.test(host)) return;
    if (!seen.has(port)) seen.set(port, { port, name: cols[0].replace(/\\x20/g, ' ') });
  });

  return { success: true, services: [...seen.values()].sort((a, b) => a.port - b.port).slice(0, 12) };
});

/* ---------------- 内置终端：node-pty 会话 ---------------- */

const termSessions = new Map<string, pty.IPty>();

function termEvent(payload: Record<string, unknown>) {
  mainWindow?.webContents.send('term:event', payload);
}

ipcMain.handle('term:create', async (_e, id: unknown, workspaceId?: string) => {
  const sid = String(id ?? '').slice(0, 40);
  if (!sid) return { success: false, message: '终端会话缺少 id' };
  if (termSessions.has(sid)) return { success: true };

  /* Windows 上没有 SHELL 这个环境变量，而且 cmd.exe 不认交互式标志 */
  const shellFile = process.platform === 'win32' ? process.env.COMSPEC || 'cmd.exe' : process.env.SHELL || '/bin/zsh';
  const shellArgs = process.platform === 'win32' ? [] : ['-i'];
  try {
    const workspace = findWorkspace(workspaceId);
    const proc = pty.spawn(shellFile, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: workspace.path,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'woder' } as Record<string, string>
    });
    proc.onData(data => termEvent({ type: 'data', id: sid, data }));
    proc.onExit(({ exitCode }) => {
      termSessions.delete(sid);
      termEvent({ type: 'exit', id: sid, exitCode });
    });
    termSessions.set(sid, proc);
    return { success: true, pid: proc.pid, cwd: workspace.path };
  } catch (error) {
    return { success: false, message: `启动终端失败：${(error as Error).message}` };
  }
});

ipcMain.handle('term:write', (_e, id: unknown, data: unknown) => {
  termSessions.get(String(id))?.write(String(data ?? ''));
  return { success: true };
});

ipcMain.handle('term:resize', (_e, id: unknown, cols: unknown, rows: unknown) => {
  const proc = termSessions.get(String(id));
  const c = Math.max(2, Math.min(400, Number(cols) || 80));
  const r = Math.max(1, Math.min(200, Number(rows) || 24));
  try {
    proc?.resize(c, r);
  } catch {
    /* 进程刚退出时 resize 会抛，忽略 */
  }
  return { success: true };
});

ipcMain.handle('term:close', (_e, id: unknown) => {
  const sid = String(id);
  const proc = termSessions.get(sid);
  if (!proc) return { success: true };
  termSessions.delete(sid);
  try {
    proc.kill();
  } catch {
    /* 已经自己退了 */
  }
  return { success: true };
});

app.on('before-quit', () => {
  termSessions.forEach(proc => {
    try {
      proc.kill();
    } catch {
      /* 已经自己退了 */
    }
  });
});

/**
 * 规划需求 → 计划（不落盘执行）
 *
 * aiEngine 的 workspace 是共享可变状态，多次规划并发会串台，所以排成一条队再执行。
 */
let planQueue: Promise<unknown> = Promise.resolve();

function planSerialized<T>(workspacePath: string, job: () => Promise<T>): Promise<T> {
  const run = planQueue.then(async () => {
    aiEngine.setWorkspace(workspacePath);
    return job();
  });
  planQueue = run.then(() => undefined, () => undefined);
  return run;
}

/** 本轮用的模型标识，界面hover时告诉用户这句话是谁说的 */
function activeModelInfo() {
  const profile = activeProfile();
  return { id: profile?.model ?? '', label: profile?.label ?? '' };
}

/**
 * 渲染层传来的会话历史。这里必须做和上下文统计一样的清洗，
 * 否则界面上的百分比和真实发出去的内容会对不上。
 */
function normalizeHistory(raw: unknown): HistoryMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(m => m && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: String(m.content).slice(0, 1200) }))
    .slice(-24);
}

/** 一轮最多带 4 张图，单张 base64 上限 3MB，再多请求就要爆了 */
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 3_000_000;

function normalizeImages(raw: unknown): RequestImage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a: any) => typeof a?.dataUrl === 'string' && a.dataUrl.startsWith('data:image/'))
    .slice(0, MAX_IMAGES)
    .map((a: any) => ({
      name: String(a.name ?? '图片').slice(0, 80),
      mime: String(a.mime ?? 'image/*').slice(0, 40),
      dataUrl: String(a.dataUrl).slice(0, MAX_IMAGE_CHARS)
    }));
}

ipcMain.handle('task:plan', async (_e, request: unknown, workspaceId?: string, rawHistory?: unknown, rawImages?: unknown) => {
  const workspace = findWorkspace(workspaceId);
  const text = String(request ?? '').slice(0, 4000);
  const history = normalizeHistory(rawHistory);
  const images = normalizeImages(rawImages);

  return planSerialized(workspace.path, async () => {
    // 界面同一时刻只跑一个任务，所以「开始清零 + 结束取走」就能得到本轮规划用量
    aiEngine.drainUsage();
    const startedAt = Date.now();
    const model = activeModelInfo();
    const done = (payload: any) => {
      const usage = aiEngine.drainUsage();
      // 每条发出去的消息先落一行；执行阶段的用量由 task:execute-plan 按 id 续加
      const usageRecordId = usageStore.record(text, model.id || '未配置模型', 'Woder', usage);
      return { ...payload, model, planMs: Date.now() - startedAt, usage, usageRecordId };
    };

    if (!aiEngine.canPlan()) {
      const plan = await planner.planTask(text);
      return done({ success: true, data: { ...plan, request: text }, source: 'fallback' as const, reason: '' });
    }

    try {
      const plan = await aiEngine.enhanceTaskPlan(text, history, images);
      return done({ success: true, data: { ...plan, request: text }, source: 'ai' as const });
    } catch (aiError) {
      const plan = await planner.planTask(text);
      return done({
        success: true,
        data: { ...plan, request: text },
        source: 'fallback' as const,
        reason: String(aiError)
      });
    }
  });
});

/**
 * 当前会话的上下文占用：分区 token、总用量、窗口大小。
 * 走同一条规划队列，避免正在规划时把引擎的工作区改掉。
 */
ipcMain.handle('context:stat', async (_e, payload: any, workspaceId?: string) => {
  const workspace = findWorkspace(workspaceId);
  const history = normalizeHistory(payload?.history);
  const request = String(payload?.request ?? '').slice(0, 4000);

  return planSerialized(workspace.path, async () => ({
    success: true,
    model: activeModelInfo(),
    ai: aiEngine.canPlan(),
    workspace: workspace.path,
    ...aiEngine.contextStat(history, request)
  }));
});

/**
 * 压缩上下文：把早期问答交给模型摘要，压不动就本地兜底。
 * 无论哪条路都一定返回一段文本，界面不会出现「点了没反应」。
 */
ipcMain.handle('context:compact', async (_e, payload: any, workspaceId?: string) => {
  const workspace = findWorkspace(workspaceId);
  const lines = ((Array.isArray(payload?.lines) ? payload.lines : []) as unknown[])
    .map((line: unknown) => String(line).slice(0, 900))
    .filter(Boolean)
    .slice(0, 40);
  if (!lines.length) return { success: false, message: '这个会话还没有可压缩的历史' };

  return planSerialized(workspace.path, async () => {
    aiEngine.drainUsage();
    const startedAt = Date.now();
    let text = '';
    let source: 'ai' | 'local' = 'local';
    let reason = '';

    try {
      if (!aiEngine.canPlan()) throw new Error('未接入可用模型');
      text = await aiEngine.compactContext(lines);
      source = 'ai';
    } catch (error) {
      reason = String(error).replace(/^Error:\s*/, '').slice(0, 90);
      text = localDigest(lines);
    }

    return {
      success: true,
      text,
      source,
      reason,
      tokens: estimateTokens(text),
      compactMs: Date.now() - startedAt,
      usage: aiEngine.drainUsage()
    };
  });
});

/**
 * 执行已确认的计划，过程通过 task:event 推送
 */
ipcMain.handle('task:execute-plan', async (_e, plan: any, workspaceId?: string, usageRecordId?: unknown) => {
  const steps = Array.isArray(plan?.steps)
    ? plan.steps.filter((s: any) => s && typeof s.action === 'string')
    : [];
  if (steps.length === 0) return { success: false, message: '计划里没有可执行的步骤' };

  const workspace = findWorkspace(workspaceId);
  aiEngine.setWorkspace(workspace.path);
  // 这里记真实路径。之前塞的是需求原话，会让规划提示里的「最近操作过的路径」
  // 变成一堆历史需求，把模型往「凡事先列目录」上带偏。
  const touched = steps
    .flatMap((s: any) => [s?.params?.path, s?.params?.from, s?.params?.to])
    .filter((v: any) => typeof v === 'string' && v.trim())
    .map((v: any) => String(v).slice(0, 120))
    .slice(0, 5);
  touched.forEach((p: string) => memoryManager.addRecentFile(p));

  aiEngine.drainUsage();
  const startedAt = Date.now();
  const summary = await executorFor(workspace).run({ ...plan, steps }, emit);
  const usage = aiEngine.drainUsage();
  // 执行阶段只有 ai.summarize 会调模型，没调过就是 0，界面按 0 显示；
  // 有值则并回这条消息在 task:plan 落的那行用量
  usageStore.addUsage(Number(usageRecordId) || 0, usage);
  return { success: true, summary, runMs: Date.now() - startedAt, usage };
});

/**
 * 保存模型列表。渲染层每次提交整份列表：
 * - 带 id 的条目视为编辑，apiKey 留空表示沿用已保存的密钥
 * - 不带 id 的条目视为新增
 * - 列表里消失的条目即删除
 */
ipcMain.handle('ai:set-config', async (_e, config: any) => {
  const incoming: any[] = Array.isArray(config?.profiles) ? config.profiles : [];
  const byId = new Map(aiSettings.profiles.map(p => [p.id, p]));
  const usedIds = new Set<string>();
  const profiles: ModelProfile[] = [];

  for (const raw of incoming.slice(0, 20)) {
    // 认得 id 就是编辑；渲染层给的新 id（新卡片）照用，撞车才重新生成
    const stored = raw?.id ? byId.get(raw.id) : undefined;
    const draft = normalizeProfile(raw, stored);
    if (!draft.model) return { success: false, message: `「${draft.label}」还缺一个 Model ID` };

    let id = stored?.id ?? draft.id;
    if (usedIds.has(id)) id = newProfileId(`${draft.model}|${draft.baseUrl}`);
    usedIds.add(id);

    // 没填 Key 的新卡片，若能对上已存条目的 Model ID + Base URL，就复用那份密钥
    const twin = stored ?? (!draft.apiKey
      ? aiSettings.profiles.find(p => p.model === draft.model && p.baseUrl === draft.baseUrl)
      : undefined);
    // 卡片上点了「清除密钥」才真的清；留空表示沿用已保存的那份
    const apiKey = raw?.clearKey ? '' : (draft.apiKey || twin?.apiKey || '');

    profiles.push({ ...draft, id, apiKey });
  }

  const wanted = typeof config?.activeId === 'string' ? config.activeId : '';
  const previous = aiSettings.activeId;
  aiSettings = {
    profiles,
    activeId: profiles.some(p => p.id === wanted)
      ? wanted
      : profiles.some(p => p.id === previous)
        ? previous
        : (profiles[0]?.id ?? '')
  };
  persistAISettings();
  return { success: true, ...publicSettings() };
});

/**
 * 保存「管理模型」窗口里的偏好。只按 id 改这三项，
 * 不碰 Model ID / Base URL / 密钥，所以跟齿轮那个密钥弹窗互不影响。
 */
ipcMain.handle('ai:set-prefs', async (_e, payload: any) => {
  const incoming: any[] = Array.isArray(payload?.prefs) ? payload.prefs : [];
  const byId = new Map(incoming.map(p => [String(p?.id ?? ''), p]));

  aiSettings = {
    ...aiSettings,
    profiles: aiSettings.profiles.map(p => {
      const raw = byId.get(p.id);
      if (!raw) return p;
      return {
        ...p,
        thinking: normalizeThinking(raw.thinking ?? p.thinking),
        contextWindow: snapContextWindow(raw.contextWindow ?? p.contextWindow),
        visible: raw.visible === undefined ? p.visible : !!raw.visible
      };
    })
  };
  persistAISettings();
  return { success: true, ...publicSettings() };
});

/** 切换当前使用的模型 */
ipcMain.handle('ai:set-active', async (_e, id: string) => {
  if (!aiSettings.profiles.some(p => p.id === id)) return { success: false, message: '模型不在已保存的列表中' };
  aiSettings.activeId = id;
  persistAISettings();
  return { success: true, ...publicSettings() };
});

/** 只清密钥，模型条目保留 */
ipcMain.handle('ai:reset', async () => {
  aiSettings.profiles = aiSettings.profiles.map(p => ({ ...p, apiKey: '' }));
  persistAISettings();
  return { success: true, ...publicSettings() };
});

ipcMain.handle('ai:get-config', async () => ({ success: true, ...publicSettings() }));

interface TreeNode {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  children?: TreeNode[];
}

const IGNORED = new Set(['node_modules', '.git', 'dist', '.DS_Store', '.qoder']);

/**
 * 工作区注册表：新增 / 重命名 / 置顶 / 移除
 */
ipcMain.handle('workspace:list', async () => ({ success: true, workspaces }));

ipcMain.handle('workspace:add', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '添加工作区',
    buttonLabel: '添加',
    properties: ['openDirectory', 'createDirectory']
  });
  if (canceled || !filePaths.length) return { success: true, canceled: true, workspaces };

  const dir = filePaths[0];
  if (!workspaces.some(w => w.path === dir)) {
    workspaces = [...workspaces, makeWorkspace(dir)];
    persistWorkspaces();
  }
  return { success: true, canceled: false, workspaces };
});

ipcMain.handle('workspace:update', async (_e, id: string, patch: { name?: string; pinned?: boolean }) => {
  const target = workspaces.find(w => w.id === id);
  if (!target) return { success: false, message: '工作区不存在' };

  if (typeof patch.name === 'string' && patch.name.trim()) target.name = patch.name.trim().slice(0, 40);
  if (typeof patch.pinned === 'boolean') {
    target.pinned = patch.pinned;
    // 置顶的工作区整体前移，保持彼此之间的相对顺序
    workspaces = [...workspaces.filter(w => w.pinned), ...workspaces.filter(w => !w.pinned)];
  }
  persistWorkspaces();
  return { success: true, workspaces };
});

/**
 * 仅从侧栏移除，不删除磁盘文件
 */
ipcMain.handle('workspace:remove', async (_e, id: string) => {
  workspaces = workspaces.filter(w => w.id !== id);
  persistWorkspaces();
  return { success: true, workspaces };
});

/**
 * 工作区文件树，供右侧「工作区文件」标签展示
 */
ipcMain.handle('workspace:tree', async (_e, workspaceId?: string) => {
  const workspace = findWorkspace(workspaceId);
  const walk = (dir: string, depth: number): TreeNode[] => {
    if (depth > 4) return [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter(e => !IGNORED.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map(e => {
        const node: TreeNode = {
          name: e.name,
          path: path.relative(workspace.path, path.join(dir, e.name)),
          kind: e.isDirectory() ? 'directory' : 'file'
        };
        if (e.isDirectory()) node.children = walk(path.join(dir, e.name), depth + 1);
        return node;
      });
  };

  return { success: true, workspace: workspace.path, tree: walk(workspace.path, 0) };
});

/**
 * 会话列表持久化：只保留最近 40 个会话，每个会话最近 20 轮
 */
ipcMain.handle('sessions:load', async () => {
  const sessions = (memoryManager.getPreference('sessions') as any[]) ?? [];
  // 旧数据只有路径，按路径回填 workspaceId
  const normalized = sessions.map(s => {
    if (!s.workspaceId) s.workspaceId = workspaces.find(w => w.path === s.workspace)?.id ?? null;
    return s;
  });
  return { success: true, sessions: normalized };
});

ipcMain.handle('sessions:save', async (_e, sessions: any[]) => {
  const trimmed = (sessions ?? []).slice(-40).map(s => {
    const turns = s.turns ?? [];
    const dropped = Math.max(0, turns.length - 20);
    return {
      ...s,
      // 轮次被裁掉时，「压缩到第几轮」这个下标也要跟着往前挪，否则摘要卡片会错位
      compressedThrough: Math.max(0, (s.compressedThrough ?? 0) - dropped),
      turns: turns.slice(-20)
    };
  });
  memoryManager.savePreference('sessions', trimmed);
  return { success: true };
});

/** 查看器一次读一个文件：超过 2MB 的不进编辑器，二进制按 NUL 头判定 */
const READ_LIMIT = 2 * 1024 * 1024;

const inWorkspace = (root: string, relPath: string) => {
  const abs = path.resolve(root, relPath);
  return abs === path.resolve(root) || abs.startsWith(path.resolve(root) + path.sep) ? abs : null;
};

ipcMain.handle('workspace:read', async (_e, relPath: string, workspaceId?: string) => {
  const workspace = findWorkspace(workspaceId);
  const abs = inWorkspace(workspace.path, relPath);
  if (!abs) return { success: false, message: '路径越界' };
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return { success: false, message: '文件不存在' };
  }
  if (!stat.isFile()) return { success: false, message: '这不是一个文件' };
  if (stat.size > READ_LIMIT) {
    return { success: false, message: `文件有 ${Math.round(stat.size / 1024)} KB，太大，暂不在应用里打开` };
  }
  const buf = fs.readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) return { success: false, message: '二进制文件，无法预览或编辑' };
  return { success: true, content: buf.toString('utf-8'), mtime: stat.mtimeMs };
});

/**
 * 保存查看器里的编辑结果。baseMtime 是打开时读到的修改时间：
 * 对不上说明文件在这期间被改过（多半是执行器刚写了一轮），直接落盘会把人家的改动盖掉。
 */
ipcMain.handle('workspace:write', async (_e, relPath: string, content: string, workspaceId?: string, baseMtime?: number) => {
  const workspace = findWorkspace(workspaceId);
  const abs = inWorkspace(workspace.path, relPath);
  if (!abs) return { success: false, message: '路径越界' };
  if (typeof content !== 'string') return { success: false, message: '内容不合法' };
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return { success: false, message: '文件不存在' };
  }
  if (Number.isFinite(baseMtime) && stat.mtimeMs - (baseMtime as number) > 0.5) {
    return { success: false, conflict: true, message: '文件在这期间被外部改过，保存会覆盖那份改动' };
  }
  fs.writeFileSync(abs, content, 'utf-8');
  return { success: true, mtime: fs.statSync(abs).mtimeMs };
});
