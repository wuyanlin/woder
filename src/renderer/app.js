/* ===== Woder 渲染层逻辑 ===== */

const $ = sel => document.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
// 输入法还在选词时，回车属于「确认候选词」而不是「提交」；keyCode 229 兜住 isComposing 为 false 的老内核
const composing = e => e.isComposing || e.keyCode === 229;

const ICON = {
  pending: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/></svg>',
  running: '<svg viewBox="0 0 24 24"><path d="M12 3.5a8.5 8.5 0 108.5 8.5"/></svg>',
  completed: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3l2.6 2.6 5-5.4"/></svg>',
  failed: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>',
  skipped: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.6 12h6.8"/></svg>',
  chev: '<svg viewBox="0 0 24 24" class="i chev"><path d="M9 6l6 6-6 6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" class="i chevron"><path d="M6 9l6 6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" class="i"><path d="M12 6v12M6 12h12"/></svg>',
  pin: '<svg viewBox="0 0 24 24" class="i pin"><path d="M9 4h6l-1 6 3.5 3.5H5.5L9 10z"/><path d="M12 13.5V20"/></svg>',
  file: '<svg viewBox="0 0 24 24" class="i"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/></svg>',
  folder: '<svg viewBox="0 0 24 24" class="i"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>',
  dots: '<svg viewBox="0 0 24 24" class="i"><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>',
  alert: '<svg viewBox="0 0 24 24" class="sess-flag"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5v5.5M12 16.4v.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24" class="i"><path d="M4.5 6.5h15M9.5 6.5V4.2h5v2.3M6.8 6.5l.9 12.3h8.6l.9-12.3"/><path d="M10.3 9.8v6M13.7 9.8v6"/></svg>',
  eye: '<svg viewBox="0 0 24 24" class="i"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  model: '<svg viewBox="0 0 24 24" class="i"><path d="M12 3.6l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z"/></svg>',
  tick: '<svg viewBox="0 0 24 24" class="i"><path d="M5 12.8l4.4 4.4L19 7.6"/></svg>',
  compress: '<svg viewBox="0 0 24 24" class="i"><rect x="3.5" y="5" width="3.4" height="14" rx="1.2"/><rect x="17.1" y="5" width="3.4" height="14" rx="1.2"/><path d="M12 7.5v9M9.8 9.8L12 7.6l2.2 2.2M9.8 14.2L12 16.4l2.2-2.2"/></svg>',
  close: '<svg viewBox="0 0 24 24" class="i"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
  globe: '<svg viewBox="0 0 24 24" class="i"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18"/></svg>',
  terminal: '<svg viewBox="0 0 24 24" class="i"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M7 10l2.6 2.6L7 15.2M12.6 15.4h4.6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" class="i"><path d="M4.5 19.5h4L20 8l-4-4L4.5 15.5z"/><path d="M14.5 5.5l4 4"/></svg>',
  interject: '<svg viewBox="0 0 24 24" class="i"><path d="M9.5 4.5L4.5 9.5l5 5"/><path d="M4.5 9.5H14a5.5 5.5 0 015.5 5.5v4.5"/></svg>',
  grip: '<svg viewBox="0 0 24 24" class="i"><g fill="currentColor" stroke="none"><circle cx="9.5" cy="6" r="1.5"/><circle cx="14.5" cy="6" r="1.5"/><circle cx="9.5" cy="12" r="1.5"/><circle cx="14.5" cy="12" r="1.5"/><circle cx="9.5" cy="18" r="1.5"/><circle cx="14.5" cy="18" r="1.5"/></g></svg>',
  fold: '<svg viewBox="0 0 24 24" class="i"><path d="M14.5 9.5H19.5M14.5 9.5V4.5M14.5 9.5L20 4"/><path d="M9.5 14.5H4.5M9.5 14.5V19.5M9.5 14.5L4 20"/></svg>',
  unfold: '<svg viewBox="0 0 24 24" class="i"><path d="M9.5 4.5v5h-5M4.5 9.5L10 4"/><path d="M14.5 19.5v-5h5M19.5 14.5L14 20"/></svg>',
  enter: '<svg viewBox="0 0 24 24" class="i"><path d="M20 5.5v5.5a3 3 0 01-3 3H5"/><path d="M9 10.5L5.5 14 9 17.5"/></svg>',
  edited: '<svg viewBox="0 0 24 24" class="i"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M8.5 9.5h5M11 7v5"/><path d="M8.5 15.5h7"/></svg>'
};

const REVIEW_EMPTY = `
  <svg viewBox="0 0 24 24" class="big-i"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/></svg>
  <p>还没有改动</p>
  <span>执行任务后，文件改动会以 diff 形式出现在这里</span>`;

const app = {
  sessions: [],
  activeId: null,
  workspaces: [],
  activeWorkspaceId: null,
  collapsed: new Set(),
  autoApprove: true,
  busy: false,
  workspace: '',
  liveTurn: null
};

