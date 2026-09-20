/**
 * 上下文用量统计
 *
 * 把「一次规划请求真正会发出去的内容」拆成几块分别估 token：
 * 界面右下角那个百分比、卡片里的分区明细、以及「压缩上下文」能释放多少，
 * 全部以这里的数字为准，避免界面显示一套、模型收到另一套。
 */

/** 网关不会告诉我们窗口多大，统一按 128k 估算，界面上会注明是估算值 */
export const DEFAULT_CONTEXT_WINDOW = 128_000;

/**
 * 思考强度。'off' 带 enable_thinking:false，'none' 一个思考字段都不带（老网关吃了不吐），
 * 其余等级开思考并给 reasoning 留预算。
 */
export type ThinkingLevel = 'none' | 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** 开思考时给 reasoning 的 token 预算，界面那 6 档就映射到这里 */
export const THINKING_BUDGET: Record<Exclude<ThinkingLevel, 'none' | 'off'>, number> = {
  minimal: 512,
  low: 1024,
  medium: 2048,
  high: 4096,
  xhigh: 8192,
  max: 16384
};

export const THINKING_LEVELS: ThinkingLevel[] = [
  'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'off', 'none'
];

export function normalizeThinking(raw: unknown): ThinkingLevel {
  const value = String(raw ?? '');
  return (THINKING_LEVELS as string[]).includes(value) ? (value as ThinkingLevel) : 'off';
}

/** 滑杆只能停在这些档位上，主进程用同一个列表做钳制 */
export const CONTEXT_WINDOW_STEPS = [
  8_000, 16_000, 32_000, 64_000, 96_000, 128_000, 160_000, 200_000,
  256_000, 320_000, 400_000, 512_000, 640_000, 800_000, 1_000_000
];

export function snapContextWindow(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_CONTEXT_WINDOW;
  return CONTEXT_WINDOW_STEPS.reduce(
    (best, step) => (Math.abs(step - value) < Math.abs(best - value) ? step : best),
    CONTEXT_WINDOW_STEPS[0]
  );
}

export type ContextKey = 'system' | 'tools' | 'memory' | 'messages' | 'output';

export interface ContextSection {
  key: ContextKey;
  label: string;
  text: string;
  /** 有些占用不是文本（比如给输出预留的 max_tokens），直接给 token 数 */
  tokens?: number;
}

export interface ContextItem {
  key: ContextKey;
  label: string;
  tokens: number;
  ratio: number;
}

export interface ContextStat {
  window: number;
  used: number;
  ratio: number;
  sections: ContextItem[];
}

/** 规划请求带上的历史对话，形状和 OpenAI 的 messages 一致 */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 用户随需求附上的图片，dataUrl 原样进多模态消息 */
export interface RequestImage {
  name: string;
  mime: string;
  dataUrl: string;
}

/**
 * 中文按字算、其余按 4 个字符 1 token 算。
 * 精确值只有网关会报，所以界面上一律标「估算」，别装作是计费数字。
 */
export function estimateTokens(text: string): number {
  const value = String(text ?? '');
  if (!value) return 0;
  const cjk = (value.match(/[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g) ?? []).length;
  return Math.round(cjk * 0.9 + (value.length - cjk) / 4);
}

export function statOf(sections: ContextSection[], windowTokens: number = DEFAULT_CONTEXT_WINDOW): ContextStat {
  const items: ContextItem[] = sections.map(section => {
    const tokens = section.tokens ?? estimateTokens(section.text);
    return { key: section.key, label: section.label, tokens, ratio: tokens / windowTokens };
  });
  const used = items.reduce((sum, item) => sum + item.tokens, 0);
  return { window: windowTokens, used, ratio: used / windowTokens, sections: items };
}

/**
 * 没接入模型时的压缩兜底：把每轮「需求 → 结果」各留一句拼起来。
 * 目的是让百分比真的降下来，而不是骗界面说压缩过了。
 */
export function localDigest(lines: string[], maxChars = 320): string {
  const parts = lines
    .map(line => String(line).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(-12)
    .map(line => (line.length > 42 ? `${line.slice(0, 42)}…` : line));
  if (!parts.length) return '（没有可压缩的历史内容）';
  const text = `早前 ${parts.length} 轮：${parts.join('；')}`;
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}