const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const streamHost = () => $('#stream');
const turnsHost = () => $('#turns');
const emptyNode = () => $('#empty');
const active = () => app.sessions.find(s => s.id === app.activeId);
const workspaceOf = id => app.workspaces.find(w => w.id === id);
const sortedWorkspaces = () => [...app.workspaces].sort(
  (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.createdAt - b.createdAt
);
const sessionsOf = id => app.sessions.filter(s => s.workspaceId === id);

/* ---------------- 时间与元信息气泡 ---------------- */

const pad2 = n => String(n).padStart(2, '0');

/** 09-19 14:32:05 —— 同一会话里跨年少见，月份够用了 */
function fmtTime(ts) {
  if (!ts) return '未知';
  const d = new Date(ts);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function fmtDuration(ms) {
  if (ms == null) return '未知';
  if (ms < 1000) return `${Math.round(ms)} 毫秒`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} 秒`;
  return `${Math.floor(ms / 60_000)} 分 ${Math.round((ms % 60_000) / 1000)} 秒`;
}

const fmtNum = n => Number(n ?? 0).toLocaleString('en-US');

/** 时间戳可能是毫秒数，也可能是 JSON 化后的 ISO 字符串 */
function toMs(value) {
  if (typeof value === 'number' && value > 0) return value;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * 老会话没有 sentAt/finishedAt，用事件时间戳兜底，至少 hover 不至于全空；
 * 但耗时只在两端时刻都是真的时候才算，不然会给出「0 毫秒」这种假数据。
 */
function turnTimes(turn) {
  const events = turn.events ?? [];
  const fallbackFinish = turn.summary ? events[events.length - 1]?.timestamp : null;
  const sentAt = turn.sentAt ?? events[0]?.timestamp ?? toMs(turn.plan?.createdAt) ?? null;
  const finishedAt = turn.finishedAt ?? fallbackFinish ?? null;
  const elapsed = turn.sentAt && (turn.finishedAt ?? fallbackFinish)
    ? finishedAt - turn.sentAt
    : null;
  return { sentAt, finishedAt, elapsed };
}

/** 用户气泡下面那行：只在 hover 时出现，所以一行说完 */
function userMetaText(turn) {
  const { sentAt } = turnTimes(turn);
  return sentAt ? `发送于 ${fmtTime(sentAt)}` : '发送时间未知';
}

/** AI 回复下面那行：完成时间 · 耗时 · 推理轮数 · token · 模型；没跑完就不显示 */
function turnMetaText(turn) {
  const { finishedAt, elapsed } = turnTimes(turn);
  if (!finishedAt) return '';
  const bits = [`完成于 ${fmtTime(finishedAt)}`];
  if (elapsed != null) bits.push(`耗时 ${fmtDuration(elapsed)}`);
  if (turn.rounds > 1) bits.push(`推理 ${turn.rounds} 轮`);
  if (turn.usage?.reported) bits.push(`${fmtNum(turn.usage.total)} token`);
  else if (turn.source === 'ai') bits.push('网关未上报 token');
  const model = turn.model?.label || turn.model?.id;
  if (model) bits.push(model);
  return bits.join(' · ');
}

/**
 * 元信息平时不显示，鼠标移到这条消息上才浮现在它下边（绝对定位，不挤布局）；
 * 汇总条可能比它晚到，所以每次刷新都重新挂到正文最后。
 */
function refreshTurnMeta(turn) {
  const node = turn._meta;
  if (!node) return;
  const text = turnMetaText(turn);
  node.hidden = !text;
  if (!text) return;
  node.innerHTML = '';
  node.appendChild(el('span', 'tm-left', text));
  node.appendChild(el('span', 'tm-right', turn.source === 'ai' ? '由 AI 生成' : '本地规则规划'));
  turn._body?.appendChild(node);
}

const clip = (text, max = 90) => {
  const oneLine = String(text ?? '').replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
};

/* ---------------- 面板显示 / 隐藏 ---------------- */

const LAYOUT_KEY = 'woder.layout';
const modKey = /Mac/i.test(navigator.platform ?? '') ? '⌘' : 'Ctrl+';
const LAYOUT_PARTS = {
  side: { btn: '#btnToggleSide', name: '侧栏', key: 'B' },
  review: { btn: '#btnToggleReview', name: '审阅 / 工作区文件面板', key: 'E' }
};

/** 只记两个布尔：老数据或解析失败都当成「都显示」 */
function readLayout() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') ?? {};
  } catch {
    saved = {};
  }
  return { side: saved.side !== false, review: saved.review !== false };
}

const layout = readLayout();

function applyLayout() {
  const root = document.querySelector('.app');
  for (const [part, cfg] of Object.entries(LAYOUT_PARTS)) {
    const on = layout[part];
    root.classList.toggle(`hide-${part}`, !on);
    const btn = $(cfg.btn);
    btn.classList.toggle('off', !on);
    btn.setAttribute('aria-pressed', String(on));
    // 按钮文案跟着状态走，隐藏之后标题得改成「显示」
    btn.title = `${on ? '隐藏' : '显示'}${cfg.name}（${modKey}${cfg.key}）`;
  }
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  // 审阅面板开没开决定任务监控是钉在右侧还是浮在按钮下
  renderMonitor();
}

function toggleLayout(part) {
  layout[part] = !layout[part];
  applyLayout();
}

$('#btnToggleSide').addEventListener('click', () => toggleLayout('side'));
$('#btnToggleReview').addEventListener('click', () => toggleLayout('review'));

document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey)) return;
  // 按 code 匹配：⌥ 会把 'e' 变成 '´'，用 e.key 的话 ⌥⌘E 这点不出来
  const code = e.code;
  const plain = !e.altKey && !e.shiftKey;
  if (plain && code === 'KeyB') { e.preventDefault(); toggleLayout('side'); }
  if (plain && code === 'KeyE') { e.preventDefault(); toggleLayout('review'); }
  if (plain && code === 'KeyT') { e.preventDefault(); openPanel('browser'); }
  if (e.shiftKey && !e.altKey && code === 'KeyG') { e.preventDefault(); openPanel('review'); }
  if (e.altKey && !e.shiftKey && code === 'KeyE') { e.preventDefault(); openPanel('files'); }
  if (e.shiftKey && !e.altKey && code === 'KeyJ') { e.preventDefault(); openPanel('terminal'); }
});

/* ---------------- 会话模型 ---------------- */

function createSession(workspaceId) {
  const ws = workspaceOf(workspaceId) ?? app.workspaces[0];
  if (!ws) return null;      // 一个工作区都没有时不建会话，空状态由调用方给提示
  const session = {
    id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    workspaceId: ws.id,
    workspace: ws.path,
    title: '新的任务',
    createdAt: Date.now(),
    status: 'idle',
    turns: []
  };
  app.sessions.push(session);
  return session;
}

/** 没有工作区哪儿都去不了：页脚说清缺什么、侧栏那枚「+」闪一下，别默默吞掉用户这一下 */
function needWorkspace() {
  $('#footStatus').textContent = '先添加一个工作区，Woder 才知道要改哪里的文件';
  const btn = $('#btnAddWs');
  btn.classList.add('blink');
  clearTimeout(needWorkspace.timer);
  needWorkspace.timer = setTimeout(() => {
    btn.classList.remove('blink');
    if (!app.busy) $('#footStatus').textContent = '就绪';
  }, 3200);
}

function newSession(workspaceId) {
  if (app.busy) { nudge(); return; }
  if (!app.workspaces.length) { needWorkspace(); return; }
  const wsId = workspaceId ?? app.activeWorkspaceId ?? app.workspaces[0]?.id;
  const blank = sessionsOf(wsId).find(s => s.turns.length === 0 && s.title === '新的任务');
  const session = blank ?? createSession(wsId);
  selectSession(session.id);
  persist();
  $('#input').focus();
}

/**
 * 切换当前会话，并同步右侧面板到它所属的工作区
 */
function selectSession(id) {
  if (app.busy) { nudge(); return; }
  if (id === app.activeId) return;
  const session = app.sessions.find(s => s.id === id);
  if (!session) return;
  app.activeId = id;
  app.activeWorkspaceId = session.workspaceId;
  renderSidebar();
  renderStream();
  refreshTree(session.workspaceId);
}

function serialize() {
  return app.sessions.map(s => ({
    id: s.id,
    workspaceId: s.workspaceId,
    workspace: s.workspace,
    title: s.title,
    createdAt: s.createdAt,
    status: s.status,
    // 压缩上下文的结果：折进摘要的轮数 + 摘要本身，重开会话后还能显示那条分隔说明
    digest: s.digest ?? null,
    compressedThrough: s.compressedThrough ?? 0,
    turns: s.turns.map(t => ({
      request: t.request,
      // 用户随需求附的图片（已压成 data URL，重开会话还能看到缩略图）
      attachments: t.attachments ?? null,
      source: t.source,
      note: t.note,
      plan: t.plan,
      events: t.events,
      summary: t.summary,
      // hover 元信息用的字段：发送时刻、完成时刻、本轮 token 用量、分段耗时
      sentAt: t.sentAt ?? null,
      finishedAt: t.finishedAt ?? null,
      usage: t.usage ?? null,
      model: t.model ?? null,
      rounds: t.rounds ?? null,
      runMs: t.runMs ?? null
    }))
  }));
}

const persist = () => woder.sessions.save(serialize());

/* ---------------- 执行过程：三级折叠结构 ---------------- */

/**
 * 第二层的「调用类型」只有三类：思考 / 工具调用 / 终端命令。
 * 具体动作（读哪个文件、跑哪条命令）进简介和第三层，不在这里铺开。
 */
function kindOf(action) {
  const a = String(action ?? '');
  if (a === 'ai.answer' || a === 'ai.summarize') return '思考';
  if (a === 'ask.user') return '提问';
  if (a.startsWith('shell.')) return '终端命令';
  return '工具调用';
}

const RUN_STATUS_WORD = { pending: '待执行', running: '执行中', failed: '失败', skipped: '已跳过' };

/** 跑完的行不再重复「已完成」，思考类直接写成「已思考」，跟截图一致 */
function runLabels(action, status) {
  const kind = kindOf(action);
  if (status === 'completed') {
    if (kind === '思考') return { kind: '已思考', word: '' };
    if (kind === '提问') return { kind: '提问', word: '已回答' };
    return { kind, word: kind === '终端命令' ? '已运行' : '已完成' };
  }
  // 提问这一步就是停在等人，写「执行中」看着像卡住了
  if (kind === '提问' && status === 'running') return { kind, word: '等你回答' };
  return { kind, word: RUN_STATUS_WORD[status] ?? status };
}

/** 简介里的「对象」：命令、路径、网址 */
function callTarget(step) {
  const p = step.params ?? {};
  switch (String(step.action)) {
    case 'shell.run': return String(p.command ?? '');
    case 'file.move': return `${p.from ?? ''} → ${p.to ?? ''}`;
    case 'browser.open':
    case 'browser.navigate':
    case 'browser.extract': return String(p.url ?? '');
    case 'browser.read':
    case 'browser.screenshot':
    case 'browser.close': return '';
    case 'browser.click':
    case 'browser.type': {
      // 序号和 browser.read 给模型的那份清单保持一致，别再换算一次
      const idx = Number.isInteger(p.index) ? `序号 ${p.index}` : '';
      return [String(p.text ?? ''), String(p.selector ?? ''), idx].filter(Boolean).join(' · ');
    }
    case 'file.read':
    case 'file.write':
    case 'file.append':
    case 'file.mkdir':
    case 'file.delete':
    case 'file.list':
    case 'file.discover':
    case 'file.classify': return String(p.path ?? '');
    case 'file.grep': return [String(p.pattern ?? ''), p.path && p.path !== '.' ? `在 ${p.path}` : ''].filter(Boolean).join(' ');
    case 'wait': return `${p.ms ?? 300}ms`;
    default: return '';
  }
}

/** 第二层那句简介：步骤名 + 对象，对象已经写在名字里（或就是个工作区根目录）就不重复 */
function callBrief(step, turn) {
  const name = String(step.name || step.action || '');
  const target = callTarget(step);
  if (step.action === 'shell.run') return target || name;
  if (step.action === 'ai.answer') return turn ? `回应「${clip(String(turn.request ?? ''), 80)}」` : name;
  if (step.action === 'ask.user') return clip(String(step.params?.question ?? ''), 80) || name;
  if (target && target !== '.' && !name.includes(target)) return `${name} · ${target}`;
  return name;
}

/** 第三层「调用内容」：主体 + 一行补充（工作目录、超时、递归等） */
function callContent(step, turn) {
  const p = step.params ?? {};
  const action = String(step.action);
  const extras = [];
  if (p.cwd) extras.push(`目录 ${p.cwd}`);
  if (p.timeoutMs) extras.push(`超时 ${Math.round(Number(p.timeoutMs) / 1000)} 秒`);
  if (p.recursive) extras.push('递归');
  if (p.maxLength) extras.push(`不超过 ${p.maxLength} 字`);
  if (Array.isArray(p.selectors) && p.selectors.length) extras.push(`选择器 ${p.selectors.join(', ')}`);

  if (action === 'ai.answer') {
    // 调用内容 = 这次交给模型的问题，执行结果 = 模型的答复，两栏各说一件事
    return { prose: true, text: `用户：${(turn && turn.request) || String(p.text ?? '')}`, meta: extras.join(' · ') };
  }
  if (action === 'ai.summarize') {
    return { prose: false, text: p.text ? String(p.text) : String(p.path ?? ''), meta: extras.join(' · ') };
  }
  if (action === 'ask.user') {
    // 调用内容 = 问题本身 + 当时给的那几个选项，回看时不用再去猜自己当时能选什么
    const opts = (Array.isArray(p.options) ? p.options : [])
      .map((o, i) => `${i + 1}. ${String(o?.label ?? '')}${o?.detail ? ` —— ${o.detail}` : ''}`);
    return { prose: true, text: [String(p.question ?? ''), ...opts].filter(Boolean).join('\n'), meta: extras.join(' · ') };
  }
  if (action === 'shell.run') {
    return { prose: false, text: String(p.command ?? ''), meta: extras.join(' · ') };
  }
  if (action === 'file.write' || action === 'file.append') {
    return { prose: false, text: `${p.path ?? ''}\n${String(p.content ?? '')}`, meta: extras.join(' · ') };
  }
  const target = callTarget(step);
  // file.* 的默认对象是工作区根目录，直接写个「.」看不懂
  const head = target === '.' ? '工作区根目录' : target;
  return { prose: false, text: head || JSON.stringify(p, null, 2), meta: extras.join(' · ') };
}

function runResultIsProse(ev) {
  const action = String(ev.tool ?? '');
  return !ev.error && (action === 'ai.answer' || action === 'ai.summarize' || action === 'ask.user');
}

/** 第三层：调用内容 + 最后的执行结果 */
function renderRunDetail(cell, ev) {
  const body = cell.body;
  body.innerHTML = '';

  const content = callContent(cell.step, cell.turn);
  if (content.text) {
    body.appendChild(el('div', 'run-label', '调用内容'));
    body.appendChild(el('div', content.prose ? 'run-text' : 'run-pre', content.text));
    if (content.meta) body.appendChild(el('div', 'run-extra', content.meta));
  }

  const result = ev?.error || ev?.output;
  // 结果和内容一字不差时再贴一遍只是噪音
  const sameAsContent = !ev?.error && String(result ?? '').trim() &&
    String(result ?? '').trim() === content.text.trim();
  if (result && !sameAsContent) {
    body.appendChild(el('div', 'run-label', '执行结果'));
    const prose = runResultIsProse({ ...ev, tool: ev.tool ?? cell.step.action });
    body.appendChild(el('div', `${prose ? 'run-text' : 'run-pre'}${ev.error ? ' err' : ''}`, result));
    const bits = [];
    if (ev?.diff) bits.push(`改动 +${ev.diff.additions} −${ev.diff.deletions} 行`);
    if (bits.length) body.appendChild(el('div', 'run-extra', bits.join(' · ')));
  } else if (cell.status === 'running') {
    body.appendChild(el('div', 'run-label', '执行结果'));
    body.appendChild(el('div', 'run-text muted', '正在执行…'));
  } else if (!content.text) {
    body.appendChild(el('div', 'run-text muted', '这一步没有留下内容'));
  }
}

function buildRunRow(turn, step) {
  const row = el('div', 'run-row pending');
  const ico = el('div', 'run-ico s-pending');
  ico.innerHTML = ICON.pending;
  row.appendChild(ico);

  const main = el('div', 'run-main');
  const line = el('button', 'run-line');
  line.type = 'button';
  const labels = runLabels(step.action, 'pending');
  const kind = el('span', 'run-kind', labels.kind);
  const word = el('span', 'run-word', labels.word);
  const brief = el('span', 'run-brief', clip(callBrief(step, turn), 150));
  line.appendChild(kind);
  line.appendChild(word);
  line.appendChild(brief);
  main.appendChild(line);

  const body = el('div', 'run-detail');
  body.hidden = true;
  main.appendChild(body);
  row.appendChild(main);

  line.addEventListener('click', () => {
    body.hidden = !body.hidden;
    row.classList.toggle('open', !body.hidden);
  });

  const cell = { turn, step, row, ico, kind, word, brief, body, status: 'pending', ev: null };
  return cell;
}

/**
 * 第一层：一个总标题 + 可整体折叠的步骤列表。
 * 之前「计划卡片」和「执行工具」是两块重复的列表，现在合成一棵树。
 */
function buildRunTree(turn) {
  const plan = turn.plan;
  const wrap = el('div', 'run open');

  const head = el('button', 'run-head');
  head.type = 'button';
  // 那个小方框平时是步数，鼠标移到第一层上才换成展开/收起箭头（跟截图一致）
  const chev = el('span', 'run-chev');
  chev.innerHTML = `<i class="chev-num">${plan.steps.length}</i><i class="chev-ico">${ICON.chev}</i>`;
  head.appendChild(chev);
  const title = el('span', 'run-title', `执行 ${plan.steps.length} 步`);
  const right = el('span', 'run-right', `0/${plan.steps.length}`);
  head.appendChild(title);
  head.appendChild(right);
  head.addEventListener('click', () => {
    wrap.classList.toggle('open');
    // 第一层一收一放，第二层下面的展开状态全部回到收起
    cells.forEach(cell => {
      cell.body.hidden = true;
      cell.row.classList.remove('open');
    });
  });
  wrap.appendChild(head);

  const list = el('div', 'run-list');
  const cells = new Map();
  plan.steps.forEach(step => {
    const cell = buildRunRow(turn, step);
    cells.set(step.id, cell);
    list.appendChild(cell.row);
  });
  wrap.appendChild(list);

  turn._rt = {
    turn, wrap, cells, title, right, chev, list,
    total: plan.steps.length,
    done: 0,
    failed: 0,
    addHead: node => wrap.after(node)
  };
  // agentic 那一轮发出去时还没有步骤，空树先藏着，补进第一行再露出来
  wrap.hidden = plan.steps.length === 0;
  return wrap;
}

/**
 * agentic 循环的步骤是跑出来的：第一次见到这个 stepId 就照着事件补一行，
 * 不然树会一直停在 0 步，用户看不见模型正在做什么。
 */
function appendRunStep(rt, ev) {
  const step = { id: ev.stepId, name: ev.stepName, action: ev.tool, params: ev.input ?? {} };
  rt.turn.plan.steps.push(step);
  const cell = buildRunRow(rt.turn, step);
  rt.cells.set(step.id, cell);
  rt.wrap.hidden = false;
  rt.list.appendChild(cell.row);
  rt.total++;
  const num = rt.chev.querySelector('.chev-num');
  if (num) num.textContent = rt.total;
  return cell;
}


/** 第一层标题：总步数，以及失败几次（跟截图里那行一个说法） */
function runTitle(rt) {
  const bits = [`执行 ${rt.total} 步`];
  if (rt.failed) bits.push(`其中 ${rt.failed} 次失败`);
  return bits.join('，');
}

/** 第一层右侧：进度与改动文件数，跑完后进度就没意义了 */
function runRight(rt, turn) {
  const bits = [];
  if (rt.done < rt.total) bits.push(`${rt.done}/${rt.total}`);
  const files = countDiffs(turn);
  if (files) bits.push(`改动 ${files} 个文件`);
  return bits.join(' · ');
}

/**
 * 计数一律从各步骤的当前状态现算，不做累加：
 * 执行结果的 IPC 回执可能比最后一条 task:event 先到，累加会把同一步数两次。
 */
function recountRun(rt) {
  let done = 0;
  let failed = 0;
  rt.cells.forEach(cell => {
    if (cell.status === 'completed' || cell.status === 'failed' || cell.status === 'skipped') done++;
    if (cell.status === 'failed') failed++;
  });
  rt.done = done;
  rt.failed = failed;
}

/**
 * 第二层是定高滚动区，正在跑的那一步要自己滚进视野，
 * 不然步骤一多就得手动往下翻。只动这个列表的 scrollTop，不碰外层滚动。
 */
function ensureRowVisible(rt, row) {
  const list = rt.list;
  if (!list || list.scrollHeight <= list.clientHeight) return;
  const lr = list.getBoundingClientRect();
  const rr = row.getBoundingClientRect();
  if (rr.top < lr.top) list.scrollTop -= (lr.top - rr.top) + 8;
  else if (rr.bottom > lr.bottom) list.scrollTop += (rr.bottom - lr.bottom) + 8;
}

/**
 * 把一个执行事件应用到三级结构上：
 * 第二层换类型/状态词/简介，第三层重画「调用内容 + 执行结果」，第一层刷新计数。
 */
function applyEvent(turn, ev) {
  const rt = turn._rt;
  if (!rt) return;
  let cell = rt.cells.get(ev.stepId);
  if (!cell) {
    // 补平用的合成事件一定对得上已有行；真步骤没见过就当场补一行
    if (!ev.stepId || ev.status === 'pending') return;
    cell = appendRunStep(rt, ev);
  }

  // 补平用的合成事件不带输出，别用它把已经显示出来的「执行结果」擦掉。
  // 真有结果的话优先用已有结果，只把状态换过去。
  const carries = e => !!(e && (e.output || e.error || e.diff));
  if (!carries(ev) && carries(cell.ev)) ev = { ...cell.ev, status: ev.status ?? cell.ev.status };

  cell.status = ev.status;
  cell.ev = ev;
  const open = cell.row.classList.contains('open');
  cell.row.className = `run-row ${ev.status}${open ? ' open' : ''}`;
  cell.ico.className = `run-ico s-${ev.status}`;
  cell.ico.innerHTML = ICON[ev.status] || ICON.pending;

  const labels = runLabels(ev.tool ?? cell.step.action, ev.status);
  cell.kind.textContent = labels.kind;
  cell.word.textContent = labels.word;
  cell.brief.textContent = clip(callBrief(cell.step, turn), 150);

  recountRun(rt);
  rt.wrap?.classList.toggle('finished', rt.total > 0 && rt.done >= rt.total);
  rt.title.textContent = runTitle(rt);
  rt.right.textContent = runRight(rt, turn);

  // 说话类的内容就是这轮的答复，摊在树外面才不用点开看
  if ((ev.tool === 'ai.answer' || ev.tool === 'ai.summarize') && ev.status === 'completed' && ev.output && turn._body) {
    if (!rt.replyEl) {
      rt.replyEl = el('div', 'reply');
      rt.addHead(rt.replyEl);
    }
    rt.replyEl.textContent = rt.replyEl.textContent
      ? `${rt.replyEl.textContent}\n\n${ev.output}`
      : ev.output;
    // 答复已经在这了，上面那行「正在执行…」再留着就是废话
    const head = turn._body.querySelector('.msg-text');
    if (head && head.textContent.trim() === '正在执行…') head.hidden = true;
  }

  // 失败的步骤默认展开，错误不该要人多点一次才看得见
  if (ev.status === 'failed') {
    cell.body.hidden = false;
    cell.row.classList.add('open');
  }
  if (ev.status === 'running' || ev.status === 'failed') ensureRowVisible(rt, cell.row);

  renderRunDetail(cell, ev);
  renderProgress();
  renderMonitor();
}

/* ---------------- 执行进度浮标 ---------------- */

let progressOpen = false;
let progressZone = 'steps';

/**
 * 输入框上方那条常驻进度：哪一步在跑、已经改了哪些文件。
 * 树里的计数只有滚到那一轮才看得到，跑长任务时得有个一直钉在眼前的。
 *
 * 浮标本体的节点在 index.html 里写死了，这里只改文字。整块 innerHTML 重建会把
 * 鼠标底下那个元素换掉，浏览器当成指针离开，悬停明细刚开就被收走，根本点不到。
 */
function renderProgress() {
  const turn = app.liveTurn;
  const rt = turn?._rt;
  if (!app.busy || !rt) {
    $('#runProgress').hidden = true;
    $('#rpPop').hidden = true;
    progressOpen = false;
    progressZone = 'steps';
    return;
  }
  const diffs = turnDiffs(turn);
  $('#rpSteps').textContent = `步骤 ${rt.done} / ${rt.total}`;
  const zone = $('#rpFilesZone');
  zone.hidden = !diffs.length;
  if (diffs.length) {
    $('#rpFiles').textContent = `${diffs.length} 个文件已修改`;
    // 行数都是程序算出来的数字，路径走 textContent，不拼用户可控的 HTML
    $('#rpAdd').textContent = `+${diffs.reduce((n, d) => n + d.additions, 0)}`;
    $('#rpDel').textContent = `−${diffs.reduce((n, d) => n + d.deletions, 0)}`;
  }
  $('#runProgress').hidden = false;
  renderProgressPop(turn, diffs);
}

/** 只重画弹层那一份，浮标本体一个字都不动 —— hover 触发的重画一律走这里 */
function refreshProgressPop() {
  const turn = app.liveTurn;
  if (!app.busy || !turn?._rt) { progressOpen = false; $('#rpPop').hidden = true; return; }
  renderProgressPop(turn, turnDiffs(turn));
}

function renderProgressPop(turn, diffs) {
  const pop = $('#rpPop');
  if (!progressOpen) { pop.hidden = true; return; }
  pop.innerHTML = '';
  const rt = turn._rt;
  if (progressZone === 'files' && diffs.length) {
    pop.appendChild(el('div', 'rp-title', `${diffs.length} 个文件已修改`));
    // 路径是相对工作区的，浮标里带上工作区名才认得出是哪个仓库改的；
    // 取正在跑的那一轮的工作区，切去看别的会话时也不会标错。
    const ws = workspaceOf(turn.workspaceId);
    const root = ws?.name ? `${ws.name}/` : '';
    diffs.forEach(d => {
      const row = el('div', 'rp-file rp-jump');
      row.title = '在审阅面板中查看改动';
      row.appendChild(el('span', 'rp-path', root + d.path));
      const n = el('span', 'rp-count');
      n.innerHTML = `<b class="add">+${escHtml(d.additions)}</b><b class="del">−${escHtml(d.deletions)}</b>`;
      row.appendChild(n);
      row.addEventListener('click', () => focusReviewDiff(d.path));
      pop.appendChild(row);
    });
    pop.hidden = false;
    return;
  }
  pop.appendChild(el('div', 'rp-title', `执行步骤 ${rt.done} / ${rt.total}`));
  rt.cells.forEach(cell => {
    const row = el('div', 'rp-step');
    const ico = el('span', `rp-ico s-${cell.status}`);
    ico.innerHTML = ICON[cell.status] || ICON.pending;
    row.appendChild(ico);
    row.appendChild(el('span', 'rp-step-name', cell.step.name || '未命名'));
    const word = cell.word.textContent;
    if (word) row.appendChild(el('span', 'rp-step-word', word));
    pop.appendChild(row);
  });
  pop.hidden = false;
}

/** 弹层里点某个文件：把审阅面板拉回来，展开并滚到对应的 diff 卡片 */
function focusReviewDiff(path) {
  openPanel('review');
  const card = [...$('#reviewBody').querySelectorAll('.diff-card')]
    .find(c => c.dataset.path === path);
  if (!card) return;
  card.classList.add('open');
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// 浮标和清单弹层都在 #runProgress 里，鼠标在两者之间挪不会误触发 leave
const progHost = $('#runProgress');
progHost.addEventListener('mouseenter', () => { progressOpen = true; refreshProgressPop(); });
progHost.addEventListener('mouseleave', () => { progressOpen = false; refreshProgressPop(); });
// 两个分区各弹各的清单；文件分区还没改出东西时压根不存在，落回步骤
progHost.addEventListener('mouseover', e => {
  const zone = e.target.closest?.('.rp-zone')?.dataset.zone;
  if (!zone || zone === progressZone) return;
  progressZone = zone;
  if (progressOpen) refreshProgressPop();
});
// 键盘操作没有 hover，Tab 聚焦到浮标按钮时同样弹
progHost.addEventListener('focusin', () => { progressZone = 'steps'; progressOpen = true; refreshProgressPop(); });
progHost.addEventListener('focusout', () => { progressOpen = false; refreshProgressPop(); });

/* ---------------- 任务监控 ---------------- */

const MON_KEY = 'woder.monitor';
const MON_FOLD = 6;

const monitor = (() => {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(MON_KEY) ?? '{}') ?? {};
  } catch {
    saved = {};
  }
  return { open: saved.open === true, pinned: saved.pinned === true, folded: true };
})();

/** 审阅面板开着时右侧已经站了一栏，监控挤不下，只能浮在按钮下面 */
const monitorFloats = () => layout.review;

function saveMonitor() {
  localStorage.setItem(MON_KEY, JSON.stringify({ open: monitor.open, pinned: monitor.pinned }));
}

function setMonitor(open) {
  monitor.open = open;
  monitor.folded = true;
  saveMonitor();
  renderMonitor();
}

const MON_STATE = {
  completed: ['已完成', 'ok', 'tick'],
  running: ['进行中', 'run', 'running'],
  pending: ['排队中', 'wait', 'pending'],
  failed: ['失败', 'er', 'failed'],
  skipped: ['已跳过', 'wait', 'skipped']
};

/** 把整个会话摊成监控要用的四堆东西：答复、后台进程、产出、网页 */
function monitorData(session) {
  const out = { reply: '', at: null, procs: [], files: [], pages: [] };
  const seenUrl = new Set();
  (session?.turns ?? []).forEach(turn => {
    const stamp = turn.finishedAt ?? turn.sentAt;
    if (stamp && (!out.at || stamp > out.at)) out.at = stamp;
    const latest = {};
    (turn.events ?? []).forEach(ev => { latest[ev.stepId] = ev; });
    (turn.plan?.steps ?? []).forEach(step => {
      const action = String(step.action);
      const status = latest[step.id]?.status ?? 'pending';
      if (action === 'shell.run') out.procs.push({ text: callTarget(step) || step.name, status });
      if (action === 'browser.open' || action === 'browser.navigate') {
        const url = callTarget(step);
        if (url && !seenUrl.has(url)) {
          seenUrl.add(url);
          out.pages.push(url);
        }
      }
    });
    (turn.events ?? []).forEach(ev => {
      if (ev.status === 'completed' && ev.output && (ev.tool === 'ai.answer' || ev.tool === 'ai.summarize')) out.reply = ev.output;
    });
  });
  out.files = sessionDiffs(session);
  if (!out.reply) {
    const turns = session?.turns ?? [];
    const last = turns[turns.length - 1];
    out.reply = last ? String(last.note || last.request || '') : '';
  }
  return out;
}

function monIco(name, cls = 'mon-ico') {
  const node = el('span', cls);
  node.innerHTML = ICON[name] ?? ICON.file;
  return node;
}

/** 徽标按扩展名上色，一眼能扫出哪些是文档、哪些是代码 */
function monKind(path) {
  const ext = String(path).split('.').pop().toLowerCase();
  return ['html', 'md', 'css', 'js', 'json'].includes(ext) ? `k-${ext}` : '';
}

function monRow(iconName, text, extra, rowCls) {
  const row = el('div', `mon-row${rowCls ? ` ${rowCls}` : ''}`);
  const badge = monIco(iconName);
  if (rowCls?.includes('mon-row--file')) {
    const kind = monKind(text);
    if (kind) badge.classList.add(kind);
  }
  row.appendChild(badge);
  const label = el('span', 'mon-text', text);
  label.title = text;
  row.appendChild(label);
  if (extra) row.appendChild(extra);
  return row;
}

function monStatus(status) {
  const [word, cls, icon] = MON_STATE[status] ?? MON_STATE.pending;
  const node = el('span', `mon-state ${cls}`);
  node.appendChild(monIco(icon, 'mon-sico'));
  node.appendChild(el('span', '', word));
  return node;
}

function monSection(title, rows) {
  if (!rows.length) return null;
  const sec = el('section', 'mon-sec');
  sec.appendChild(el('h4', 'mon-sec-title', title));
  rows.forEach(r => sec.appendChild(r));
  return sec;
}

const monClock = ts => {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

function positionMonitorFloat() {
  const r = $('#btnMonitor').getBoundingClientRect();
  // 放大浏览器时会话栏整块被藏起来，按钮量出来是 0 尺寸，此时保持上一次的定位
  if (!r.width) return;
  const host = document.querySelector('.app');
  host.style.setProperty('--mon-top', `${Math.round(r.bottom) + 8}px`);
  host.style.setProperty('--mon-right', `${Math.round(window.innerWidth - r.right)}px`);
}

function renderMonitor() {
  const host = $('#monitor');
  const on = monitor.open;
  const floats = monitorFloats();
  host.hidden = !on;
  const appNode = document.querySelector('.app');
  appNode.classList.toggle('monitor-float', on && floats);
  appNode.classList.toggle('monitor-dock', on && !floats);
  if (on && floats) positionMonitorFloat();

  const btn = $('#btnMonitor');
  btn.classList.toggle('off', !on);
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on ? '收起任务监控' : '任务监控';

  const pin = $('#monPin');
  pin.innerHTML = ICON.pin;
  pin.classList.toggle('on', monitor.pinned);
  pin.title = !floats ? '钉在右侧时不会自动收起'
    : monitor.pinned ? '取消吸住：点空白处就收起' : '吸住：点空白处也不收起';

  if (!on) return;
  renderMonitorBody();
}

function renderMonitorBody() {
  const body = $('#monBody');
  const keep = body.scrollTop;
  const d = monitorData(active());
  body.innerHTML = '';

  const card = el('div', 'mon-card');
  card.appendChild(monIco('model'));
  card.appendChild(el('div', 'mon-updated', d.at ? `更新于 ${monClock(d.at)}` : '还没有跑过任务'));
  card.appendChild(el('div', 'mon-reply', d.reply || '说个需求，进展会汇总到这里。'));
  body.appendChild(card);

  const shown = monitor.folded ? d.files.slice(0, MON_FOLD) : d.files;
  const fileRows = shown.map(f => {
    const row = monRow('file', f.path.split('/').pop(), null, 'mon-row--file clickable');
    row.querySelector('.mon-text').title = f.path;
    // 产出条目点下去是去看 diff：开审阅面板的同时把自己收起来，
    // 否则面板一开监控就浮到它上面，正好盖住要看的那份改动
    row.addEventListener('click', () => {
      setMonitor(false);
      openPanel('review');
    });
    return row;
  });
  if (d.files.length > MON_FOLD) {
    const more = el('button', 'mon-more', monitor.folded ? `查看更多（${d.files.length - MON_FOLD}）` : '收起');
    more.type = 'button';
    more.addEventListener('click', () => {
      monitor.folded = !monitor.folded;
      renderMonitorBody();
    });
    fileRows.push(more);
  }

  [
    monSection('后台进程', d.procs.map(p => monRow('terminal', p.text, monStatus(p.status), 'mon-row--proc'))),
    monSection('产出', fileRows),
    monSection('网页查阅', d.pages.map(u => monRow('globe', u.replace(/^https?:\/\//, ''), null)))
  ].forEach(sec => sec && body.appendChild(sec));
  body.scrollTop = keep;
}

$('#btnMonitor').addEventListener('click', () => setMonitor(!monitor.open));

// 会话栏的右缘会随审阅面板开合、窗口缩放而移动，浮层得跟着按钮重新定位
new ResizeObserver(() => {
  if (monitor.open && monitorFloats()) positionMonitorFloat();
}).observe($('.chat'));

$('#monPin').addEventListener('click', () => {
  monitor.pinned = !monitor.pinned;
  saveMonitor();
  renderMonitor();
});

document.addEventListener('click', e => {
  const path = e.composedPath();
  // 右上角那三个开关本身就在改监控的形态（开审阅面板会让它从钉住变成浮起），
  // 不能让它们顺手把监控关掉；其余地方点一下就把浮层收起来
  if (path.some(n => n.id === 'monitor' || n.id === 'btnMonitor') || path.some(n => n.classList?.contains('win-toggles'))) return;
  if (monitor.open && !monitor.pinned && monitorFloats()) setMonitor(false);
});

/* ---------------- 轮次渲染 ---------------- */

/** 有没有被那四行的高度限制截掉 */
function isClipped(bubble) {
  return bubble.scrollHeight - bubble.clientHeight > 4;
}

/**
 * 用户消息固定高度，超出的部分不显示；点一下弹出「完整消息」看全文。
 * 高度写在 CSS（.msg-user 的 max-height），这里只负责判断是否截断和点击行为。
 */
function clampUserMsg(bubble, text) {
  requestAnimationFrame(() => bubble.classList.toggle('clipped', isClipped(bubble)));
  bubble.addEventListener('click', () => { if (isClipped(bubble)) showFullMessage(text); });
  bubble.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isClipped(bubble)) showFullMessage(text);
    }
  });
}

let clampSyncTimer = null;
addEventListener('resize', () => {
  clearTimeout(clampSyncTimer);
  // 面板宽度变了，换行就变了，重新判断每条要不要截断
  clampSyncTimer = setTimeout(() => {
    document.querySelectorAll('.msg-user').forEach(b => b.classList.toggle('clipped', isClipped(b)));
  }, 150);
});

/** 通用弹层：标题 + 右上角 ×，点 ×、点遮罩、按 Esc 都能关 */
function openDialog(title, contentNode) {
  const mask = el('div', 'overlay open full-msg');
  const box = el('div', 'modal full-box');
  const head = el('div', 'full-head');
  head.appendChild(el('h3', '', title));
  const x = el('button', 'full-x');
  x.type = 'button';
  x.setAttribute('aria-label', '关闭');
  x.innerHTML = ICON.close;
  head.appendChild(x);
  box.appendChild(head);
  box.appendChild(contentNode);
  mask.appendChild(box);
  document.body.appendChild(mask);

  const onKey = e => { if (e.key === 'Escape') close(); };
  const close = () => { mask.remove(); document.removeEventListener('keydown', onKey); };
  x.addEventListener('click', close);
  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  document.addEventListener('keydown', onKey);
  x.focus();
}

/** 「完整消息」弹层 */
function showFullMessage(text) {
  openDialog('完整消息', el('div', 'full-body', text));
}

/* ---------------- 图片附件 ---------------- */

const MAX_IMAGES = 4;
const MAX_IMAGE_EDGE = 1280;
/** 小于这个体积就不折腾了，原图发过去也不贵 */
const KEEP_BELOW_CHARS = 300_000;

let pendingImages = [];

const readAsDataURL = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const loadImage = src => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('图片读不出来'));
  img.src = src;
});

/**
 * 大图的长边压到 1280 再转 JPEG：模型不需要原始分辨率，
 * 一张 4K 截图原样发既慢又贵，还会把会话存储撑爆。
 * 转不出来（比如 svg 污染画布）就退回原图。
 */
async function prepareImage(dataUrl, mime) {
  if (dataUrl.length <= KEEP_BELOW_CHARS) return { dataUrl, mime };
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';           // JPEG 没有透明通道，先铺白底免得透明区变黑
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', 0.82);
    return out.startsWith('data:image/jpeg') ? { dataUrl: out, mime: 'image/jpeg' } : { dataUrl, mime };
  } catch {
    return { dataUrl, mime };
  }
}

async function addImageFiles(files) {
  for (const file of files) {
    if (!/^image\//.test(file.type || '')) continue;
    if (pendingImages.length >= MAX_IMAGES) {
      attachHint(`一条需求最多 ${MAX_IMAGES} 张图片`);
      break;
    }
    const raw = await readAsDataURL(file);
    const { dataUrl, mime } = await prepareImage(raw, file.type);
    pendingImages.push({ name: file.name, mime, dataUrl });
  }
  renderAttachTray();
}

function renderAttachTray() {
  const tray = $('#attachTray');
  tray.innerHTML = '';
  tray.hidden = pendingImages.length === 0;
  pendingImages.forEach((item, i) => {
    const chip = el('div', 'attach-chip');
    const thumb = document.createElement('img');
    thumb.src = item.dataUrl;
    thumb.alt = item.name;
    thumb.addEventListener('click', () => showImage(item));
    const info = el('div', 'attach-info');
    info.appendChild(el('span', 'attach-name', item.name));
    info.appendChild(el('span', 'attach-size', kbText(item.dataUrl.length)));
    const x = el('button', 'attach-x');
    x.type = 'button';
    x.title = '移除这张图';
    x.innerHTML = ICON.close;
    x.addEventListener('click', () => {
      pendingImages.splice(i, 1);
      renderAttachTray();
    });
    chip.appendChild(thumb);
    chip.appendChild(info);
    chip.appendChild(x);
    tray.appendChild(chip);
  });
}

const clearAttach = () => { pendingImages = []; renderAttachTray(); };

function kbText(chars) {
  const kb = Math.round(chars / 1024);
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

function showImage(item) {
  const img = document.createElement('img');
  img.className = 'full-img';
  img.src = item.dataUrl;
  img.alt = item.name;
  openDialog(item.name, img);
}

function attachHint(text) {
  const foot = $('#footStatus');
  foot.textContent = text;
  clearTimeout(attachHint.timer);
  attachHint.timer = setTimeout(() => {
    if (!app.busy) foot.textContent = '就绪';
  }, 2400);
}

$('#attachBtn').addEventListener('click', () => $('#attachInput').click());
$('#attachInput').addEventListener('change', e => {
  const files = [...(e.target.files ?? [])];
  e.target.value = '';      // 允许下一次再选同一个文件
  addImageFiles(files);
});

function buildTurn(turn) {
  const frag = document.createDocumentFragment();

  const userMsg = el('div', 'msg me');
  const bubble = el('div', 'msg-user', turn.request);
  bubble.tabIndex = 0;
  clampUserMsg(bubble, turn.request);
  if (turn.attachments?.length) {
    const row = el('div', 'msg-attach');
    turn.attachments.forEach(a => {
      const img = document.createElement('img');
      img.src = a.dataUrl;
      img.alt = a.name;
      img.title = `${a.name} · 点击看大图`;
      img.addEventListener('click', () => showImage(a));
      row.appendChild(img);
    });
    userMsg.appendChild(row);
  }
  userMsg.appendChild(bubble);
  // 平时不显示，鼠标移到这条消息上才在气泡下边露出发送时间
  userMsg.appendChild(el('div', 'turn-meta me', userMetaText(turn)));
  frag.appendChild(userMsg);

  const msg = el('div', 'msg');
  const body = el('div', 'msg-assistant');
  const note = el('div', 'msg-text', turn.note);
  // 现在正文默认是空的：话由树底下那条「回答」说，这行只留给报错和补充说明
  note.hidden = !turn.note;
  body.appendChild(note);
  msg.appendChild(body);
  frag.appendChild(msg);
  // 回放事件时 applyEvent 要往 body 里加正文，必须在回放之前挂上
  turn._body = body;

  if (turn.plan) {
    body.appendChild(buildRunTree(turn));
    (turn.events ?? []).forEach(ev => applyEvent(turn, ev));
    // 老数据里可能有只记到 running 的轮次（事件比结果晚到），有汇总就说明其实跑完了；
    // 没汇总但已收尾的是按过停止，挂着的步骤算「已跳过」，否则重开会话圈还在转。
    if (turn._rt) {
      const settle = turn.summary ? 'completed' : turn.finishedAt ? 'skipped' : null;
      if (settle) turn._rt.cells.forEach(cell => {
        if (!/run-row (completed|failed|skipped)/.test(cell.row.className)) {
          applyEvent(turn, { stepId: cell.step.id, tool: cell.step.action, status: settle });
        }
      });
    }
  }

  // 有执行树时，总步数与失败次数已经在第一层说了，不再重复一条汇总
  if (turn.summary && !turn.plan) {
    const bar = el('div', 'summary');
    bar.innerHTML =
      `完成 <b class="ok">${turn.summary.completed}</b> 步` +
      (turn.summary.failed ? ` · 失败 <b class="er">${turn.summary.failed}</b> 步` : '') +
      (turn.summary.skipped ? ` · 跳过 <b>${turn.summary.skipped}</b> 步` : '') +
      ` · 改动 <b>${countDiffs(turn)}</b> 个文件`;
    body.appendChild(bar);
  }

  // 回复下面常驻一行轻提示（时间 · 耗时 · token），细节仍走 hover
  turn._meta = el('div', 'turn-meta');
  refreshTurnMeta(turn);
  renderTurnFiles(turn);

  return frag;
}

function countDiffs(turn) {
  const paths = new Set((turn.events ?? []).filter(e => e.diff).map(e => e.diff.path));
  return paths.size;
}

/* ---------------- 本轮改动清单：跑完了一轮，在正文末尾留一张卡 ---------------- */

const FILES_PREVIEW = 3;

function tfCount(d) {
  // 行数都是程序算出来的整数，拼 HTML 没有注入面；路径走 textContent
  return `<b class="add">+${d.additions}</b><b class="del">−${d.deletions}</b>`;
}

function buildTurnFiles(turn) {
  const diffs = turnDiffs(turn);
  if (!diffs.length) return null;

  const card = el('div', 'turn-files');
  const head = el('div', 'tf-head');
  const ico = el('span', 'tf-ico');
  ico.innerHTML = ICON.edited;
  head.appendChild(ico);

  const tit = el('div', 'tf-tit');
  tit.appendChild(el('div', 'tf-title', `已编辑 ${diffs.length} 个文件`));
  const sum = el('div', 'tf-sum');
  sum.innerHTML = tfCount({
    additions: diffs.reduce((n, d) => n + d.additions, 0),
    deletions: diffs.reduce((n, d) => n + d.deletions, 0)
  });
  tit.appendChild(sum);
  head.appendChild(tit);

  const open = el('button', 'tf-open', '审阅');
  open.type = 'button';
  open.addEventListener('click', () => focusReviewDiff(diffs[0].path));
  head.appendChild(open);
  card.appendChild(head);

  // 路径是相对工作区的，带上工作区名才认得出是哪个仓库改的（和进度浮标一个口径）；
  // workspaceId 没落盘，重开会话时按当前会话的工作区算，一个会话只属于一个工作区
  const wsName = workspaceOf(turn.workspaceId ?? active()?.workspaceId)?.name;
  const root = wsName ? `${wsName}/` : '';
  const list = el('div', 'tf-list');
  diffs.forEach((d, i) => {
    const row = el('div', 'tf-file');
    row.appendChild(el('span', 'tf-path', root + d.path));
    const n = el('span', 'tf-count');
    n.innerHTML = tfCount(d);
    row.appendChild(n);
    row.title = '在审阅面板中查看改动';
    row.addEventListener('click', () => focusReviewDiff(d.path));
    if (i >= FILES_PREVIEW) row.classList.add('tf-rest');
    list.appendChild(row);
  });
  card.appendChild(list);

  const rest = diffs.length - FILES_PREVIEW;
  if (rest > 0) {
    const fold = el('button', 'tf-fold');
    fold.type = 'button';
    const label = el('span', null, `再显示 ${rest} 个文件`);
    const caret = el('span');
    caret.innerHTML = ICON.chevron;
    fold.append(label, caret);
    fold.addEventListener('click', () => {
      const on = card.classList.toggle('open');
      label.textContent = on ? '收起' : `再显示 ${rest} 个文件`;
    });
    card.appendChild(fold);
  }
  return card;
}

/** 执行中浮标已经在报步数和文件数，这张卡只在收尾后出现；迟到的 diff 事件要重画一次 */
function renderTurnFiles(turn) {
  if (!turn._body) return;
  turn._filesCard?.remove();
  turn._filesCard = null;
  if (!turn.finishedAt) return;
  const card = buildTurnFiles(turn);
  if (!card) return;
  turn._filesCard = card;
  turn._body.appendChild(card);
  if (turn._meta && turn._meta.parentNode === turn._body) turn._body.appendChild(turn._meta);
}

/* ---------------- 主区渲染 ---------------- */

function renderStream() {
  const session = active();
  const host = turnsHost();
  host.innerHTML = '';

  const empty = emptyNode();
  empty.style.display = (!session || session.turns.length === 0) ? '' : 'none';
  empty.classList.toggle('no-ws', app.workspaces.length === 0);
  if (session) {
    // 已压缩的那部分上面插一条摘要说明，剩下的仍然是完整对话，只是不再进上下文
    const cut = Math.min(session.compressedThrough ?? 0, session.turns.length);
    session.turns.forEach((turn, index) => {
      if (index === cut && session.digest?.text) host.appendChild(buildDigestCard(session, cut));
      host.appendChild(buildTurn(turn));
    });
    // 全折进摘要时 cut 落在最后一条之后，循环里插不进去，得在末尾补一条，否则压缩痕迹就没了
    if (cut === session.turns.length && session.digest?.text) host.appendChild(buildDigestCard(session, cut));
  }

  $('#sessionTitle').textContent = session ? session.title : '新的任务';
  renderQueue();
  renderMonitor();
  syncChip(session);
  renderReview(session);
  scheduleContextRefresh();
  scrollBottom();
}

function scrollBottom() {
  const s = streamHost();
  s.scrollTop = s.scrollHeight;
}

/* ---------------- 侧栏 ---------------- */

function renderSidebar() {
  closeMenu();
  const host = $('#workspaces');
  host.innerHTML = '';
  sortedWorkspaces().forEach(ws => host.appendChild(buildWsGroup(ws)));
}

function buildWsGroup(ws) {
  const group = el('div', `ws-group${app.collapsed.has(ws.id) ? ' collapsed' : ''}`);
  group.dataset.ws = ws.id;

  const name = el('div', `ws-name${ws.id === app.activeWorkspaceId ? ' current' : ''}`);
  name.innerHTML = ICON.chevron
    + ICON.folder
    + `<span class="ws-label" title="${escHtml(ws.path)}">${escHtml(ws.name)}</span>`
    + (ws.pinned ? `<span class="ws-pin" title="已置顶">${ICON.pin}</span>` : '');

  const add = el('button', 'ws-add');
  add.title = '在此工作区新建会话';
  add.innerHTML = ICON.plus;
  add.addEventListener('click', e => {
    e.stopPropagation();
    newSession(ws.id);
  });

  const more = el('button', 'ws-more');
  more.title = '工作区操作';
  more.innerHTML = ICON.dots;
  more.addEventListener('click', e => {
    e.stopPropagation();
    openWsMenu(ws.id, more);
  });

  name.appendChild(add);
  name.appendChild(more);
  name.addEventListener('click', () => {
    if (app.collapsed.has(ws.id)) app.collapsed.delete(ws.id);
    else app.collapsed.add(ws.id);
    group.classList.toggle('collapsed');
  });
  group.appendChild(name);

  const list = el('div', 'ws-sessions');
  sessionsOf(ws.id).forEach(session => list.appendChild(buildSessionRow(session)));
  group.appendChild(list);
  return group;
}

function buildSessionRow(session) {
  const row = el('div', `sess${session.id === app.activeId ? ' active' : ''}${session.status === 'failed' ? ' failed' : ''}`);
  row.dataset.sess = session.id;
  row.appendChild(el('div', 'sess-title', session.title));

  const flag = el('div');
  flag.innerHTML = ICON.alert;
  row.appendChild(flag.firstChild);

  const more = el('button', 'sess-more');
  more.innerHTML = ICON.dots;
  more.addEventListener('click', e => {
    e.stopPropagation();
    openSessMenu(session.id, more);
  });
  row.appendChild(more);

  row.addEventListener('click', () => selectSession(session.id));
  return row;
}

function chipFor(session) {
  const last = session && session.turns[session.turns.length - 1];
  if (!last || !last.source) return ['就绪', ''];
  return last.source === 'ai' ? ['AI 执行', 'ai'] : ['本地规则', 'fb'];
}

function syncChip(session) {
  const [text, kind] = chipFor(session);
  const chip = $('#engineChip');
  chip.textContent = text;
  chip.className = 'chip' + (kind ? ' ' + kind : '');
}

/* ---------------- 弹出菜单 ---------------- */

let menuTarget = null;

function popup(menuId, anchor, width, up) {
  const menu = $(menuId);
  const host = anchor.closest('.sess, .ws-name');
  if (host) host.classList.add('menu-open');   // 先让按钮可见，否则 rect 为 0

  const source = anchor.getBoundingClientRect().width ? anchor : host;
  const rect = source.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(rect.right - width, innerWidth - width - 8))}px`;
  // 输入框在窗口底部，菜单需要向上弹出，用 bottom 定位可以省去测高度
  if (up) {
    menu.style.top = '';
    menu.style.bottom = `${innerHeight - rect.top + 6}px`;
  } else {
    menu.style.bottom = '';
    menu.style.top = `${Math.min(rect.bottom + 4, innerHeight - 120)}px`;
  }
  menu.classList.add('open');
}

function openSessMenu(sessionId, anchor) {
  menuTarget = sessionId;
  popup('#sessMenu', anchor, 136);
}

function openWsMenu(workspaceId, anchor) {
  menuTarget = workspaceId;
  const ws = workspaceOf(workspaceId);
  $('#wsPin').textContent = ws && ws.pinned ? '取消置顶' : '置顶工作区';
  popup('#wsMenu', anchor, 148);
}

function closeMenu() {
  ['#sessMenu', '#wsMenu', '#modelMenu', '#brMenu', '#brAddMenu'].forEach(sel => $(sel).classList.remove('open'));
  document.querySelectorAll('.menu-open').forEach(r => r.classList.remove('menu-open'));
  menuTarget = null;
}

document.addEventListener('click', e => {
  if (!e.target.closest('.menu') && !e.target.closest('.sess-more, .ws-more, #modelBtn, #brMore, #btnAdd')) closeMenu();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeMenu();
    if (ctxState.open) toggleCtxCard(false);
    // 钉在右侧的那一栏算布局，不该被 Esc 关掉；浮起来的那份 Esc 一定要能收，吸住也不例外
    if (monitor.open && monitorFloats()) setMonitor(false);
  }
});

$('#sessMenu').addEventListener('click', e => {
  const act = e.target.dataset.act;
  const id = menuTarget;
  closeMenu();
  if (!id || !act) return;
  if (app.busy) { nudge(); return; }

  if (act === 'delete') {
    const index = app.sessions.findIndex(s => s.id === id);
    if (index < 0) return;
    const session = app.sessions[index];
    if (session.turns.length && !confirm(`删除会话「${session.title}」？`)) return;
    app.sessions.splice(index, 1);
    if (app.activeId === id) {
      const siblings = sessionsOf(session.workspaceId);
      const next = siblings.length ? siblings[Math.min(index, siblings.length - 1)] : createSession(session.workspaceId);
      app.activeId = null;
      selectSession(next.id);
    }
    renderSidebar();
    persist();
  }

  if (act === 'rename') startRename(id);
});

$('#wsMenu').addEventListener('click', async e => {
  const act = e.target.dataset.act;
  const id = menuTarget;
  closeMenu();
  if (!id || !act) return;
  if (app.busy) { nudge(); return; }

  const ws = workspaceOf(id);
  if (!ws) return;

  if (act === 'rename') return startWsRename(id);
  if (act === 'pin') return applyWorkspaces(await woder.workspace.update(id, { pinned: !ws.pinned }));
  if (act === 'remove') {
    if (!confirm(`从侧栏移除工作区「${ws.name}」？磁盘文件不会被删除。`)) return;
    const res = await woder.workspace.remove(id);
    if (!res.success) return alert(res.message ?? '移除失败');
    applyWorkspaces(res);
  }
});

async function addWorkspace() {
  const res = await woder.workspace.add();
  if (!res.success || res.canceled) return;
  const previous = new Set(app.workspaces.map(w => w.id));
  applyWorkspaces(res);
  const fresh = app.workspaces.find(w => !previous.has(w.id));
  if (fresh) newSession(fresh.id);
}

function applyWorkspaces(res) {
  if (!res || !res.workspaces) return;
  app.workspaces = res.workspaces;
  if (!workspaceOf(app.activeWorkspaceId)) {
    const first = app.workspaces[0];
    if (!first) {
      // 最后一个工作区被移走：回到「还没有工作区」的空状态，归属它的那些会话留在磁盘上
      app.activeId = null;
      app.activeWorkspaceId = null;
      renderStream();
      renderSidebar();
      refreshTree(null);
      return;
    }
    const fallback = sessionsOf(first.id)[0] ?? null;
    if (fallback) {
      app.activeId = fallback.id;
      app.activeWorkspaceId = fallback.workspaceId;
      renderStream();
    } else {
      app.activeId = null;
      app.activeWorkspaceId = first.id;
      newSession(first.id);
      return;
    }
  }
  renderSidebar();
  refreshTree(app.activeWorkspaceId);
}

function startWsRename(id) {
  const ws = workspaceOf(id);
  const row = document.querySelector(`#workspaces .ws-group[data-ws="${id}"] .ws-name`);
  if (!ws || !row) return;
  const label = row.querySelector('.ws-label');
  const input = el('input', 'ws-rename');
  input.value = ws.name;
  label.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const commit = async () => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    if (value && value !== ws.name) applyWorkspaces(await woder.workspace.update(id, { name: value }));
    else renderSidebar();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !composing(e)) commit();
    if (e.key === 'Escape') { done = true; renderSidebar(); }
  });
  input.addEventListener('click', e => e.stopPropagation());
}

function startRename(id) {
  const session = app.sessions.find(s => s.id === id);
  const row = document.querySelector(`#workspaces .sess[data-sess="${id}"]`);
  if (!session || !row) return;
  const titleEl = row.querySelector('.sess-title');
  const input = el('input', 'sess-rename');
  input.value = session.title;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    if (value) {
      session.title = value;
      persist();
    }
    renderSidebar();
    if (app.activeId === id) $('#sessionTitle').textContent = session.title;
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !composing(e)) commit();
    if (e.key === 'Escape') { done = true; renderSidebar(); }
  });
}

/* ---------------- 右侧审阅 ---------------- */

function turnDiffs(turn) {
  const byPath = new Map();
  (turn?.events ?? []).forEach(ev => { if (ev.diff) byPath.set(ev.diff.path, ev.diff); });
  return [...byPath.values()];
}

function sessionDiffs(session) {
  const byPath = new Map();
  (session?.turns ?? []).forEach(turn => turnDiffs(turn).forEach(d => byPath.set(d.path, d)));
  return [...byPath.values()];
}

function renderReview(session) {
  const body = $('#reviewBody');
  body.innerHTML = '';
  const diffs = sessionDiffs(session);

  const add = diffs.reduce((n, d) => n + d.additions, 0);
  const del = diffs.reduce((n, d) => n + d.deletions, 0);
  $('#diffStat').innerHTML = `<span class="add">+${add}</span><span class="del">−${del}</span>`;

  if (diffs.length === 0) {
    const empty = el('div', 'review-empty');
    empty.innerHTML = REVIEW_EMPTY;
    body.appendChild(empty);
    return;
  }

  diffs.forEach(d => {
    const card = el('div', 'diff-card');
    // 进度浮标的文件清单点进来靠这个找卡片
    card.dataset.path = d.path;
    const head = el('div', 'diff-head');
    head.innerHTML = ICON.chev + ICON.file;
    head.appendChild(el('div', 'diff-path', d.path));
    const count = el('div', 'diff-count');
    count.innerHTML = `<span class="add">+${d.additions}</span><span class="del">−${d.deletions}</span>`;
    head.appendChild(count);
    head.addEventListener('click', () => card.classList.toggle('open'));
    card.appendChild(head);

    const lines = el('div', 'diff-lines');
    d.lines.forEach(l => {
      const fold = l.oldNo === null && l.newNo === null;
      const row = el('div', `dl ${l.kind}${fold ? ' fold' : ''}`);
      row.appendChild(el('div', 'g', fold || l.oldNo === null ? '' : String(l.oldNo)));
      row.appendChild(el('div', 'g', fold || l.newNo === null ? '' : String(l.newNo)));
      row.appendChild(el('div', 't', l.text));
      lines.appendChild(row);
    });
    card.appendChild(lines);
    body.appendChild(card);
  });
}

/** 目录折叠状态只在本次运行里记：重开应用回到全展开，符合「树是临时挑文件的地方」这个定位 */
const treeFolded = new Set();
let treeQuery = '';

/** 筛选时目录要跟着命中：只要子树里有对得上的文件就保留，并且强制展开 */
function treeHit(node) {
  if (!treeQuery) return true;
  if (node.kind !== 'directory') return node.path.toLowerCase().includes(treeQuery);
  return (node.children || []).some(treeHit);
}

function renderTree(nodes, depth, host, changed) {
  nodes.forEach(node => {
    if (!treeHit(node)) return;
    const isDir = node.kind === 'directory';
    const row = el('div', `tnode${isDir ? ' dir' : ''}`);
    row.style.paddingLeft = `${6 + depth * 13}px`;
    if (isDir) {
      const open = !treeFolded.has(node.path) || !!treeQuery;
      row.innerHTML = `<svg viewBox="0 0 24 24" class="i tw${open ? '' : ' shut'}"><path d="M9 6l6 6-6 6"/></svg>` + ICON.folder;
      row.appendChild(el('span', null, node.name));
      host.appendChild(row);
      row.addEventListener('click', () => {
        if (treeQuery) return;                       // 筛选时展开状态是临时的，点了也不该改到记住的折叠上
        if (treeFolded.has(node.path)) treeFolded.delete(node.path); else treeFolded.add(node.path);
        repaintTree();
      });
      if (open && node.children) renderTree(node.children, depth + 1, host, changed);
      return;
    }
    row.innerHTML = ICON.file;
    row.appendChild(el('span', null, node.name));
    row.dataset.path = node.path;
    row.title = node.path;
    if (changed.has(node.path)) row.classList.add('changed');
    row.addEventListener('click', () => pickFile(node.path));
    host.appendChild(row);
  });
}

/** 最近一次读到的树和改动集合：折叠、筛选都只重画，不再读盘 */
let treeData = { nodes: [], changed: new Set() };

function repaintTree() {
  const host = $('#filesBody');
  host.innerHTML = '';
  renderTree(treeData.nodes, 0, host, treeData.changed);
  markTreeFile();
}

async function refreshTree(workspaceId) {
  const ws = workspaceOf(workspaceId) ?? app.workspaces[0];
  if (!ws) return clearWorkspaceUi();
  const res = await woder.workspace.tree(ws.id);
  if (!res.success) return;
  app.activeWorkspaceId = ws.id;
  app.workspace = res.workspace;

  $('#accountPath').textContent = res.workspace;
  $('#footWorkspace').textContent = ws.name;
  $('#repoName').textContent = ws.name;

  treeData = { nodes: res.tree, changed: new Set(sessionDiffs(active()).map(d => d.path)) };
  repaintTree();
}

/** 零工作区：页脚、审阅副标题和文件树都清成「还没选」，别留着上一个工作区的名字 */
function clearWorkspaceUi() {
  app.workspace = '';
  $('#accountPath').textContent = '未选择工作区';
  $('#footWorkspace').textContent = '未选择工作区';
  $('#repoName').textContent = '未选择工作区';
  treeData = { nodes: [], changed: new Set() };
  repaintTree();
}

/* ---------------- 文件查看器：预览 / 编辑 ---------------- */

const MD_EXT = /\.(md|markdown)$/i;

/** 一次只看一个文件；text 是编辑缓冲区，saved 是磁盘上那份，两者不等就是没保存 */
const fileView = { path: null, text: '', saved: '', mtime: 0, mode: 'preview', error: '', conflict: false };
/** 面板只有 440px，树和正文挤不下两栏，所以默认把树藏起来，挑文件时再点开 */
const TREE_KEY = 'woder.treeShown';
let treeShown = localStorage.getItem(TREE_KEY) !== '0';
let fileSeq = 0;

const fileOpen = () => !!fileView.path;
const fileDirty = () => fileOpen() && !fileView.error && fileView.text !== fileView.saved;

/** 相对路径的图片、链接以当前文件所在目录为基准 */
function mdBase() {
  const dir = fileView.path.includes('/') ? fileView.path.slice(0, fileView.path.lastIndexOf('/')) : '';
  return `${app.workspace}/${dir}`;
}

function markTreeFile() {
  document.querySelectorAll('#filesBody .tnode[data-path]').forEach(row => {
    const same = row.dataset.path === fileView.path;
    row.classList.toggle('active', same);
    row.classList.toggle('dirty', same && fileDirty());
  });
}

/** 树上点一下：已经在看的那个直接忽略，别重新读盘把未保存的缓冲冲掉 */
function pickFile(relPath) {
  if (relPath === fileView.path) return;
  openFile(relPath);
}

async function openFile(relPath, force = false) {
  if (!force && fileDirty() && !confirm('当前文件还没保存，放弃这些修改？')) return;
  const wsId = app.activeWorkspaceId ?? undefined;
  const seq = ++fileSeq;
  const res = await woder.workspace.read(relPath, wsId);
  // 读盘期间又点了别的文件，这份旧结果就直接丢掉，不然内容会串台
  if (seq !== fileSeq) return;
  Object.assign(fileView, {
    path: relPath,
    error: res.success ? '' : String(res.message || '打不开这个文件'),
    conflict: !!res.conflict,
    text: res.success ? res.content : '',
    mtime: res.mtime || 0,
    mode: MD_EXT.test(relPath) ? 'preview' : 'edit'
  });
  fileView.saved = fileView.text;
  renderFileView();
}

function closeFile() {
  if (fileDirty() && !confirm('当前文件还没保存，放弃这些修改？')) return;
  fileSeq++;
  Object.assign(fileView, { path: null, text: '', saved: '', mtime: 0, error: '', conflict: false });
  renderFileView();
}

async function saveFile() {
  if (!fileDirty()) return;
  const res = await woder.workspace.write(fileView.path, fileView.text, app.activeWorkspaceId ?? undefined, fileView.mtime);
  if (!res.success) {
    Object.assign(fileView, { error: res.message, conflict: !!res.conflict });
    renderFileView();
    return;
  }
  fileView.saved = fileView.text;
  fileView.mtime = res.mtime;
  // 预览本来就是按缓冲区画的，落盘后不用重画，重画反而把编辑区的光标弄丢
  syncDirty();
}

function syncDirty() {
  const save = $('#fvSave');
  if (save) save.disabled = !fileDirty();
  const dot = $('#fvDot');
  if (dot) dot.hidden = !fileDirty();
  markTreeFile();
}

function fvModeBtn(mode, icon, tip) {
  const b = el('button', `fv-mode${fileView.mode === mode ? ' on' : ''}`);
  b.type = 'button';
  b.title = tip;
  b.innerHTML = ICON[icon];
  b.addEventListener('click', () => {
    if (fileView.mode === mode) return;
    fileView.mode = mode;
    renderFileView();
  });
  return b;
}

function renderFileView() {
  const host = $('#fileView');
  const bar = $('#fvBar');
  const showing = fileOpen();
  host.innerHTML = '';
  bar.innerHTML = '';
  host.hidden = !showing;
  bar.hidden = !showing;
  // 没打开文件时树独占整块面板；打开后按开关决定要不要并排
  $('#treeCol').hidden = showing && !treeShown;
  if (!showing) { markTreeFile(); return; }

  /* 工具栏横跨整块面板固定在顶上：左边文件名，右边预览/编辑、保存、树开关、关闭 */
  const left = el('div', 'fv-left');
  const right = el('div', 'fv-right');
  const crumbs = el('div', 'fv-crumbs');
  const parts = [workspaceOf(app.activeWorkspaceId)?.name ?? '工作区', ...fileView.path.split('/')];
  crumbs.appendChild(el('span', 'fv-crumb', parts.length > 1 ? `${parts.slice(0, -1).join(' › ')} ›` : ''));
  crumbs.appendChild(el('b', null, parts[parts.length - 1]));
  const dot = el('span', 'fv-dot', '•');
  dot.id = 'fvDot';
  dot.title = '有未保存的修改';
  crumbs.appendChild(dot);
  crumbs.title = fileView.path;
  left.appendChild(crumbs);

  if (fileView.error) {
    if (fileView.conflict) {
      const again = el('button', 'fv-save', '重新载入');
      again.type = 'button';
      again.title = '丢弃当前缓冲，读回磁盘上那份';
      again.addEventListener('click', () => openFile(fileView.path, true));
      right.appendChild(again);
    }
  } else {
    if (MD_EXT.test(fileView.path)) {
      const seg = el('div', 'fv-seg');
      seg.appendChild(fvModeBtn('preview', 'eye', '预览'));
      seg.appendChild(fvModeBtn('edit', 'edit', '编辑'));
      right.appendChild(seg);
    }
    const save = el('button', 'fv-save', '保存');
    save.type = 'button';
    save.id = 'fvSave';
    save.title = `${modKey}S`;
    save.addEventListener('click', saveFile);
    right.appendChild(save);
  }

  const tg = el('button', `icon-btn fv-tree${treeShown ? ' on' : ''}`);
  tg.type = 'button';
  tg.title = treeShown ? '隐藏文件树' : '显示文件树';
  tg.innerHTML = ICON.folder;
  tg.addEventListener('click', () => {
    treeShown = !treeShown;
    localStorage.setItem(TREE_KEY, treeShown ? '1' : '0');
    renderFileView();
  });
  right.appendChild(tg);

  const x = el('button', 'icon-btn fv-close');
  x.type = 'button';
  x.title = '关闭文件';
  x.innerHTML = ICON.close;
  x.addEventListener('click', closeFile);
  right.appendChild(x);
  bar.append(left, right);

  const body = el('div', 'fv-body');
  if (fileView.error) {
    const msg = el('div', 'fv-msg');
    msg.appendChild(el('p', null, fileView.error));
    msg.appendChild(el('span', null, fileView.path));
    body.appendChild(msg);
  } else if (fileView.mode === 'edit') {
    const ta = el('textarea', 'fv-edit');
    ta.value = fileView.text;
    ta.spellcheck = false;
    ta.addEventListener('input', () => {
      fileView.text = ta.value;
      syncDirty();
    });
    body.appendChild(ta);
    ta.focus();
  } else {
    const md = el('div', 'fv-md');
    MD.render(md, fileView.text, mdBase());
    // 主窗口没装 setWindowOpenHandler，链接不接管的话 target 会开出一个空白 Electron 窗口
    md.addEventListener('click', e => {
      const a = e.target.closest('a.md-link');
      if (!a) return;
      e.preventDefault();
      if (/^(https?:|mailto:)/i.test(a.getAttribute('href'))) woder.browser.openExternal(a.href);
    });
    body.appendChild(md);
  }
  host.appendChild(body);
  syncDirty();
}

document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's') return;
  if (!fileOpen() || fileView.error) return;
  e.preventDefault();
  saveFile();
});

/* ---------------- 面板页签 ---------------- */

/**
 * 四个大页签都能关：× 悬停时才显形，顶掉左边的图标位（见 .review-tab .tab-x）。
 * 全关掉以后面板区留一张「打开 XX」的入口页，不至于整块空着。
 */
const PANELS = {
  review: { name: '审阅', icon: 'file' },
  // 页签条一共就 270px 出头，「工作区文件」五个字放不下，所以简称走 tooltip
  files: { name: '文件', tip: '工作区文件', icon: 'folder' },
  browser: { name: '浏览器', icon: 'globe' },
  terminal: { name: '终端', icon: 'terminal' }
};
const PANEL_ORDER = ['review', 'files', 'browser', 'terminal'];
const panelOpen = ['review', 'files'];
let panelActive = 'review';

function renderPanelTabs() {
  const strip = $('#panelTabs');
  strip.innerHTML = '';
  for (const kind of PANEL_ORDER) {
    if (!panelOpen.includes(kind)) continue;
    const cfg = PANELS[kind];
    const tab = el('button', `review-tab${kind === panelActive ? ' active' : ''}`);
    tab.type = 'button';
    tab.title = cfg.tip ?? cfg.name;
    tab.innerHTML = ICON[cfg.icon];
    tab.appendChild(el('span', null, cfg.name));
    const x = el('button', 'tab-x');
    x.type = 'button';
    x.title = `关闭${cfg.tip ?? cfg.name}`;
    x.innerHTML = ICON.close;
    x.addEventListener('click', e => { e.stopPropagation(); closePanel(kind); });
    tab.appendChild(x);
    tab.addEventListener('click', () => setPanel(kind));
    strip.appendChild(tab);
  }
  // 四个页签全开时这条会横向溢出，新激活的那个得滚进视野，不然看着像没反应
  strip.querySelector('.review-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function setPanel(kind) {
  // 最后一个页签被关掉以后没有可显示的内容了，退到那张「打开 XX」入口页
  if (!PANELS[kind]) return showPanelEmpty();
  panelActive = kind;
  $('#panelEmpty').hidden = true;
  const browser = kind === 'browser';
  if (!browser && brZoom !== 'none') {
    brZoom = 'none';
    applyZoom();
  }

  renderPanelTabs();
  $('#reviewBody').style.display = kind === 'review' ? '' : 'none';
  $('#filesWrap').style.display = kind === 'files' ? '' : 'none';
  $('#reviewSub').style.display = kind === 'review' ? '' : 'none';
  $('#browserBody').classList.toggle('on', browser);
  $('#termBody').classList.toggle('on', kind === 'terminal');
  $('#btnRefreshTree').hidden = kind !== 'files';
  $('#btnZoomMax').hidden = !browser;
  $('#btnZoomSplit').hidden = !browser;
  if (browser) renderBrowser();
  if (kind === 'terminal') renderTerminal();
}

/** 四个面板全关掉：内容区换成入口页，页签条、子标题栏和工具栏那几个按钮一起清空 */
function showPanelEmpty() {
  panelActive = null;
  if (brZoom !== 'none') {
    brZoom = 'none';
    applyZoom();
  }
  renderPanelTabs();
  $('#panelEmpty').hidden = false;
  $('#reviewBody').style.display = 'none';
  $('#filesWrap').style.display = 'none';
  $('#reviewSub').style.display = 'none';
  $('#browserBody').classList.remove('on');
  $('#termBody').classList.remove('on');
  $('#btnRefreshTree').hidden = true;
  $('#btnZoomMax').hidden = true;
  $('#btnZoomSplit').hidden = true;
}

/** 面板页签不存在就新建；已经在的，再往里加一个子页签（newSub=false 时沿用现有页签） */
function openPanel(kind, newSub = true) {
  if (!PANELS[kind]) return;
  // 模型让「打开网页」时面板可能正被用户收着，先展开，否则这一步看起来什么都没发生
  if (!layout.review) {
    layout.review = true;
    applyLayout();
  }
  if (!panelOpen.includes(kind)) {
    panelOpen.push(kind);
    panelOpen.sort((a, b) => PANEL_ORDER.indexOf(a) - PANEL_ORDER.indexOf(b));
  }
  setPanel(kind);
  // 空的必须先给一个页签，不然面板里什么都没有。
  // 「+」菜单再点一次是「再来一个」，模型 browser.open 则沿用已经打开的那个页签。
  if (kind === 'browser' && (!brTabs.length || newSub)) newTab();
  if (kind === 'terminal' && (!tmTabs.length || newSub)) newTerm();
}

function closePanel(kind) {
  const i = panelOpen.indexOf(kind);
  if (i < 0) return;
  panelOpen.splice(i, 1);
  // 销毁完顺手重画一次子页签条：setPanel 只画当前激活那块，不补的话关掉的页签会留在隐藏的条子里
  if (kind === 'browser') { brTabs.slice().forEach(t => destroyTab(t.id)); renderBrowser(); }
  if (kind === 'terminal') { tmTabs.slice().forEach(t => destroyTerm(t.id)); renderTerminal(); }
  // 关到最后一个时 panelOpen[...] 是 undefined，setPanel 会自己换成入口页
  setPanel(panelActive === kind ? panelOpen[Math.max(0, i - 1)] : panelActive);
}

/** 面板内的子页签条：浏览器和终端共用，差别只在图标、标题和点上之后干什么 */
function subTab(iconSvg, label, active, onClose, onPick) {
  const node = el('div', `sub-tab${active ? ' active' : ''}`);
  node.innerHTML = iconSvg;
  node.appendChild(el('span', null, label));
  const x = el('button', 'tab-x');
  x.type = 'button';
  x.title = '关闭标签页';
  x.innerHTML = ICON.close;
  x.addEventListener('click', e => { e.stopPropagation(); onClose(); });
  node.appendChild(x);
  node.addEventListener('click', onPick);
  return node;
}

function subAdd(title, onAdd) {
  const add = el('button', 'tab-add');
  add.type = 'button';
  add.title = title;
  add.innerHTML = ICON.plus;
  add.addEventListener('click', onAdd);
  return add;
}

// 页签条先按默认状态画出来，等 init 异步跑完会再刷一次
renderPanelTabs();

/* ---------------- 执行流程 ---------------- */

let runToken = 0;
let busyTimer = null;

const showNote = (turn, text) => {
  const node = turn._body && turn._body.querySelector('.msg-text');
  if (!node) return;
  node.textContent = text;
  node.hidden = !text;
};

/** 主进程给的原因形如 "Error: AI 规划失败：Request timed out."，压成一行短句 */
const cleanReason = raw => String(raw)
  .replace(/^Error:\s*/, '')
  .replace(/\s+/g, ' ')
  .slice(0, 90);

/**
 * busy 期间把发送键换成停止键，并在页脚显示已等待秒数，
 * 避免模型响应慢时整个界面看起来像卡死。
 */
function setBusy(on, label) {
  app.busy = on;
  renderProgress();          // 忙不忙决定进度条露不露
  $('#sendBtn').hidden = on;
  $('#stopBtn').hidden = !on;
  $('#input').placeholder = on
    ? '任务进行中，再发的内容会先进队列，本轮跑完自动发出'
    : '描述你想完成的任务，Enter 发送 / Shift+Enter 换行';
  clearInterval(busyTimer);
  busyTimer = null;
  if (!on) { $('#footStatus').textContent = '就绪'; return; }
  const t0 = Date.now();
  const tick = () => {
    $('#footStatus').textContent = `${label}… ${Math.round((Date.now() - t0) / 1000)}s`;
  };
  tick();
  busyTimer = setInterval(tick, 1000);
}

/** 忙的时候给个明确反馈，而不是点了没反应 */
function nudge() {
  if (!app.busy) return;
  $('#footStatus').textContent = '有任务进行中 · 可点右下角停止';
}

/**
 * 停止当前任务：让主进程翻掉这一轮的取消令牌，正在跑的命令会被终止，后面的步骤不再发起。
 * 界面不等回执，挂着的步骤立刻落成「已跳过」，点了就该停下来。
 */
function cancelRun() {
  if (!app.busy) return;
  runToken++;
  // 问答卡开着时按停止：先把这个问题退回去，否则主进程那一步要挂到超时
  rejectAsk('你停止了这次任务');
  const turn = app.liveTurn;
  if (turn) {
    woder.task.cancel(turn.plan?.taskId ?? '');
    // 还挂在执行中/待执行的步骤落成「已跳过」，不然结果被丢弃后转圈永不停
    turn._rt?.cells.forEach(cell => {
      if (cell.status === 'running' || cell.status === 'pending') {
        applyEvent(turn, { stepId: cell.step.id, tool: cell.step.action, status: 'skipped' });
      }
    });
    turn.note = '已停止，可修改需求后重新发送。';
    showNote(turn, turn.note);
  }
  finish(false);
}

async function submit(rawText, queuedImages) {
  const text = (rawText ?? $('#input').value).trim();
  if (!text) return;
  if (app.busy) {
    // 任务跑着的时候不再挡回去，这条先进队列，本轮收尾后自动发
    const waiting = pendingImages.slice();
    clearAttach();
    $('#input').value = '';
    autosize();
    queueMessage(text, waiting);
    return;
  }

  const session = active();
  if (!session) return needWorkspace();
  const token = ++runToken;
  // 历史要在本轮入栈之前取，否则这一轮的空壳会被当成「上文」发给模型
  const history = sessionHistory(session);

  // 从队列里发出来的那条不碰输入框，用户可能正在写下一条
  if (rawText === undefined) {
    $('#input').value = '';
    autosize();
  }
  // 图片只随本条需求发给模型：历史里留一句「附了几张图」，不反复重传 base64
  const images = queuedImages ?? pendingImages.slice();
  if (!queuedImages) clearAttach();
  setBusy(true, '规划中');

  const turn = {
    request: text,
    attachments: images.length ? images : null,
    source: null,
    note: '',
    // agentic 没有前置计划：taskId 界面先定下来，步骤等 task:event 回来一条条补进 steps
    plan: {
      taskId: `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      steps: [],
      request: text,
      status: 'running',
      createdAt: new Date().toISOString()
    },
    events: [],
    summary: null,
    // hover 元信息：发送时刻先记下来，完成时刻与用量在收尾时补
    sentAt: Date.now(),
    finishedAt: null,
    usage: null,
    model: null,
    runMs: null,
    workspaceId: session.workspaceId
  };
  session.turns.push(turn);
  app.liveTurn = turn;

  emptyNode().style.display = 'none';
  // plan 已经在了，buildTurn 会顺手把执行树挂上（此刻 0 步，等事件补行）
  turnsHost().appendChild(buildTurn(turn));
  renderProgress();
  renderMonitor();

  if (session.title === '新的任务') {
    session.title = text.length > 24 ? text.slice(0, 24) + '…' : text;
    $('#sessionTitle').textContent = session.title;
    renderSidebar();
  }
  scrollBottom();

  await execute(turn, session, token, history, images);
}

async function execute(turn, session, token, history, images) {
  setBusy(true, app.autoApprove ? '执行中' : '执行中 · 等你放行');
  let res;
  try {
    res = await woder.task.run({
      taskId: turn.plan.taskId,
      request: turn.request,
      history,
      images,
      autoApprove: app.autoApprove
    }, session.workspaceId);
  } catch (err) {
    if (token !== runToken) return;
    turn.note = '执行中断：' + ((err && err.message) || err);
    showNote(turn, turn.note);
    return finish();
  }
  if (token !== runToken) {
    // 按了停止（或另起一轮）之后，这回执只用来补元信息：
    // 这些 token 是真花掉的，用量面板里有它，这条消息上却不该一片空白
    if (res && turn.usage == null) {
      turn.source = res.source ?? 'fallback';
      turn.model = res.model ?? null;
      turn.rounds = res.rounds ?? 0;
      turn.usage = res.usage ?? null;
      turn.usageRecordId = res.usageRecordId ?? null;
      turn.runMs = res.runMs ?? null;
      refreshTurnMeta(turn);
    }
    return;
  }
  if (!res || !res.summary) return finish();

  turn.source = res.source ?? 'fallback';
  turn.model = res.model ?? null;
  turn.rounds = res.rounds ?? 0;
  turn.runMs = res.runMs ?? null;
  // 一轮一条用量：模型调用全在主进程那次 run 里发生，直接取回执
  turn.usage = res.usage ?? null;
  turn.usageRecordId = res.usageRecordId ?? null;
  turn.summary = res.summary;
  // 步骤是跑出来的，回执里那份才是全的；界面按事件补出来的行和它同 id，缺的才补
  (res.steps ?? []).forEach(step => {
    if (!turn.plan.steps.some(s => s.id === step.id)) turn.plan.steps.push(step);
  });
  syncChip(session);
  if (res.reason) {
    // agentic 整条路起不来才会回落，把原因留在正文，别让用户以为模型还在跑
    showNote(turn, `模型没跑通（${cleanReason(res.reason)}），已转本地规则执行。`);
    const fix = el('button', 'link-btn', '模型不可用，去设置 ›');
    fix.addEventListener('click', openSettings);
    turn._body?.appendChild(fix);
  }

  // 汇总不再单独占一条：第一层那行已经写了总步数与失败次数。
  // 最后一条 task:event 可能比这个回执晚到，所以这里只把还挂着的步骤按汇总口径补平，
  // 迟到的事件再进来时会覆盖回去，计数是现算的，不会重复。
  if (turn._rt) {
    turn._rt.cells.forEach(cell => {
      if (cell.status === 'running' || cell.status === 'pending') {
        applyEvent(turn, { stepId: cell.step.id, tool: cell.step.action, status: 'completed' });
      }
    });
    recountRun(turn._rt);
    turn._rt.title.textContent = runTitle(turn._rt);
    turn._rt.right.textContent = runRight(turn._rt, turn);
  }

  if (turn.summary.failed > 0) session.status = 'failed';
  renderSidebar();
  renderReview(session);
  await refreshTree(session.workspaceId);
  finish();
}

function finish(ranToCompletion = true) {
  const turn = app.liveTurn;
  // 主进程那一步可能自己超时结束了，卡还开着就成了孤儿——收掉，别留在输入框上
  if (askPending) rejectAsk('这次任务已经结束，问题没有送达');
  // 取消、失败、跑完都算这一轮收尾，hover 看到的「完成于」就是这一刻
  if (turn && !turn.finishedAt) turn.finishedAt = Date.now();
  if (turn) { refreshTurnMeta(turn); renderTurnFiles(turn); }
  app.liveTurn = null;
  setBusy(false);            // 发送键、停止键、页脚、占位提示一起复位
  persist();
  scheduleContextRefresh();   // 多了一轮问答，右下角的占用要跟着涨
  scheduleAutoCompact();      // 涨过线就自动折一次早期内容
  $('#input').focus();
  // 按了停止就别再自己往下发排队的了，剩下的等用户手动处理
  if (ranToCompletion) drainQueue();
}

woder.onTaskEvent(ev => {
  // 按 taskId 找归属轮次：执行结果可能比 task:event 回执先返回一步，
  // 只看 app.liveTurn 会把这条迟到的事件丢掉，步骤就永远停在转圈状态。
  const session = active();
  const turn = (session?.turns ?? []).slice().reverse().find(t => t.plan && t.plan.taskId === ev.taskId);
  if (!turn) return;
  // 已收尾的轮次不再接受「执行中」：停止后主进程迟到的事件只会把圈重新转起来，
  // 真正的 completed/failed 结果仍照常落上去。
  if (ev.status === 'running' && turn.finishedAt) return;

  turn.events = turn.events ?? [];
  turn.events.push(ev);
  applyEvent(turn, ev);
  if (ev.diff) {
    renderReview(session);
    refreshTree(session?.workspaceId);
    renderTurnFiles(turn);   // 迟到的改动也要进那张卡，不能只更新面板
  }
  if (!app.busy) persist();   // 迟到的事件也要落盘，否则下次打开还是转圈
  scrollBottom();
});

/* ---------------- 排队中的需求 ---------------- */

/**
 * 任务跑着的时候按发送，需求先进队列，而不是被「有任务进行中」挡回去。
 * 队列挂在会话对象上而不是全局：切会话时 selectSession 在 busy 时会拦下，
 * 所以跑任务期间 active() 一定就是正在跑的那个，收尾时直接取它的队首发就行。
 * serialize() 是白名单字段，这些「还没发出去」的内容不会写进会话文件。
 */
const queued = () => active()?.queue ?? [];

function queueMessage(text, images, top) {
  const session = active();
  if (!session) return;
  if (!session.queue) session.queue = [];
  const item = { text, images: images ?? [] };
  // 问答卡的答案要插到最前面：用户等回答时可能又塞了几条，那些都得以此为语境
  if (top) session.queue.unshift(item);
  else session.queue.push(item);
  renderQueue();
}

function renderQueue() {
  const host = $('#msgQueue');
  const items = queued();
  host.innerHTML = '';
  host.hidden = items.length === 0;
  items.forEach((item, i) => host.appendChild(queueCard(item, i)));
}

function qAction(icon, label, tip, onClick) {
  const b = el('button', 'q-act');
  b.type = 'button';
  b.title = tip;
  b.innerHTML = ICON[icon];
  if (label) b.appendChild(el('span', 'q-act-label', label));
  b.addEventListener('click', onClick);
  return b;
}

function queueCard(item, index) {
  const card = el('div', 'q-card');
  card.draggable = true;
  card.dataset.i = index;

  const grip = el('span', 'q-grip');
  grip.innerHTML = ICON.grip;
  grip.title = '拖动调整发送顺序';
  card.appendChild(grip);

  const text = el('div', 'q-text', item.text);
  text.title = item.text;
  card.appendChild(text);

  const acts = el('div', 'q-acts');
  if (item.images.length) acts.appendChild(el('span', 'q-attach', `+${item.images.length} 个附件`));
  acts.appendChild(qAction('interject', '插话', '不打断当前任务，这一轮跑完第一个发它', () => moveQueued(index, 0)));
  acts.appendChild(qAction('edit', '', '改完再发', () => editQueued(index)));
  acts.appendChild(qAction('trash', '', '丢弃这条', () => dropQueued(index)));
  card.appendChild(acts);

  card.addEventListener('dragstart', onQueueDragStart);
  card.addEventListener('dragover', onQueueDragOver);
  card.addEventListener('dragend', onQueueDragEnd);
  return card;
}

function moveQueued(from, to) {
  if (from === to) return;
  const items = queued();
  const [item] = items.splice(from, 1);
  if (!item) return;
  items.splice(to, 0, item);
  renderQueue();
}

/** 编辑：文字和图片一起退回输入框，这条从队列里拿掉 */
function editQueued(index) {
  const items = queued();
  const item = items[index];
  if (!item) return;
  if (item.images.length > MAX_IMAGES - pendingImages.length) {
    attachHint(`一条需求最多 ${MAX_IMAGES} 张图，先移掉几张再编辑`);
    return;
  }
  items.splice(index, 1);
  renderQueue();
  const ta = $('#input');
  // 输入框里可能已经写着下一条，接在后面，别把草稿顶掉
  const head = ta.value.trim();
  ta.value = head ? `${head}\n\n${item.text}` : item.text;
  autosize();
  pendingImages.push(...item.images);
  renderAttachTray();
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

function dropQueued(index) {
  queued().splice(index, 1);
  renderQueue();
}

/* 拖动换序：拖动期间只挪 DOM 节点，数组到松手时按节点上的序号重排。
   中途整列重画会把被拖的节点换掉，浏览器会当场取消这次拖动。 */
let dragNode = null;

function onQueueDragStart(e) {
  dragNode = e.currentTarget;
  dragNode.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  // 不给数据的话有些实现压根不允许拖起来
  e.dataTransfer.setData('text/plain', String(dragNode.dataset.i));
}

function onQueueDragOver(e) {
  const target = e.currentTarget;
  if (!dragNode || target === dragNode) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const kids = [...$('#msgQueue').children];
  // 往后拖落到目标后面，往前拖落到目标前面，看着就是被拖那条挤了过去
  const after = kids.indexOf(dragNode) < kids.indexOf(target);
  $('#msgQueue').insertBefore(dragNode, after ? target.nextSibling : target);
}

function onQueueDragEnd() {
  if (!dragNode) return;
  dragNode = null;
  const session = active();
  if (session?.queue) {
    const order = [...$('#msgQueue').children].map(n => Number(n.dataset.i));
    session.queue = order.map(i => session.queue[i]).filter(Boolean);
  }
  // 卡片上的序号是渲染时闭包绑死的，重排完得重画一遍才对得上
  renderQueue();
}

$('#msgQueue').addEventListener('drop', e => e.preventDefault());

/** 一轮跑完自动发下一条；那条跑完还会回到这里，队列就这样一条条走完 */
function drainQueue() {
  const items = queued();
  if (!items.length || app.busy) return;
  const [item] = items.splice(0, 1);
  renderQueue();
  submit(item.text, item.images);
}

/* ---------------- 输入框 ---------------- */

function autosize() {
  const ta = $('#input');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
}

$('#input').addEventListener('input', autosize);
// 截图直接 ⌘V 进输入框：剪贴板里既有图片又有文字时（比如从网页复制），文字照抄，图片进附件
$('#input').addEventListener('paste', e => {
  const items = [...(e.clipboardData?.items ?? [])];
  const files = items
    .filter(i => i.kind === 'file' && /^image\//.test(i.type))
    .map(i => i.getAsFile())
    .filter(Boolean);
  if (!files.length) return;
  e.preventDefault();
  const text = e.clipboardData.getData('text');
  if (text) {
    const ta = e.currentTarget;
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    autosize();
  }
  addImageFiles(files);
});
$('#input').addEventListener('keydown', e => {
  if (composing(e)) return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
});
$('#sendBtn').addEventListener('click', () => submit());
$('#stopBtn').addEventListener('click', cancelRun);

document.querySelectorAll('.sample').forEach(btn => {
  btn.addEventListener('click', () => {
    $('#input').value = btn.dataset.fill;
    autosize();
    $('#input').focus();
  });
});

$('#btnNewTask').addEventListener('click', () => newSession());
$('#btnAddWs').addEventListener('click', addWorkspace);
$('#btnAddWsEmpty').addEventListener('click', addWorkspace);

$('#approvalBtn').addEventListener('click', () => {
  app.autoApprove = !app.autoApprove;
  $('#approvalLabel').textContent = app.autoApprove ? '自动审批' : '需要确认';
  $('#approvalBtn').classList.toggle('on', !app.autoApprove);
});

/* ---------------- 上下文占用与压缩 ---------------- */

/** 规划时最多带几轮历史：再多收益递减，上下文却涨得飞快 */
const HISTORY_TURNS = 8;
/** 单条历史消息的字符上限，长回复只留开头 */
const HISTORY_CHARS = 600;

const ctxState = { stat: null, open: false, compacting: false, timer: null, flash: null };

/** 自动压缩的触发线：留出余量给下一轮问答和它的输出 */
const AUTO_CTX_RATIO = 0.85;
/** 自动压缩时最近两轮保留原文，只折更早的，免得把追问的语境也摘要掉 */
const AUTO_KEEP_TURNS = 2;
/** 自动压缩失败过的会话记在这里：轮数没继续涨上去就别每轮重试着烧 token */
const autoCompactFailed = new Map();

/** 一轮问答在历史里怎么表示：说话就带原话，动文件就带结论 */
function turnAnswer(turn) {
  const answers = (turn.plan?.steps ?? [])
    .filter(step => step.action === 'ai.answer' && step.params?.text)
    .map(step => step.params.text);
  // 问答卡那一轮要把问题和答案都带上，模型下一轮规划时才知道已经问过、用户选了什么
  (turn.plan?.steps ?? [])
    .filter(step => step.action === 'ask.user')
    .forEach(step => {
      const ev = (turn.events ?? []).filter(e => e.stepId === step.id && e.status === 'completed').pop();
      if (ev?.output) answers.push(`我问了「${step.params?.question ?? ''}」，用户回答：${ev.output}`);
    });
  if (answers.length) return clip(answers.join(' '), HISTORY_CHARS);

  if (turn.summary) {
    const bits = [`完成 ${turn.summary.completed} 步`];
    if (turn.summary.failed) bits.push(`失败 ${turn.summary.failed} 步`);
    if (turn.summary.skipped) bits.push(`跳过 ${turn.summary.skipped} 步`);
    const files = countDiffs(turn);
    return `执行 ${turn.plan?.steps?.length ?? 0} 步（${bits.join('、')}）${files ? `，改动 ${files} 个文件` : ''}`;
  }
  return clip(turn.note ?? '（未完成）', HISTORY_CHARS);
}

/**
 * 会话历史 → 规划请求真正会带上的 messages。
 * 统计和发送共用这一个函数，界面上的百分比才不会是自说自话。
 */
function sessionHistory(session = active()) {
  const from = Math.min(session?.compressedThrough ?? 0, session?.turns?.length ?? 0);
  const turns = (session?.turns ?? []).slice(from).slice(-HISTORY_TURNS);
  const messages = [];
  if (session?.digest?.text) {
    messages.push({ role: 'assistant', content: clip(`早前对话摘要：${session.digest.text}`, HISTORY_CHARS) });
  }
  turns.forEach(turn => {
    // 历史轮的图片不重发（体积考虑），但要让模型知道当时贴过图
    const attach = turn.attachments?.length ? `\n（这条附了 ${turn.attachments.length} 张图片）` : '';
    messages.push({ role: 'user', content: clip(turn.request + attach, HISTORY_CHARS) });
    messages.push({ role: 'assistant', content: turnAnswer(turn) });
  });
  return messages;
}

/** 0.004 → 「<1%」；真的零点几也别说 0%，看着像没统计 */
function pctText(ratio) {
  const pct = (ratio ?? 0) * 100;
  if (pct > 0 && pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}

async function refreshContext() {
  const session = active();
  if (!session) {
    // 没有会话就没有上下文可算，主进程那边也会直接报「没有可用的工作区」
    ctxState.stat = null;
    renderContextChip();
    if (ctxState.open) renderContextCard();
    return;
  }
  const res = await woder.context.stat(
    { history: sessionHistory(session), request: $('#input').value.trim() },
    session?.workspaceId
  );
  if (!res || res.success === false) return;
  ctxState.stat = res;
  renderContextChip();
  if (ctxState.open) renderContextCard();
}

/** 打字时也更新，但按 350ms 合并，别每个字符发一次 IPC */
function scheduleContextRefresh() {
  clearTimeout(ctxState.timer);
  ctxState.timer = setTimeout(refreshContext, 350);
}

function renderContextChip() {
  const stat = ctxState.stat;
  const fill = $('#ctxMiniFill');
  const pct = $('#ctxPct');
  if (!stat) {
    fill.style.width = '0%';
    pct.textContent = '--';
    return;
  }
  // 哪怕只占了 0.2% 也留一小截，完全空的条看起来像坏了
  fill.style.width = `${Math.min(100, Math.max(stat.ratio * 100, stat.used ? 4 : 0))}%`;
  pct.textContent = pctText(stat.ratio);
  $('#ctxChip').title =
    `上下文窗口 ${fmtNum(stat.window)} token · 已用约 ${fmtNum(stat.used)}（${pctText(stat.ratio)}），点击看明细`;
}

/** 点越占比重的条目颜色越深，跟参考图里那几个圆点一个意思 */
function ctxDotClass(ratio) {
  return ratio >= 0.05 ? 'strong' : ratio >= 0.01 ? 'mid' : 'weak';
}

/** 还能压几轮：已经压过的不重复算 */
function compressibleTurns() {
  const session = active();
  const from = Math.min(session?.compressedThrough ?? 0, session?.turns?.length ?? 0);
  return Math.max(0, (session?.turns?.length ?? 0) - from);
}

function renderContextCard() {
  const host = $('#ctxCard');
  const stat = ctxState.stat;
  host.innerHTML = '';

  const head = el('div', 'ctx-head');
  head.appendChild(el('b', null, '上下文窗口'));
  head.appendChild(el('span', 'ctx-pct big', stat ? pctText(stat.ratio) : '--'));
  host.appendChild(head);

  host.appendChild(el('p', 'ctx-desc',
    '展示当前任务的上下文占用情况；压缩会摘要早期内容，需等待片刻并消耗少量 token。占用超过 85% 时，每轮结束会自动压缩一次。'));

  if (!stat) {
    // 没有会话时压根没东西在算，报「正在统计」是骗人的
    host.appendChild(el('p', 'ctx-note', active() ? '正在统计…' : '还没有会话，谈不上上下文占用。'));
    return;
  }

  const bar = el('div', 'ctx-bar wide');
  const fill = el('i');
  fill.style.width = `${Math.min(100, Math.max(stat.ratio * 100, stat.used ? 4 : 0))}%`;
  bar.appendChild(fill);
  host.appendChild(bar);

  host.appendChild(el('p', 'ctx-note',
    `按 ${fmtNum(stat.window)} token 估算 · 已用约 ${fmtNum(stat.used)} token${stat.model?.id ? ` · ${stat.model.id}` : ''}`));

  const rows = el('div', 'ctx-rows');
  stat.sections.forEach(section => {
    const row = el('div', 'ctx-row');
    row.title = `约 ${fmtNum(section.tokens)} token`;
    row.appendChild(el('span', `ctx-dot ${ctxDotClass(section.ratio)}`));
    row.appendChild(el('span', 'ctx-k', section.label));
    row.appendChild(el('span', 'ctx-v', pctText(section.ratio)));
    rows.appendChild(row);
  });
  host.appendChild(rows);

  const left = compressibleTurns();
  const btn = el('button', 'ctx-compact');
  btn.type = 'button';
  btn.innerHTML = `${ICON.compress}<span></span>`;
  btn.querySelector('span').textContent = ctxState.compacting ? '压缩中…' : '压缩上下文';
  btn.disabled = ctxState.compacting || left === 0;
  btn.title = ctxState.compacting
    ? '正在压缩，稍等一下'
    : left === 0
      ? '当前会话还没有可压缩的历史'
      : `把上面 ${left} 轮问答压成一段摘要，腾出上下文`;
  btn.addEventListener('click', () => compactContext());
  host.appendChild(btn);

  if (ctxState.flash) {
    host.appendChild(el('p', ctxState.flash.isError ? 'ctx-flash err' : 'ctx-flash', ctxState.flash.text));
  }
}

function flashCtx(text, isError) {
  ctxState.flash = { text, isError: !!isError };
  renderContextCard();
  clearTimeout(flashCtx.timer);
  flashCtx.timer = setTimeout(() => {
    ctxState.flash = null;
    if (ctxState.open) renderContextCard();
  }, 6000);
}

/**
 * 压缩这一步真的会调模型，压完立刻重算占用，用户能当场看到百分比掉下来。
 * keep 是保留不折的最近轮数（手动压缩为 0，自动压缩留几轮原文）；返回是否真的压成了。
 */
async function compactContext({ keep = 0, auto = false } = {}) {
  if (ctxState.compacting) return false;
  if (app.busy) { if (!auto) nudge(); return false; }
  const session = active();
  if (!session) return false;
  const from = Math.min(session.compressedThrough ?? 0, session.turns.length);
  const turns = session.turns.slice(from, Math.max(from, session.turns.length - keep));
  if (!turns.length) {
    if (!auto) flashCtx('这个会话还没有可压缩的历史', true);
    return false;
  }

  const before = ctxState.stat?.used ?? 0;
  ctxState.compacting = true;
  renderContextCard();

  let res;
  try {
    res = await woder.context.compact({
      lines: turns.map(turn => `需求：${turn.request}\n结果：${turnAnswer(turn)}`)
    }, session.workspaceId);
  } catch (err) {
    ctxState.compacting = false;
    renderContextCard();
    if (!auto) flashCtx(`压缩失败：${(err && err.message) || err}`, true);
    return false;
  }

  ctxState.compacting = false;
  if (!res || res.success === false) {
    renderContextCard();
    if (!auto) flashCtx(res?.message ?? '压缩失败', true);
    return false;
  }

  session.digest = {
    text: res.text,
    at: Date.now(),
    covered: from + turns.length,
    source: res.source,
    reason: res.reason ?? '',
    tokens: res.tokens ?? 0,
    usage: res.usage ?? null
  };
  session.compressedThrough = from + turns.length;
  persist();

  await refreshContext();
  renderStream();
  const freed = Math.max(0, before - (ctxState.stat?.used ?? before));
  if (auto) return true;
  if (res.source === 'ai') {
    flashCtx(`已压缩 ${turns.length} 轮对话${freed ? `，释放约 ${fmtNum(freed)} token` : ''}`);
  } else {
    // 模型报回来的原因只在「配了却失败」时才有信息量，没配置就别重复念一遍
    const why = res.reason && res.reason !== '未接入可用模型' ? `（${res.reason}）` : '';
    flashCtx(`未接入可用模型${why}，已用本地摘要压缩 ${turns.length} 轮对话`);
  }
  return true;
}

/** 一轮收尾后量一次占用，超线就自动压；延后一点是等那几条迟到的 task:event 落定 */
function scheduleAutoCompact() {
  const sessionId = active()?.id;
  clearTimeout(scheduleAutoCompact.timer);
  if (!sessionId) return;
  scheduleAutoCompact.timer = setTimeout(async () => {
    const session = active();
    if (!session || session.id !== sessionId || app.busy || ctxState.compacting) return;
    const failedAt = autoCompactFailed.get(sessionId);
    if (failedAt !== undefined && session.turns.length <= failedAt) return;

    await refreshContext();
    if ((ctxState.stat?.ratio ?? 0) < AUTO_CTX_RATIO) return;

    const turns = session.turns.length;
    if (await compactContext({ keep: AUTO_KEEP_TURNS, auto: true })) autoCompactFailed.delete(sessionId);
    else autoCompactFailed.set(sessionId, turns);
  }, 600);
}

/** 会话记录里的那条分隔线：中间标「已压缩上下文」，点一下展开摘要原文 */
function buildDigestCard(session, count) {
  const digest = session.digest;
  const wrap = el('div', 'ctx-cut');
  const row = el('div', 'ctx-cut-row');

  const meta = [
    `早前 ${count} 轮折成一段摘要`,
    digest.source === 'ai' ? 'AI 摘要' : '本地摘要',
    digest.tokens ? `摘要约 ${fmtNum(digest.tokens)} token` : '',
    digest.usage?.reported ? `压缩用了 ${fmtNum(digest.usage.total)} token` : ''
  ].filter(Boolean).join(' · ');

  const tag = el('button', 'ctx-cut-tag');
  tag.type = 'button';
  tag.title = meta;
  tag.innerHTML = `${ICON.compress}<span>已压缩上下文</span>`;

  const body = el('p', 'ctx-cut-text', digest.text);
  body.hidden = true;
  tag.addEventListener('click', () => { body.hidden = !body.hidden; });

  row.appendChild(el('i', 'ctx-cut-line'));
  row.appendChild(tag);
  row.appendChild(el('i', 'ctx-cut-line'));
  wrap.appendChild(row);
  wrap.appendChild(body);
  return wrap;
}

function positionCtxCard() {
  const host = $('#ctxCard');
  const rect = $('#ctxChip').getBoundingClientRect();
  const box = host.getBoundingClientRect();
  host.style.left = `${Math.max(12, Math.min(rect.right - box.width, window.innerWidth - box.width - 12))}px`;
  host.style.top = `${Math.max(12, rect.top - box.height - 10)}px`;
}

function toggleCtxCard(force) {
  ctxState.open = force ?? !ctxState.open;
  const host = $('#ctxCard');
  host.hidden = !ctxState.open;
  $('#ctxChip').classList.toggle('on', ctxState.open);
  if (!ctxState.open) return;
  renderContextCard();
  positionCtxCard();
  refreshContext();
}

$('#ctxChip').addEventListener('click', e => {
  e.stopPropagation();
  toggleCtxCard();
});

document.addEventListener('click', e => {
  if (!ctxState.open) return;
  if (e.target.closest('#ctxCard') || e.target.closest('#ctxChip')) return;
  toggleCtxCard(false);
});

window.addEventListener('resize', () => {
  if (ctxState.open) positionCtxCard();
});

$('#input').addEventListener('input', scheduleContextRefresh);

/* ---------------- 模型管理 ---------------- */

const DEFAULT_HINT = '一个模型一条配置，Base URL 与 API Key 各自独立；Key 留空表示沿用已保存的那份。';

/** activeId 指向当前用于规划的模型；profiles 每一项都是一条独立配置 */
const cfg = { activeId: '', profiles: [], configured: false };

let newCardSeq = 0;

function applyCfg(res) {
  if (!res || !Array.isArray(res.profiles)) return cfg;
  Object.assign(cfg, {
    activeId: res.activeId ?? '',
    profiles: res.profiles.map(p => ({ ...p })),
    configured: !!res.configured
  });
  return cfg;
}

async function loadAIConfig() {
  return applyCfg(await woder.ai.getConfig());
}

const currentProfile = () => cfg.profiles.find(p => p.id === cfg.activeId) ?? null;

function setHint(text, isError) {
  const hint = $('#cfgHint');
  hint.textContent = text;
  hint.classList.toggle('error', !!isError);
}

function textField(cls, placeholder, value) {
  const input = el('input', cls);
  input.type = 'text';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = value ?? '';
  return input;
}

function cardField(labelText, inputNode) {
  const wrap = el('label', 'field');
  wrap.appendChild(el('span', null, labelText));
  wrap.appendChild(inputNode);
  return wrap;
}

/**
 * 一张模型卡片：名称 + Model ID + Base URL + 各自的 Key，可删除、可设为当前
 */
function modelCard(profile = {}) {
  const card = el('div', 'mcard');
  card.dataset.id = profile.id ?? `mp_new_${Date.now().toString(36)}_${(newCardSeq++).toString(36)}`;
  card._clearKey = false;

  const head = el('div', 'mcard-head');
  const pick = el('button', 'mcard-pick');
  pick.type = 'button';
  pick.title = '设为当前模型';
  pick.addEventListener('click', () => markActiveCard(card));
  head.appendChild(pick);
  head.appendChild(textField('mcard-name', '模型名称，例如「我的通义」', profile.label ?? ''));
  head.appendChild(el('span', 'mcard-tag', '当前'));

  const del = el('button', 'model-del');
  del.type = 'button';
  del.title = '删除该模型';
  del.innerHTML = ICON.trash;
  del.addEventListener('click', () => removeCard(card));
  head.appendChild(del);
  card.appendChild(head);

  card.appendChild(cardField('Model ID', textField('model-id', '例如 qwen3.8-max', profile.model ?? '')));
  card.appendChild(cardField('接口地址（Base URL）', textField('model-base', 'https://api.example.com/v1', profile.baseUrl ?? '')));

  const keyWrap = el('div', 'field');
  keyWrap.appendChild(el('span', null, 'API Key'));
  const box = el('div', 'input-wrap');
  const key = el('input', 'model-key');
  key.type = 'password';
  key.autocomplete = 'off';
  const savedPlaceholder = profile.hasKey ? '已保存密钥，留空保持不变' : '请输入 API Key';
  const clear = el('button', 'link-btn model-clear');
  clear.type = 'button';
  const setClear = on => {
    card._clearKey = on;
    clear.textContent = on ? '撤销清除密钥' : '清除已保存的密钥';
    clear.classList.toggle('danger', on);
    key.placeholder = on ? '保存后将清除这份密钥' : savedPlaceholder;
  };
  setClear(false);
  clear.hidden = !profile.hasKey;
  clear.addEventListener('click', () => {
    if (card._clearKey) { setClear(false); return; }
    key.value = '';
    setClear(true);
  });
  // 又填了新 Key 就别清旧的
  key.addEventListener('input', () => {
    if (key.value.trim() && card._clearKey) setClear(false);
  });
  const eye = el('button', 'eye');
  eye.type = 'button';
  eye.title = '显示 / 隐藏';
  eye.innerHTML = ICON.eye;
  eye.addEventListener('click', () => {
    const reveal = key.type === 'password';
    key.type = reveal ? 'text' : 'password';
    eye.classList.toggle('on', reveal);
  });
  box.append(key, eye);
  keyWrap.append(box, clear);
  card.appendChild(keyWrap);
  return card;
}

function markActiveCard(card) {
  [...$('#modelCards').children].forEach(node => node.classList.toggle('active', node === card));
}

function removeCard(card) {
  const wasActive = card.classList.contains('active');
  card.remove();
  const host = $('#modelCards');
  if (!host.children.length) host.appendChild(modelCard());
  if (wasActive) markActiveCard(host.firstElementChild);
}

function renderCards(profiles) {
  const host = $('#modelCards');
  host.innerHTML = '';
  (profiles.length ? profiles : [{}]).forEach(p => host.appendChild(modelCard(p)));
  const wanted = [...host.children].find(c => c.dataset.id === cfg.activeId);
  markActiveCard(wanted ?? host.firstElementChild);
}

const readCards = () => [...$('#modelCards').children]
  .map(card => ({
    id: card.dataset.id,
    label: card.querySelector('.mcard-name').value.trim(),
    model: card.querySelector('.model-id').value.trim(),
    baseUrl: card.querySelector('.model-base').value.trim(),
    apiKey: card.querySelector('.model-key').value.trim(),
    clearKey: !!card._clearKey
  }))
  // 四栏全空的占位卡片直接丢掉，别让它挡住保存
  .filter(c => c.model || c.label || c.baseUrl || c.apiKey);

const activeCardId = () => $('#modelCards').querySelector('.mcard.active')?.dataset.id ?? '';

async function openSettings() {
  closeMenu();
  await loadAIConfig();
  renderCards(cfg.profiles);
  setHint(DEFAULT_HINT, false);
  $('#settingsOverlay').classList.add('open');
  $('#modelCards').querySelector('.model-id')?.focus();
}

const closeSettings = () => $('#settingsOverlay').classList.remove('open');

$('#btnSettings').addEventListener('click', openSettings);
$('#btnUsage').addEventListener('click', () => window.openUsagePage());
$('#btnCloseSettings').addEventListener('click', closeSettings);
$('#btnCancelSettings').addEventListener('click', closeSettings);
$('#settingsOverlay').addEventListener('click', e => {
  if (e.target.id === 'settingsOverlay') closeSettings();
});

// 弹窗内回车直接保存，Esc 取消
$('#settingsOverlay').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !composing(e) && e.target.tagName === 'INPUT') {
    e.preventDefault();
    $('#btnSaveKey').click();
  }
  if (e.key === 'Escape') closeSettings();
});

$('#btnAddModel').addEventListener('click', () => {
  const host = $('#modelCards');
  const card = modelCard();
  host.appendChild(card);
  card.scrollIntoView({ block: 'nearest' });
  card.querySelector('.mcard-name').focus();
});

$('#btnSaveKey').addEventListener('click', async () => {
  const res = await woder.ai.setConfig({ profiles: readCards(), activeId: activeCardId() });
  if (res && res.success === false) {
    setHint(res.message || '保存失败，请检查填写内容', true);
    return;
  }
  applyCfg(res);
  closeSettings();
  renderModelLabel();
});

$('#btnClearKey').addEventListener('click', async () => {
  applyCfg(await woder.ai.reset());
  renderCards(cfg.profiles);
  renderModelLabel();
  setHint('密钥已全部清除，模型条目仍保留。', false);
});

/** 输入框右下角的模型按钮：只显示状态，选择走弹出菜单 */
function renderModelLabel() {
  const profile = currentProfile();
  const ready = !!(profile && profile.model && profile.hasKey);
  const name = profile ? (profile.label || profile.model) : '';
  $('#modelLabel').textContent = profile?.model ? name : '未配置模型';
  $('#modelBtn').classList.toggle('warn', !ready);
  $('#modelBtn').title = ready
    ? `${name} · ${profile.model}\n点击切换模型`
    : '点击配置模型';
  // 卡片里那行「· 模型 id」和输出预留都跟当前模型有关
  scheduleContextRefresh();
}

async function refreshEngineChip() {
  await loadAIConfig();
  renderModelLabel();
}

/**
 * 模型切换菜单：列出所有「显示状态」打开的模型，末尾提供入口到管理窗口
 */
async function openModelMenu() {
  if ($('#modelMenu').classList.contains('open')) {
    closeMenu();
    return;
  }
  await loadAIConfig();
  const menu = $('#modelMenu');
  menu.innerHTML = '';
  const shown = cfg.profiles.filter(p => p.visible !== false);

  if (!shown.length) {
    const none = el('button');
    none.textContent = cfg.profiles.length ? '模型都被隐藏了' : '还没有可用模型';
    none.disabled = true;
    menu.appendChild(none);
  }

  shown.forEach(profile => {
    const btn = el('button', profile.id === cfg.activeId ? 'active' : '');
    btn.type = 'button';
    btn.appendChild(el('span', 'menu-model', profile.label || profile.model));
    if (profile.model && profile.label !== profile.model) {
      btn.appendChild(el('span', 'menu-sub', profile.model));
    }
    btn.addEventListener('click', async () => {
      closeMenu();
      const res = await woder.ai.setActive(profile.id);
      if (res && res.success === false) {
        await openSettings();
        setHint(res.message || '切换模型失败', true);
        return;
      }
      applyCfg(res);
      renderModelLabel();
    });
    menu.appendChild(btn);
  });

  menu.appendChild(el('div', 'menu-sep'));

  const add = el('button', 'menu-add');
  add.type = 'button';
  add.innerHTML = `${ICON.plus}<span>管理模型…</span>`;
  add.addEventListener('click', () => {
    closeMenu();
    openModelPrefs();
  });
  menu.appendChild(add);

  popup('#modelMenu', $('#modelBtn'), 236, true);
}

$('#modelBtn').addEventListener('click', openModelMenu);

/* ---------------- 管理模型：思考强度 / 显示状态 / 上下文窗口 ---------------- */

const THINKING_TEXT = {
  minimal: '最小',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
  max: '最大',
  off: '关闭思考',
  none: '不支持'
};
const THINKING_ORDER = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'off', 'none'];

/** 档位表和主进程 snapContextWindow 一一对应，改一边记得改另一边 */
const WINDOW_STEPS = [
  8_000, 16_000, 32_000, 64_000, 96_000, 128_000, 160_000,
  200_000, 256_000, 320_000, 400_000, 512_000, 640_000, 800_000, 1_000_000
];
const WINDOW_MAX = WINDOW_STEPS[WINDOW_STEPS.length - 1];
/** 刻度尺每 50K 一格（和档位无关，只是标尺），带数字的另说 */
const WINDOW_TICK = 50_000;
const WINDOW_LABELS = [200_000, 400_000, 1_000_000];
/** 当前值离某个刻度数字太近就把它藏掉，别叠成「128K00K」 */
const WINDOW_LABEL_GAP = 11;

const fmtWindow = n => (n >= 1_000_000 ? '1M' : `${Math.round(n / 1000)}K`);
const winPct = n => (n / WINDOW_MAX) * 100;
const snapWindow = n => WINDOW_STEPS.reduce(
  (best, step) => (Math.abs(step - n) < Math.abs(best - n) ? step : best),
  WINDOW_STEPS[0]
);

/** 弹窗里改的是这份草稿，点「保存设置」才提交，取消即丢弃 */
let prefsDraft = [];

function prefRow(item) {
  const row = el('div', 'prefs-row');

  const name = el('div', 'p-name');
  const badge = el('span', 'p-badge');
  badge.innerHTML = ICON.model;
  const nameText = el('div', 'p-name-text');
  nameText.appendChild(el('b', null, item.label));
  if (item.model && item.model !== item.label) nameText.appendChild(el('span', 'p-model', item.model));
  name.append(badge, nameText);

  const thinkBtn = el('button', 'think-btn');
  thinkBtn.type = 'button';
  const thinkText = el('span', null, THINKING_TEXT[item.thinking] ?? THINKING_TEXT.off);
  const thinkCaret = el('span', 'think-caret');
  thinkCaret.innerHTML = '<svg viewBox="0 0 24 24" class="i"><path d="M6 9.5l6 6 6-6"/></svg>';
  thinkBtn.append(thinkText, thinkCaret);
  thinkBtn.addEventListener('click', e => {
    e.stopPropagation();
    openThinkMenu(thinkBtn, item, thinkText);
  });
  const thinkCell = el('div', 'p-think');
  thinkCell.appendChild(thinkBtn);

  const sw = el('button', 'switch');
  sw.type = 'button';
  sw.appendChild(el('i'));
  const paintSwitch = () => {
    sw.classList.toggle('on', item.visible);
    sw.title = item.visible ? '在模型菜单里显示' : '已从模型菜单里隐藏';
  };
  paintSwitch();
  sw.addEventListener('click', () => {
    item.visible = !item.visible;
    paintSwitch();
  });
  const showCell = el('div', 'p-show');
  showCell.appendChild(sw);

  const winCell = el('div', 'p-win');
  winCell.appendChild(buildSlider(item));

  row.append(name, thinkCell, showCell, winCell);
  return row;
}

/**
 * 上下文窗口滑杆：轨道长度就是整条档位轴，拇指停在档位上，
 * 下方刻度尺把当前值印成粗体，和它同值的默认刻度让位，避免出现两个 400K。
 */
function buildSlider(item) {
  const wrap = el('div', 'win-slider');

  const track = el('div', 'win-track');
  track.tabIndex = 0;
  track.setAttribute('role', 'slider');
  const fill = el('i', 'win-fill');
  const thumb = el('b', 'win-thumb');
  track.append(fill, thumb);

  const scale = el('div', 'win-scale');
  for (let tick = 0; tick <= WINDOW_MAX; tick += WINDOW_TICK) {
    const node = el('u', WINDOW_LABELS.includes(tick) ? 'major' : null);
    node.style.left = `${winPct(tick)}%`;
    scale.appendChild(node);
  }
  const labelNodes = WINDOW_LABELS.map(value => {
    const node = el('span', 'win-tick-label', fmtWindow(value));
    node.style.left = `${winPct(value)}%`;
    scale.appendChild(node);
    return { value, node };
  });
  const valueLabel = el('span', 'win-value', fmtWindow(item.contextWindow));
  scale.appendChild(valueLabel);

  function paint() {
    const pct = winPct(item.contextWindow);
    fill.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
    valueLabel.textContent = fmtWindow(item.contextWindow);
    valueLabel.style.left = `${pct}%`;
    labelNodes.forEach(({ value, node }) => {
      node.style.display = Math.abs(winPct(value) - pct) < WINDOW_LABEL_GAP ? 'none' : '';
    });
    track.setAttribute('aria-valuenow', String(item.contextWindow));
    track.setAttribute('aria-valuetext', fmtWindow(item.contextWindow));
  }
  paint();

  const setValue = clientX => {
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    item.contextWindow = snapWindow(ratio * WINDOW_MAX);
    paint();
  };
  track.addEventListener('pointerdown', e => {
    track.setPointerCapture(e.pointerId);
    setValue(e.clientX);
  });
  track.addEventListener('pointermove', e => {
    if (e.buttons) setValue(e.clientX);
  });
  track.addEventListener('keydown', e => {
    const index = WINDOW_STEPS.indexOf(item.contextWindow);
    const next = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? index - 1
      : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? index + 1 : -1;
    if (next < 0 || next >= WINDOW_STEPS.length) return;
    e.preventDefault();
    item.contextWindow = WINDOW_STEPS[next];
    paint();
  });

  wrap.append(track, scale);
  return wrap;
}

/* 思考强度下拉：挂在 body 上，弹窗的滚动容器裁不到它 */
let thinkFor = null;
let thinkAnchor = null;

function closeThinkMenu() {
  $('#thinkMenu').hidden = true;
  thinkFor = null;
  thinkAnchor = null;
}

function openThinkMenu(anchor, item, labelNode) {
  if (thinkFor === item && !$('#thinkMenu').hidden) {
    closeThinkMenu();
    return;
  }
  const menu = $('#thinkMenu');
  menu.innerHTML = '';
  thinkFor = item;
  thinkAnchor = anchor;

  THINKING_ORDER.forEach(level => {
    const btn = el('button', level === item.thinking ? 'on' : '');
    btn.type = 'button';
    btn.appendChild(el('span', null, THINKING_TEXT[level]));
    if (level === item.thinking) {
      const check = el('span', 'think-check');
      check.innerHTML = ICON.tick;
      btn.appendChild(check);
    }
    btn.addEventListener('click', () => {
      item.thinking = level;
      labelNode.textContent = THINKING_TEXT[level];
      closeThinkMenu();
    });
    menu.appendChild(btn);
  });

  menu.hidden = false;
  positionThinkMenu();
}

function positionThinkMenu() {
  const menu = $('#thinkMenu');
  if (!thinkAnchor || menu.hidden) return;
  const rect = thinkAnchor.getBoundingClientRect();
  const box = menu.getBoundingClientRect();
  let top = rect.bottom + 6;
  if (top + box.height > window.innerHeight - 8) top = Math.max(8, rect.top - box.height - 6);
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - box.width - 8))}px`;
}

document.addEventListener('click', e => {
  if (e.target.closest('#thinkMenu') || e.target.closest('.think-btn')) return;
  closeThinkMenu();
});
addEventListener('resize', positionThinkMenu);

function renderPrefsRows() {
  const host = $('#prefsRows');
  host.innerHTML = '';
  const empty = $('#prefsEmpty');
  empty.textContent = '还没有模型，先在齿轮「模型配置」里添加。';
  empty.classList.remove('error');
  empty.hidden = prefsDraft.length > 0;
  prefsDraft.forEach(item => host.appendChild(prefRow(item)));
}

async function openModelPrefs() {
  closeMenu();
  await loadAIConfig();
  prefsDraft = cfg.profiles.map(p => ({
    id: p.id,
    label: p.label || p.model,
    model: p.model,
    thinking: p.thinking || 'off',
    contextWindow: p.contextWindow || 128_000,
    visible: p.visible !== false
  }));
  renderPrefsRows();
  $('#prefsOverlay').classList.add('open');
}

function closeModelPrefs() {
  closeThinkMenu();
  $('#prefsOverlay').classList.remove('open');
}

$('#btnClosePrefs').addEventListener('click', closeModelPrefs);
$('#btnCancelPrefs').addEventListener('click', closeModelPrefs);
$('#prefsOverlay').addEventListener('click', e => {
  if (e.target.id === 'prefsOverlay') closeModelPrefs();
});
$('#prefsOverlay').addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  // 下拉开着时 Esc 只收下拉，别把整个窗口关了
  if ($('#thinkMenu').hidden) closeModelPrefs();
  else closeThinkMenu();
});
$('#prefsBody').addEventListener('scroll', closeThinkMenu);

$('#btnSavePrefs').addEventListener('click', async () => {
  const res = await woder.ai.setPrefs(
    prefsDraft.map(p => ({ id: p.id, thinking: p.thinking, contextWindow: p.contextWindow, visible: p.visible }))
  );
  const empty = $('#prefsEmpty');
  if (res && res.success === false) {
    empty.textContent = res.message || '保存失败，稍后再试';
    empty.classList.add('error');
    empty.hidden = false;
    return;
  }
  applyCfg(res);
  closeModelPrefs();
  renderModelLabel();
});

/* ---------------- 内置浏览器 ---------------- */

let brTabs = [];                 // { id, url, title, loading, error, notes: [] }
let brActive = null;
const brViews = new Map();       // tabId -> <webview>
let brZoom = 'none';             // none | max | split
let pendingPick = null;          // 刚选中、还没写批注的元素
let annotateFor = null;          // 哪个页签处在批注选取状态
let localAt = 0;                 // 上次探测本地服务的时间

const stage = () => $('#brStage');
const currentTab = () => brTabs.find(t => t.id === brActive) ?? null;
const viewOf = id => brViews.get(id);
const hostOf = u => { try { return new URL(u).host; } catch { return '新标签页'; } };
/** <webview> 在 dom-ready 之前调 getURL/canGoBack 会直接抛异常，所有跨进程调用都得先问一句 */
const viewReady = wv => !!wv && !!wv.__ready;

/**
 * 地址栏什么都能敲：完整网址、localhost:3000、光一个端口、example.com、或者一个搜索词。
 * 只认 http/https —— file:// 这类会把本地盘暴露给网页，一律拒绝。
 */
function normalizeAddr(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { error: '先输入一个网址或关键词' };
  if (/^(file|javascript|data|blob|view-source|chrome):/i.test(s)) return { error: '只支持 http/https 地址' };
  if (/^https?:\/\//i.test(s)) return { url: s };

  const bare = s.replace(/^\/+/, '');
  const host = bare.split(/[/?#]/)[0];
  const loopback = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d{2,5})?$/.test(host);
  if (loopback) return { url: `http://${bare}` };
  if (/^\d{2,5}([/?#].*)?$/.test(bare)) return { url: `http://localhost:${bare}` };
  if (/^[\w-]+(\.[\w-]+)+(:\d{2,5})?([/?#].*)?$/.test(bare)) return { url: `https://${bare}` };
  return { url: `https://www.baidu.com/s?wd=${encodeURIComponent(s)}` };
}

function bindWebview(tab, wv) {
  const sync = () => {
    if (!viewReady(wv)) return;
    const url = wv.getURL();
    if (url && url !== tab.url) {
      tab.url = url;
      tab.error = '';
      // 页面一挪位置，画在上面的编号角标就作废了，批注本身留着（列表里还带着元素原文）
      drawMarkers(tab).catch(() => {});
    }
    tab.title = wv.getTitle() || hostOf(tab.url);
  };
  wv.addEventListener('dom-ready', () => { wv.__ready = true; sync(); renderBrowser(); });
  wv.addEventListener('did-navigate', e => { if (e?.url) { tab.url = e.url; tab.error = ''; } sync(); renderBrowser(); });
  wv.addEventListener('did-navigate-in-page', sync);
  wv.addEventListener('page-title-updated', e => { tab.title = e.title || tab.title; renderBrowser(); });
  wv.addEventListener('did-start-loading', () => { tab.loading = true; renderBrowser(); });
  wv.addEventListener('did-stop-loading', () => { tab.loading = false; sync(); renderBrowser(); });
  wv.addEventListener('did-fail-load', e => {
    // -3 是用户自己打断的跳转，-1 是 about:blank 之类的正常取消，都不算失败
    tab.loading = false;
    if (Number(e?.errorCode) > 0 && e?.validUrl !== false) {
      tab.error = String(e.errorDescription || '连接失败').slice(0, 120);
    }
    renderBrowser();
  });
  // target=_blank / window.open 由主进程的 setWindowOpenHandler 拦下再推回来，见下面 onPopup
  wv.addEventListener('crash', () => {
    tab.error = '这个页面崩了，刷新一下试试';
    tab.loading = false;
    renderBrowser();
  });
}

/** guest 的 webContents id，用来把弹窗请求对回它所属的页签 */
function guestIdOf(wv) {
  if (!wv) return -1;
  try {
    return wv.getWebContentsId();
  } catch {
    return -1;          // 还没 attach 时会直接抛，不算错误
  }
}

woder.browser.onPopup(({ guestId, url }) => {
  if (!/^https?:/i.test(url || '')) return;
  const tab = brTabs.find(t => guestIdOf(brViews.get(t.id)) === guestId);
  if (tab) loadUrl(tab, url);
});

function newTab(url = '', { activate = true } = {}) {
  const id = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tab = { id, url: '', title: '新标签页', loading: false, error: '', notes: [] };
  brTabs.push(tab);

  const wv = document.createElement('webview');
  wv.className = 'br-view';
  // 单独一个分区，网页的登录态不会和主界面搅在一起
  wv.partition = 'persist:woder-browser';
  // 不给这个属性，target=_blank / window.open 会被 webview 直接吞掉，弹窗请求根本到不了
  // 主进程的 setWindowOpenHandler，于是页面里的外链点了毫无反应。
  wv.setAttribute('allowpopups', '');
  wv.addEventListener('contextmenu', e => e.preventDefault());
  bindWebview(tab, wv);
  stage().appendChild(wv);
  brViews.set(id, wv);

  if (url) loadUrl(tab, url);
  if (activate) setTab(id); else renderBrowser();
  return tab;
}

/** 只拆这一个页签，不负责兜底：面板整体关闭时用 */
function destroyTab(id) {
  const wv = viewOf(id);
  if (wv) wv.remove();
  brViews.delete(id);
  const i = brTabs.findIndex(t => t.id === id);
  if (i >= 0) brTabs.splice(i, 1);
  if (annotateFor === id) annotateFor = null;
  if (pendingPick?.tabId === id) pendingPick = null;
  if (brActive === id) brActive = null;
}

function closeTab(id) {
  const wasActive = brActive === id;
  const i = brTabs.findIndex(t => t.id === id);
  destroyTab(id);
  if (wasActive) brActive = brTabs[Math.max(0, i - 1)]?.id ?? null;
  // 关到最后一个时留一个空白「新标签页」，和参考稿一致：页签不会整条消失
  if (!brTabs.length) { newTab(); return; }
  renderBrowser();
}

function setTab(id) {
  brActive = id;
  if (annotateFor && annotateFor !== id) annotateFor = null;
  renderBrowser();
  const wv = viewOf(id);
  // 焦点回到地址栏还是页面，取决于用户刚在哪儿敲键盘
  if (wv && document.activeElement !== $('#brUrl')) { try { wv.focus(); } catch {} }
}

function loadUrl(tab, url) {
  const wv = viewOf(tab.id);
  if (!wv) return;
  tab.error = '';
  tab.url = url;
  // 先自己置位：did-start-loading 是异步回来的，晚一步 waitForLoad 就会误判「已经加载完」
  tab.loading = true;
  // dom-ready 之前 loadURL() 会抛「must be attached」，那个阶段只能给 src 赋值
  if (viewReady(wv)) wv.loadURL(url);
  else wv.src = url;
  renderBrowser();
}

function gotoAddr(raw) {
  const r = normalizeAddr(raw);
  if (r.error) { attachHint(r.error); return; }
  const tab = currentTab();
  if (tab) loadUrl(tab, r.url);
  else newTab(r.url);
}

/* ---- 界面刷新 ---- */

function renderBrowser() {
  const host = $('#browserBody');
  if (!host) return;
  const tab = currentTab();
  const wv = tab ? viewOf(tab.id) : null;

  const strip = $('#brTabs');
  strip.hidden = brTabs.length === 0;
  strip.innerHTML = '';
  brTabs.forEach(t => {
    strip.appendChild(subTab(ICON.globe, t.title || t.url || '新标签页', t.id === brActive,
      () => closeTab(t.id), () => setTab(t.id)));
  });
  // 头部的 + 是「打开面板」菜单，新建标签页留在页签条末尾，挨着页签才想得起来
  strip.appendChild(subAdd('新标签页', () => newTab()));
  strip.querySelector('.sub-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  brViews.forEach((view, id) => view.classList.toggle('active', id === brActive));
  host.classList.toggle('loading', brTabs.some(t => t.loading));
  $('#brAnnotate').classList.toggle('on', !!annotateFor);

  const addr = $('#brUrl');
  const shown = tab && !/^about:/.test(tab.url) ? tab.url : '';
  if (document.activeElement !== addr) addr.value = shown;
  $('#brBack').disabled = !(viewReady(wv) && wv.canGoBack());
  $('#brForward').disabled = !(viewReady(wv) && wv.canGoForward());

  renderHome(tab);
  renderNotes();
}

function renderHome(tab) {
  const live = !!tab?.url && !/^about:/.test(tab?.url ?? '') && !tab?.error;
  $('#brHome').hidden = live;
  if (live) return;

  const empty = $('#brEmpty');
  if (tab?.error) {
    empty.querySelector('p').textContent = '打不开这个地址';
    empty.querySelector('span').textContent = tab.error;
    $('#brLocal').innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.querySelector('p').textContent = '没有本地服务';
  empty.querySelector('span').textContent = '试试输入另一个浏览器地址';
  if (Date.now() - localAt > 4000) paintLocal();
}

async function paintLocal() {
  localAt = Date.now();
  const res = await woder.browser.localServices().catch(() => ({ services: [] }));
  const items = res.services ?? [];
  const host = $('#brLocal');
  host.innerHTML = '';
  items.forEach(s => {
    const url = `http://localhost:${s.port}`;
    const btn = el('button', 'local-item');
    btn.type = 'button';
    btn.innerHTML = ICON.globe;
    btn.appendChild(el('span', 'local-url', url));
    btn.appendChild(el('span', 'local-name', s.name));
    btn.addEventListener('click', () => gotoAddr(url));
    host.appendChild(btn);
  });
  // 列表出来了就不该再顶着「没有本地服务」的空状态
  const tab = currentTab();
  if (!tab?.error) $('#brEmpty').hidden = items.length > 0;
}

/* ---- 批注 ---- */

const PICK_CODE = `(async () => {
  const clean = s => String(s ?? '').replace(/\\s+/g, ' ').trim();
  const pathOf = node => {
    const parts = [];
    for (let n = node; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(s + '#' + n.id); break; }
      const cls = Array.from(n.classList).filter(c => c.length < 24).slice(0, 2);
      if (cls.length) s += '.' + cls.join('.');
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  return await new Promise(resolve => {
    // 逐个属性赋值：cssText 会被严格 CSP 的网站按内联样式拦掉，批注框就画不出来了
    const setStyle = (node, props) => { for (const k in props) node.style[k] = props[k]; };
    const box = document.createElement('div');
    setStyle(box, { position: 'fixed', zIndex: '2147483647', pointerEvents: 'none', outline: '2px solid #5b5bd6', background: 'rgba(91,91,214,.12)', borderRadius: '2px' });
    const label = document.createElement('div');
    setStyle(label, { position: 'fixed', zIndex: '2147483647', pointerEvents: 'none', background: '#17181c', color: '#fff', fontFamily: '-apple-system,system-ui,sans-serif', fontSize: '11px', lineHeight: '1.7', padding: '1px 6px', borderRadius: '4px', whiteSpace: 'nowrap' });
    document.documentElement.append(box, label);
    let cur = null;
    const move = e => {
      cur = document.elementFromPoint(e.clientX, e.clientY);
      if (!cur || cur === box || cur === label) return;
      const r = cur.getBoundingClientRect();
      setStyle(box, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      label.textContent = cur.tagName.toLowerCase() + (cur.id ? '#' + cur.id : '') + ' ' + Math.round(r.width) + '×' + Math.round(r.height);
      setStyle(label, { left: r.left + 'px', top: Math.max(0, r.top - 21) + 'px' });
    };
    const finish = value => {
      clearTimeout(timer);
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      box.remove();
      label.remove();
      resolve(value);
    };
    const onClick = e => {
      e.preventDefault();
      e.stopPropagation();
      const node = cur;
      if (!node) { finish(null); return; }
      const r = node.getBoundingClientRect();
      finish({
        selector: pathOf(node),
        tag: node.tagName.toLowerCase(),
        quote: clean(node.innerText || node.value || node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.getAttribute('alt')).slice(0, 160),
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
      });
    };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); } };
    const timer = setTimeout(() => finish(null), 60000);
    document.addEventListener('mousemove', move, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  });
})()`;

function markerCode(tab) {
  // 角标压在元素上边线的中间：既指得准，又不会把小按钮整个盖住
  const items = tab.notes.map((n, i) => ({ i: i + 1, x: n.rect.x + Math.round(n.rect.w / 2), y: n.rect.y }));
  return `(() => {
    const old = document.getElementById('__woder_notes__');
    if (old) old.remove();
    const items = ${JSON.stringify(items)};
    if (!items.length) return;
    const setStyle = (node, props) => { for (const k in props) node.style[k] = props[k]; };
    const host = document.createElement('div');
    host.id = '__woder_notes__';
    items.forEach(it => {
      const b = document.createElement('div');
      b.textContent = it.i;
      setStyle(b, { position: 'fixed', left: it.x + 'px', top: it.y + 'px', transform: 'translate(-50%,-50%)', width: '18px', height: '18px', borderRadius: '50%', background: '#5b5bd6', color: '#fff', fontFamily: '-apple-system,system-ui,sans-serif', fontSize: '11px', fontWeight: '600', lineHeight: '18px', textAlign: 'center', boxShadow: '0 1px 5px rgba(0,0,0,.35)', pointerEvents: 'none', zIndex: '2147483646' });
      host.appendChild(b);
    });
    document.documentElement.appendChild(host);
  })()`;
}

const drawMarkers = tab => {
  const wv = tab && viewOf(tab.id);
  if (!viewReady(wv) || /^about:/.test(tab.url || '')) return Promise.resolve();
  return wv.executeJavaScript(markerCode(tab)).catch(() => {});
};

async function toggleAnnotate() {
  const tab = currentTab();
  if (!tab || !tab.url || /^about:/.test(tab.url) || !viewReady(viewOf(tab.id))) {
    attachHint('先打开一个网页才能批注');
    return;
  }
  if (annotateFor === tab.id) { annotateFor = null; renderBrowser(); return; }

  annotateFor = tab.id;
  renderBrowser();
  attachHint('点选要说明的网页元素，Esc 取消');
  const wv = viewOf(tab.id);
  let picked = null;
  try {
    picked = await wv.executeJavaScript(PICK_CODE);
  } catch {
    attachHint('这个页面不允许批注（可能是跨域限制）');
  }
  if (annotateFor !== tab.id) return;
  annotateFor = null;
  if (!picked) { renderBrowser(); return; }
  pendingPick = { tabId: tab.id, ...picked };
  renderBrowser();
  $('#noteForm input')?.focus();
}

function addNote(text) {
  const tab = currentTab();
  if (!tab || !pendingPick) return;
  tab.notes.push({
    text,
    tag: pendingPick.tag,
    quote: pendingPick.quote,
    selector: pendingPick.selector,
    rect: pendingPick.rect,
    url: tab.url
  });
  pendingPick = null;
  drawMarkers(tab);
  renderBrowser();
}

function renderNotes() {
  const tab = currentTab();
  const notes = tab?.notes ?? [];
  const picking = !!pendingPick && pendingPick.tabId === tab?.id;
  const wrap = $('#brNotes');
  wrap.hidden = !notes.length && !picking;

  const form = $('#noteForm');
  form.hidden = !picking;
  if (picking) {
    form.innerHTML = '';
    form.appendChild(el('span', 'note-el', `‹${pendingPick.tag}› ${pendingPick.quote ? clip(pendingPick.quote, 22) : '(无文字)'}`));
    const input = document.createElement('input');
    input.placeholder = '写下这条批注想说什么，回车确认';
    const save = el('button', 'primary', '添加');
    const cancel = el('button', 'ghost', '取消');
    const commit = () => {
      const text = input.value.trim();
      if (!text) { attachHint('批注内容不能为空'); input.focus(); return; }
      addNote(text);
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !composing(e)) commit();
      if (e.key === 'Escape') { pendingPick = null; renderBrowser(); }
    });
    save.addEventListener('click', commit);
    cancel.addEventListener('click', () => { pendingPick = null; renderBrowser(); });
    form.append(input, save, cancel);
  }

  const list = $('#noteList');
  list.innerHTML = '';
  notes.forEach((n, i) => {
    const row = el('div', 'note-row');
    row.appendChild(el('span', 'note-idx', String(i + 1)));
    row.appendChild(el('span', 'note-text', n.text));
    row.appendChild(el('span', 'note-el', `‹${n.tag}› ${n.quote ? clip(n.quote, 18) : ''}`));
    const x = el('button', 'tab-x');
    x.type = 'button';
    x.title = '删除这条批注';
    x.innerHTML = ICON.close;
    x.addEventListener('click', () => { notes.splice(i, 1); drawMarkers(tab); renderBrowser(); });
    row.appendChild(x);
    list.appendChild(row);
  });
  if (notes.length) {
    const foot = el('div', 'note-foot');
    foot.appendChild(el('span', 'note-hint', `${notes.length} 条批注，可以连着网页一起问模型`));
    const send = el('button', 'primary', '发送给模型');
    send.addEventListener('click', sendNotes);
    foot.appendChild(send);
    list.appendChild(foot);
  }
}

function notesBlock(tab) {
  const lines = tab.notes.map((n, i) =>
    `${i + 1}. ‹${n.tag}› ${n.text}\n   元素：${n.selector}\n   页面原文：${n.quote || '(无文字)'}\n   所在地址：${n.url}`
  );
  return `【网页批注】${tab.url}\n${lines.join('\n')}\n\n`;
}

function sendNotes() {
  const tab = currentTab();
  if (!tab?.notes.length) return;
  const box = $('#input');
  const head = box.value.trim();
  box.value = (head ? `${head}\n\n` : '') + notesBlock(tab);
  autosize();
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
  attachHint('批注已放进输入框，补一句要求就能发送');
}

/* ---- 截图 / 外部打开 / 更多 ---- */

async function shootPage() {
  const tab = currentTab();
  const wv = tab ? viewOf(tab.id) : null;
  if (!viewReady(wv) || !tab.url || /^about:/.test(tab.url)) { attachHint('先打开一个网页才能截图'); return null; }
  if (pendingImages.length >= MAX_IMAGES) { attachHint(`一条需求最多 ${MAX_IMAGES} 张图片`); return null; }
  const now = new Date();
  try {
    const image = await wv.capturePage();
    const { dataUrl, mime } = await prepareImage(image.toDataURL(), 'image/png');
    const item = { name: `网页截图-${hostOf(tab.url)}-${pad2(now.getHours())}${pad2(now.getMinutes())}.png`, mime, dataUrl };
    pendingImages.push(item);
    renderAttachTray();
    attachHint('截图已放进输入框的附件里');
    return item;
  } catch (err) {
    attachHint('截图失败：' + String(err?.message ?? err).slice(0, 40));
    return null;
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function applyZoom() {
  const root = document.querySelector('.app');
  root.classList.toggle('browser-max', brZoom === 'max');
  root.classList.toggle('browser-split', brZoom === 'split');
  $('#btnZoomMax').classList.toggle('on', brZoom === 'max');
  $('#btnZoomSplit').classList.toggle('on', brZoom === 'split');
  $('#btnZoomMax').title = brZoom === 'max' ? '退出放大' : '放大浏览器';
}

function setZoom(mode) {
  brZoom = brZoom === mode ? 'none' : mode;
  applyZoom();
}

/* ---- 执行器下发过来的动作：模型用内置浏览器干活 ---- */

const guestRead = max => `(() => {
  const clean = s => String(s ?? '').replace(/\\s+/g, ' ').trim();
  const nodes = Array.from(document.querySelectorAll('a[href],button,input,textarea,select,[role=button],[onclick],[role=link]'))
    .filter(n => !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length));
  return {
    title: document.title,
    url: location.href,
    text: clean(document.body ? document.body.innerText : '').slice(0, ${max}),
    interactive: nodes.slice(0, 60).map((n, i) => ({
      i,
      tag: n.tagName.toLowerCase(),
      type: n.type || '',
      text: clean(n.innerText || n.value || n.getAttribute('aria-label') || n.getAttribute('placeholder') || n.getAttribute('alt')).slice(0, 60),
      href: n.tagName === 'A' ? n.href : ''
    }))
  };
})()`;

/** 序号 / 选择器 / 可见文字三种定位方式，模型拿到 read 的序号就能直接点 */
const guestFind = (index, selector, text) => `(() => {
  const clean = s => String(s ?? '').replace(/\\s+/g, ' ').trim();
  const nodes = Array.from(document.querySelectorAll('a[href],button,input,textarea,select,[role=button],[onclick],[role=link]'))
    .filter(n => !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length));
  const IDX = ${index === null ? 'null' : index};
  const SEL = ${JSON.stringify(selector || '')};
  const TXT = ${JSON.stringify(text || '')};
  let node = null, how = '';
  if (IDX !== null) { node = nodes[IDX] || null; how = '序号 ' + IDX; }
  if (!node && SEL) { try { node = document.querySelector(SEL); } catch {} if (node) how = '选择器 ' + SEL; }
  if (!node && TXT) {
    const named = n => clean(n.innerText || n.value || n.getAttribute('aria-label') || n.getAttribute('placeholder'));
    node = nodes.find(n => named(n) === TXT) || nodes.find(n => named(n).includes(TXT)) || null;
    if (node) how = '文字「' + TXT + '」';
  }
  return { node, how };
})()`;

const guestClick = (index, selector, text) => `(() => {
  const found = ${guestFind(index, selector, text)};
  if (!found.node) return { ok: false, message: '页面上找不到目标元素。先 browser.read 看清结构，再用它给的序号。' };
  found.node.scrollIntoView({ block: 'center' });
  found.node.click();
  return { ok: true, target: found.how + ' · ‹' + found.node.tagName.toLowerCase() + '› ' + String(found.node.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 40) };
})()`;

const guestType = (index, selector, text, submit) => `(() => {
  const found = ${guestFind(index, selector, text)};
  const node = found.node;
  if (!node) return { ok: false, message: '页面上找不到要输入的框。先 browser.read 看清结构。' };
  if (!('value' in node)) return { ok: false, message: '‹' + node.tagName.toLowerCase() + '› 不是输入框，填不进内容' };
  node.scrollIntoView({ block: 'center' });
  node.focus();
  const proto = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(node, ${JSON.stringify(String(text ?? ''))});
  node.dispatchEvent(new Event('input', { bubbles: true }));
  node.dispatchEvent(new Event('change', { bubbles: true }));
  ${submit ? `node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  if (node.form && typeof node.form.requestSubmit === 'function') node.form.requestSubmit();` : ''}
  return { ok: true, target: found.how + ' · ‹' + node.tagName.toLowerCase() + '›' + (node.name ? '[name=' + node.name + ']' : '') };
})()`;

const guestExtract = selectors => `(() => {
  const clean = s => String(s ?? '').replace(/\\s+/g, ' ').trim();
  return {
    url: location.href,
    title: document.title,
    items: ${JSON.stringify(selectors)}.map(sel => {
      let nodes = [];
      try { nodes = Array.from(document.querySelectorAll(sel)); } catch { return { selector: sel, matches: 0, texts: ['(选择器不合法)'] }; }
      return {
        selector: sel,
        matches: nodes.length,
        texts: nodes.slice(0, 30)
          .map(n => clean(n.innerText || n.value || n.getAttribute('href') || n.getAttribute('src') || n.getAttribute('alt')))
          .filter(Boolean)
      };
    })
  };
})()`;

function agentView() {
  const tab = currentTab();
  if (!tab || !tab.url || /^about:/.test(tab.url)) {
    throw new Error('内置浏览器里还没有打开的页面，先执行一步 browser.open');
  }
  const wv = viewOf(tab.id);
  if (!viewReady(wv)) throw new Error('页面还在加载，等它 dom-ready 之后再读');
  return wv;
}

/**
 * 等页面真正可用：既要点过 dom-ready，也要等这一次加载结束。
 * 刚给 <webview> 赋完 src 时 did-start-loading 还没触发，只看 loading 标志会立刻放行，
 * 下一步 browser.read 就撞上「还没 dom-ready」。
 */
const waitForLoad = (tab, ms = 25000) => new Promise(resolve => {
  const startedAt = Date.now();
  const tick = () => {
    const wv = viewOf(tab.id);
    if (!wv || (viewReady(wv) && !tab.loading)) return resolve();
    if (Date.now() - startedAt > ms) return resolve();
    setTimeout(tick, 120);
  };
  tick();
});

const AGENT_COMMANDS = {
  async open({ url, background }) {
    const r = normalizeAddr(url);
    if (r.error) throw new Error(r.error);
    if (!background) openPanel('browser', false);
    let tab = currentTab();
    if (!tab) tab = newTab(r.url, { activate: !background });
    else loadUrl(tab, r.url);
    await waitForLoad(tab);
    const wv = viewOf(tab.id);
    const ok = viewReady(wv);
    return {
      url: ok ? wv.getURL() : tab.url,
      // 标题事件比加载晚一步，取不到就用页签上已经记下的那个
      title: (ok ? wv.getTitle() : '') || tab.title || hostOf(tab.url),
      note: tab.error ? `页面加载失败：${tab.error}` : ''
    };
  },

  async read({ maxLength }) {
    const wv = agentView();
    return await wv.executeJavaScript(guestRead(Math.min(Math.max(Number(maxLength) || 3000, 500), 12000)));
  },

  async click({ index, selector, text }) {
    const wv = agentView();
    const idx = Number.isInteger(Number(index)) ? Number(index) : null;
    if (idx === null && !selector && !text) throw new Error('browser.click 需要 index、selector 或 text 其中一个');
    return await wv.executeJavaScript(guestClick(idx, selector, text));
  },

  async type({ index, selector, text, submit }) {
    const wv = agentView();
    const idx = Number.isInteger(Number(index)) ? Number(index) : null;
    if (idx === null && !selector && !text) throw new Error('browser.type 需要 index 或 selector 指出输入框');
    return await wv.executeJavaScript(guestType(idx, selector, text, submit));
  },

  async extract({ selectors }) {
    const wv = agentView();
    return await wv.executeJavaScript(guestExtract(selectors));
  },

  async screenshot() {
    const tab = currentTab();
    const wv = tab ? viewOf(tab.id) : null;
    if (!viewReady(wv) || !tab.url || /^about:/.test(tab.url)) throw new Error('内置浏览器里还没有打开的页面');
    const image = await wv.capturePage();
    return { dataUrl: image.toDataURL(), url: tab.url };
  },

  async close() {
    const closed = brTabs.length;
    brTabs.slice().forEach(t => closeTab(t.id));
    renderBrowser();
    return { closed };
  }
};

/* ---------------- 问答卡：AI 执行中途问一句 ---------------- */

/**
 * 挂在界面上等回答的那次提问。问题和选项都是模型给的话，一律走 textContent。
 * 卡片顶掉输入框的位置（跟输入框抢同一块地方，用户的眼神只用看一处），
 * 答案作为这一步的输出回给执行器，同时排进队列最前面，这一轮收尾就自动接着发。
 */
let askPending = null;
let askHi = 0;

const ASK_NO_PREF = '无偏好，你按最合适的来';

function askRow(opt, i) {
  const row = el('button', 'ask-opt' + (i === askHi ? ' on' : ''));
  row.type = 'button';
  row.dataset.label = opt.label;
  row.appendChild(el('span', 'ask-n', String(i + 1)));
  row.appendChild(el('b', 'ask-label', opt.label));
  if (opt.recommended) row.appendChild(el('span', 'ask-tag', '推荐'));
  if (opt.detail) row.appendChild(el('span', 'ask-detail', opt.detail));
  const enter = el('span', 'ask-enter');
  enter.innerHTML = ICON.enter;
  row.appendChild(enter);
  row.addEventListener('click', () => answerAsk(opt.label));
  return row;
}

function renderAskCard(question, options) {
  const card = $('#askCard');
  card.innerHTML = '';

  const head = el('div', 'ask-head');
  head.appendChild(el('div', 'ask-q', question));
  const fold = el('button', 'ask-fold');
  fold.type = 'button';
  fold.innerHTML = ICON.fold;
  fold.title = '收起';
  fold.addEventListener('click', () => {
    const on = card.classList.toggle('folded');
    fold.innerHTML = on ? ICON.unfold : ICON.fold;
    fold.title = on ? '展开' : '收起';
  });
  head.appendChild(fold);
  card.appendChild(head);

  const list = el('div', 'ask-list');
  options.forEach((o, i) => list.appendChild(askRow(o, i)));
  card.appendChild(list);

  const foot = el('div', 'ask-foot');
  const pen = el('span', 'ask-n');
  pen.innerHTML = ICON.edit;
  foot.appendChild(pen);
  const free = el('input', 'ask-free');
  free.placeholder = '输入其他答案';
  foot.appendChild(free);

  const letBox = el('div', 'ask-let');
  const dft = el('button', 'ask-default', '无偏好');
  dft.type = 'button';
  dft.title = '不挑，交给 Woder 自己定';
  dft.addEventListener('click', () => answerAsk(ASK_NO_PREF));
  const caret = el('button', 'ask-caret');
  caret.type = 'button';
  caret.innerHTML = ICON.chevron;
  caret.title = '更多';
  const menu = el('div', 'ask-menu');
  menu.hidden = true;
  const mPref = el('button', '', ASK_NO_PREF);
  mPref.type = 'button';
  mPref.addEventListener('click', () => answerAsk(ASK_NO_PREF));
  const mCancel = el('button', 'ask-menu-er', '取消这次提问');
  mCancel.type = 'button';
  mCancel.addEventListener('click', () => rejectAsk('你取消了这个提问'));
  menu.append(mPref, mCancel);
  caret.addEventListener('click', e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  letBox.append(dft, caret, menu);
  foot.appendChild(letBox);
  card.appendChild(foot);

  card.hidden = false;
  $('#composer').hidden = true;
  // 别自动聚焦那个输入框：焦点一进去，数字快捷键和回车选高亮项就都不成立了
}

function paintAskHi() {
  askRows().forEach((r, i) => r.classList.toggle('on', i === askHi));
}

const askRows = () => [...document.querySelectorAll('#askCard .ask-opt')];

function closeAsk() {
  askPending = null;
  $('#askCard').hidden = true;
  $('#askCard').classList.remove('folded');
  $('#composer').hidden = false;
}

/**
 * 把问题画成问答卡并等回答：点选项 / 输入其他答案 resolve，取消则 reject。
 * echo=false 是放行确认这类「只给执行器看的回答」：答案回给主进程就当说完，
 * 不该再冒充用户新发一条需求，否则会凭空多出一轮。
 */
function askUser(params) {
  if (askPending) return Promise.reject(new Error('界面上已经有一个问题在等回答'));
  const question = String(params?.question ?? '').trim();
  if (!question) return Promise.reject(new Error('ask.user 没带 question'));
  const options = (Array.isArray(params?.options) ? params.options : [])
    .filter(o => o && String(o.label ?? '').trim())
    .map(o => ({ label: String(o.label).trim(), detail: String(o.detail ?? ''), recommended: !!o.recommended }));
  askHi = Math.max(0, options.findIndex(o => o.recommended));
  return new Promise((resolve, reject) => {
    askPending = { resolve, reject, echo: params?.echo !== false };
    renderAskCard(question, options);
  });
}

function answerAsk(text) {
  const pending = askPending;
  const value = String(text ?? '').trim();
  if (!pending || !value) return;
  closeAsk();
  pending.resolve(value);
  // 答案排在队列最前面：用户等回答时可能还塞了别的话，那些要以这条为语境
  if (pending.echo !== false) queueMessage(value, null, true);
}

function rejectAsk(why) {
  const pending = askPending;
  if (!pending) return;
  closeAsk();
  pending.reject(new Error(why));
}

document.addEventListener('click', e => {
  const menu = document.querySelector('#askCard .ask-menu');
  // 用 composedPath 而不是 e.target：菜单项点下去时自己的处理器会先动过 DOM
  if (menu && !menu.hidden && !e.composedPath().some(n => n === menu || n.classList?.contains('ask-caret'))) menu.hidden = true;
});

document.addEventListener('keydown', e => {
  if (!askPending) return;
  // 提问卡浮着时，输入法选词的按键（回车/数字候选）要留给输入框自己
  if (composing(e)) return;
  const free = document.querySelector('#askCard .ask-free');
  const typing = !!free && document.activeElement === free;
  const rows = askRows();
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    rejectAsk('你取消了这个提问');
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopPropagation();
    if (rows.length) {
      askHi = (askHi + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      paintAskHi();
    }
  } else if (!typing && /^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && Number(e.key) <= rows.length) {
    // 数字键一步到位：卡片上那个圈就是快捷键提示
    e.preventDefault();
    e.stopPropagation();
    answerAsk(rows[Number(e.key) - 1].dataset.label);
  } else if (e.key === 'Enter' && !e.shiftKey) {
    // 在「输入其他答案」里回车，说的是那句话，不是选高亮项
    e.preventDefault();
    e.stopPropagation();
    const typed = typing ? free.value.trim() : '';
    // 空着回车就按高亮项答：那行末尾的 ↵ 就是这个意思
    if (typed) answerAsk(typed);
    else if (rows.length) answerAsk(rows[askHi].dataset.label);
  }
}, true);

woder.browser.onCommand(async payload => {
  const reqId = String(payload?.reqId ?? '');
  if (!reqId) return;
  if (payload?.cmd === 'ask.user') {
    try {
      woder.browser.reply({ reqId, data: { answer: await askUser(payload.params) } });
    } catch (err) {
      woder.browser.reply({ reqId, error: (err && err.message) || String(err) });
    }
    return;
  }
  const handler = AGENT_COMMANDS[String(payload?.cmd ?? '')];
  if (!handler) {
    woder.browser.reply({ reqId, error: `内置浏览器不支持动作 ${payload?.cmd}` });
    return;
  }
  try {
    woder.browser.reply({ reqId, data: await handler(payload.params ?? {}) });
  } catch (err) {
    woder.browser.reply({ reqId, error: (err && err.message) || String(err) });
  }
});

/* ---- 工具条接线 ---- */

$('#brBack').addEventListener('click', () => { const wv = viewOf(brActive); if (viewReady(wv) && wv.canGoBack()) wv.goBack(); });
$('#brForward').addEventListener('click', () => { const wv = viewOf(brActive); if (viewReady(wv) && wv.canGoForward()) wv.goForward(); });
$('#brReload').addEventListener('click', () => { const wv = viewOf(brActive); if (viewReady(wv)) wv.reload(); });
$('#brAnnotate').addEventListener('click', toggleAnnotate);
$('#brShot').addEventListener('click', shootPage);
$('#brLocalRefresh').addEventListener('click', () => { localAt = 0; paintLocal(); });
/* 「+」菜单整条工具栏右对齐，和参考稿一样压在放大/分屏按钮下方，而不是只挂住 + 自己 */
$('#btnAdd').addEventListener('click', () => popup('#brAddMenu', $('#headActionsPanel'), 168));

/** 「+」菜单和「全关掉后的入口页」是同一批动作，两处共用 */
function panelCommand(act) {
  if (!act) return;
  if (act === 'side') {
    if (!layout.side) toggleLayout('side');
    return;
  }
  openPanel(act);
}

$('#brAddMenu').addEventListener('click', e => {
  const act = e.target.closest('button')?.dataset.act;
  closeMenu();
  panelCommand(act);
});

$('#panelEmpty').addEventListener('click', e => panelCommand(e.target.closest('button')?.dataset.act));

$('#btnZoomMax').addEventListener('click', () => setZoom('max'));
$('#btnZoomSplit').addEventListener('click', () => setZoom('split'));

$('#brExternal').addEventListener('click', async () => {
  const tab = currentTab();
  if (!tab?.url || /^about:/.test(tab.url)) { attachHint('这个标签页还没有地址'); return; }
  const res = await woder.browser.openExternal(tab.url);
  if (!res.success) attachHint(res.message);
});

$('#brMore').addEventListener('click', e => {
  e.stopPropagation();
  if (!currentTab()) { attachHint('先打开一个网页'); return; }
  popup('#brMenu', e.currentTarget, 168);
});

$('#brMenu').addEventListener('click', async e => {
  const act = e.target.closest('button')?.dataset.act;
  closeMenu();
  const tab = currentTab();
  const wv = tab ? viewOf(tab.id) : null;
  if (!act || !tab) return;
  if (act === 'copy') attachHint((await copyText(tab.url)) ? '地址已复制' : '复制失败');
  if (act === 'hard' && viewReady(wv)) wv.reloadIgnoringCache();
  if (act === 'clearnotes') { tab.notes = []; pendingPick = null; drawMarkers(tab); renderBrowser(); }
});

$('#brUrl').addEventListener('focus', e => e.target.select());
$('#brUrl').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !composing(e)) { e.target.blur(); gotoAddr(e.target.value); }
  if (e.key === 'Escape') { e.target.blur(); renderBrowser(); }
});

/* ---------------- 内置终端 ---------------- */

let tmTabs = [];                 // { id, title, dead }
let tmActive = null;
const tmViews = new Map();       // tabId -> { term, fit, host, tab }
let tmSeq = 0;

const MONO = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim();
/* 整套配色跟着 :root 走，深底会跟面板其它部分打架 */
const TERM_THEME = {
  background: '#ffffff',
  foreground: '#17181c',
  cursor: '#5b5bd6',
  cursorAccent: '#ffffff',
  selectionBackground: '#dcdcf8',
  black: '#17181c', red: '#b4232a', green: '#1a7f37', yellow: '#8a6100',
  blue: '#2d5cf6', magenta: '#8b3fd6', cyan: '#0e7c86', white: '#e6e6ea',
  brightBlack: '#9a9ea8', brightRed: '#d94b45', brightGreen: '#2fa84f',
  brightYellow: '#c79a1e', brightBlue: '#5b7cfa', brightMagenta: '#b06ce0',
  brightCyan: '#33a6b0', brightWhite: '#f4f4f6'
};

function newTerm() {
  const id = `tm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tab = { id, title: `终端 ${++tmSeq}`, dead: false };
  tmTabs.push(tab);

  const host = el('div', 'tm-view');
  $('#tmStage').appendChild(host);
  const term = new Terminal({
    cursorBlink: true,
    fontFamily: MONO,
    fontSize: 12.5,
    scrollback: 3000,
    theme: TERM_THEME
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(host);
  fit.fit();
  term.onData(data => woder.term.write(id, data));
  term.onResize(({ cols, rows }) => woder.term.resize(id, cols, rows));
  tmViews.set(id, { term, fit, host, tab });

  setTerm(id);
  const wsId = app.activeWorkspaceId ?? undefined;
  if (!wsId) {
    // pty 要在某个目录里起，一个工作区都没有就只留一句话
    tab.dead = true;
    term.write('\x1b[31m还没有工作区，添加一个才能开终端\x1b[0m\r\n');
    renderTerminal();
    return tab;
  }
  // 先建视图再起 shell：pty 一有输出就往里写，晚一步第一步的提示符就丢了
  woder.term.create(id, wsId).then(res => {
    if (!res?.success) {
      tab.dead = true;
      term.write(`\x1b[31m${res?.message ?? '终端启动失败'}\x1b[0m\r\n`);
      renderTerminal();
      return;
    }
    // pty 起来是 80x24，得按面板实际尺寸再对一次
    woder.term.resize(id, term.cols, term.rows);
    if (panelActive === 'terminal') term.focus();
  });
  return tab;
}

function setTerm(id) {
  tmActive = id;
  renderTerminal();
  tmViews.get(id)?.term.focus();
}

/** 只拆这一个页签，不做兜底：面板整体关闭时用 */
function destroyTerm(id) {
  const v = tmViews.get(id);
  if (v) {
    woder.term.close(id);
    v.term.dispose();
    v.host.remove();
    tmViews.delete(id);
  }
  const i = tmTabs.findIndex(t => t.id === id);
  if (i >= 0) tmTabs.splice(i, 1);
  if (tmActive === id) tmActive = null;
}

function closeTerm(id) {
  const wasActive = tmActive === id;
  const i = tmTabs.findIndex(t => t.id === id);
  destroyTerm(id);
  // 最后一个关掉就不补新的了，连带把终端这个大页签一起收起来；
  // 关之前先把子页签条重画一次，别留一个指向已销毁会话的空壳
  if (!tmTabs.length) {
    renderTerminal();
    return closePanel('terminal');
  }
  if (wasActive) tmActive = tmTabs[Math.max(0, i - 1)]?.id ?? null;
  renderTerminal();
}

function renderTerminal() {
  const strip = $('#tmTabs');
  if (!strip) return;
  strip.innerHTML = '';
  tmTabs.forEach(t => {
    strip.appendChild(subTab(ICON.terminal, t.dead ? `${t.title} · 已退出` : t.title, t.id === tmActive,
      () => closeTerm(t.id), () => setTerm(t.id)));
  });
  strip.appendChild(subAdd('新建终端', () => newTerm()));
  strip.querySelector('.sub-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  // 非活动页签只是藏起来，终端的缓冲和尺寸都得留着
  tmViews.forEach((v, id) => v.host.classList.toggle('active', id === tmActive));
  fitActive();
}

/** 面板收着的时候宿主是 0x0，按 0 折算会把终端压成一列，所以先量一下再折 */
function fitActive() {
  const v = tmViews.get(tmActive);
  if (!v || !v.host.offsetWidth || !v.host.offsetHeight) return;
  v.fit.fit();
}

let fitTimer = null;
const scheduleFit = () => {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(fitActive, 60);
};
/* 拖面板边界、放大、分屏、隐藏侧栏都会改尺寸，跟着折一次列数行数。
   观察器在窗口被遮挡时可能整个停摆，所以窗口自身的 resize 另外听一次——用户改窗口是最常见的场景 */
new ResizeObserver(scheduleFit).observe($('#tmStage'));
window.addEventListener('resize', scheduleFit);

woder.term.onEvent(payload => {
  const v = tmViews.get(String(payload?.id));
  if (!v) return;
  if (payload.type === 'data') {
    v.term.write(String(payload.data ?? ''));
    return;
  }
  v.tab.dead = true;
  const code = Number.isInteger(Number(payload.exitCode)) ? `，退出码 ${payload.exitCode}` : '';
  v.term.write(`\r\n\x1b[90m[进程已退出${code}]\x1b[0m\r\n`);
  renderTerminal();
});

/* ---------------- 右侧面板 ---------------- */

$('#btnRefreshTree').addEventListener('click', () => refreshTree(app.activeWorkspaceId));
$('#treeFilter').addEventListener('input', e => {
  treeQuery = e.target.value.trim().toLowerCase();
  repaintTree();
});

/* ---------------- 启动 ---------------- */

(async function init() {
  const [wsRes, stored] = await Promise.all([woder.workspace.list(), woder.sessions.load()]);
  app.workspaces = wsRes.workspaces ?? [];
  app.sessions = stored.sessions ?? [];

  // 恢复最近一次仍归属有效工作区的会话
  const latest = [...app.sessions].reverse().find(s => workspaceOf(s.workspaceId));
  if (latest) {
    app.activeId = latest.id;
    app.activeWorkspaceId = latest.workspaceId;
  } else {
    app.activeWorkspaceId = app.workspaces[0]?.id ?? null;
    app.activeId = app.workspaces.length ? createSession(app.activeWorkspaceId).id : null;
  }

  await refreshEngineChip();
  // applyLayout 会顺手把任务监控画出来，所以放在这里而不是脚本顶层：
  // 它依赖 layout / monitor 两块状态，早一步初始化都会读到还没赋值的常量。
  applyLayout();
  renderSidebar();
  renderStream();
  await refreshTree(app.activeWorkspaceId);
  setPanel('review');
  $('#input').focus();
})();
