/**
 * AI 引擎 - 集成 OpenAI API 进行智能理解和任务规划
 */

import OpenAI from 'openai';
import { MemoryManager } from './memory';
import { ContextSection, HistoryMessage, ThinkingLevel, THINKING_BUDGET, DEFAULT_CONTEXT_WINDOW, statOf } from './context';
import { openaiTools } from './tools';

export interface AIConfig {
  apiKey: string;
  /** OpenAI 兼容网关地址，留空则使用官方端点 */
  baseUrl?: string;
  /** 当前使用的 Model ID */
  model: string;
  /** 手动录入的 Model ID 列表 */
  models?: string[];
  temperature?: number;
  maxTokens?: number;
  /** 单次请求超时，避免模型无响应时界面一直卡在「规划中」 */
  timeoutMs?: number;
  /** 思考强度，管理模型窗口里逐条设置；默认 'off'：qwen3 一类光 reasoning 就要 20 秒 */
  thinking?: ThinkingLevel;
  /** 这条模型的上下文窗口，右下角那个百分比的分母 */
  contextWindow?: number;
}

/** 单次请求最长等待。超时就直接走本地规则，别让用户对着「规划中」干等 */
const DEFAULT_TIMEOUT_MS = 15_000;

/** 一轮对话消耗了多少 token。reported=false 表示网关压根没回 usage，而不是真的 0 */
export interface UsageReport {
  prompt: number;
  completion: number;
  total: number;
  reported: boolean;
}

function emptyUsage(): UsageReport {
  return { prompt: 0, completion: 0, total: 0, reported: false };
}

/** 模型这轮想调的一个工具 */
export interface ToolCall {
  id: string;
  fn: string;
  args: Record<string, any>;
}

/** 一轮 agentic 请求的返回：想说的话 + 想调的工具，两者可以同时有 */
export interface AgentTurn {
  text: string;
  toolCalls: ToolCall[];
}

/** 网关回的工具参数是个 JSON 字符串；截断或写成单引号时退化成空参，别让整轮崩掉 */
function parseArgs(raw: unknown): Record<string, any> {
  if (raw && typeof raw === 'object') return raw as Record<string, any>;
  const text = String(raw ?? '').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : { value: parsed };
  } catch {
    return {};
  }
}

/** 从响应里累加用量：字段名在不同兼容网关上会飘，两种命名都认 */
function usageOf(response: any, add: UsageReport): UsageReport {
  const usage = response?.usage;
  if (!usage) return add;

  const prompt = Number(usage.prompt_tokens ?? usage.promptTokens) || 0;
  const completion = Number(usage.completion_tokens ?? usage.completionTokens) || 0;
  const total = Number(usage.total_tokens ?? usage.totalTokens) || prompt + completion;

  return {
    prompt: add.prompt + prompt,
    completion: add.completion + completion,
    total: add.total + total,
    reported: true
  };
}

/**
 * 判断错误是不是「网关不认识这个参数」。
 * 5xx / 超时不算，避免把网络问题当成参数问题再白等一次。
 */
function isUnsupportedParamError(error: any): boolean {
  const status = error?.status ?? error?.response?.status;
  if (typeof status === 'number' && status >= 500) return false;
  if (error?.name === 'APIConnectionTimeoutError' || error?.name === 'AbortError') return false;

  const text = `${error?.message ?? ''} ${JSON.stringify(error?.error ?? '')}`;
  return /enable_thinking|unrecognized|unknown (request )?param|unexpected (param|property|key)|extra fields|not (a )?supported|unsupported (param|field)|unhandled/i.test(text);
}

/** 把 SDK / 网关的英文报错转成界面上一句能看懂的话 */
function describeError(error: any, timeoutMs = DEFAULT_TIMEOUT_MS): string {
  const raw = String(error?.message ?? error ?? '未知错误').replace(/^Error:\s*/, '');
  const status = error?.status ?? error?.response?.status;

  if (status === 401 || status === 403) return `API Key 校验没通过（HTTP ${status}）`;
  if (status === 404) return `接口地址或 Model ID 不对（HTTP 404）`;
  if (status === 429) return '请求太频繁，稍等一下再发（HTTP 429）';
  if (error?.name === 'APIConnectionTimeoutError' || /timed?\s?out/i.test(raw)) {
    return `模型 ${Math.round(timeoutMs / 1000)} 秒内没返回`;
  }
  if (error?.name === 'APIConnectionError' || /connection error|fetch failed|network|econn/i.test(raw)) {
    return '连不上接口地址，检查 Base URL 和网络';
  }
  return raw;
}

export class AIEngine {
  private openai: OpenAI | null = null;
  private config: AIConfig;
  private memoryManager: MemoryManager;
  private workspace: string;
  /** 自上次 drainUsage() 以来所有请求累计的 token 用量 */
  private usedTokens: UsageReport = emptyUsage();

  constructor(config: AIConfig, memoryManager: MemoryManager, workspace: string) {
    this.config = config;
    this.memoryManager = memoryManager;
    this.workspace = workspace;
    this.buildClient();
  }

  /**
   * 按当前 baseUrl 重建客户端。
   * maxRetries 关掉：规划失败会立刻回落到本地规则，而不是让用户等三轮重试。
   * timeout 是规划请求的等待上限，总结这类慢动作在 chat() 里单独放宽。
   */
  private buildClient(): void {
    this.openai = this.config.apiKey
      ? new OpenAI({
          apiKey: this.config.apiKey,
          timeout: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          maxRetries: 0,
          ...(this.config.baseUrl ? { baseURL: this.config.baseUrl } : {})
        })
      : null;
  }
  
  /**
   * 设置 AI 配置
   */
  setConfig(config: Partial<AIConfig>): void {
    this.config = { ...this.config, ...config };
    this.buildClient();
  }
  
  /**
   * 检查是否已配置 API Key
   */
  isConfigured(): boolean {
    return !!this.openai;
  }

  /**
   * 能不能真的发一次规划请求：既要有 Key，也要有手动填的 Model ID。
   * 缺任何一样就直接走本地规则，别白跑一次网络请求。
   */
  canPlan(): boolean {
    return !!this.openai && !!this.config.model;
  }

  setWorkspace(workspace: string): void {
    this.workspace = workspace;
  }
  
  /**
   * 统一发起对话请求。
   * 思考档位来自「管理模型」：'off' 带 enable_thinking:false（实测同一份请求 22.5s → 1.7s），
   * 'none' 一个思考字段都不带，其余档位开思考并给 reasoning 留预算。
   * 遇到不认这些参数的网关，去掉它们再试一次，不影响兼容官方端点。
   */
  private thinkingParams(): Record<string, unknown> {
    const level = this.config.thinking ?? 'off';
    if (level === 'none') return {};
    if (level === 'off') return { enable_thinking: false };
    return { enable_thinking: true, thinking_budget: THINKING_BUDGET[level] };
  }

  private async chat(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    options: { temperature: number; maxTokens: number; timeoutMs?: number }
  ): Promise<string> {
    const message = await this.rawMessage(messages, options);
    return message?.content ?? '';
  }

  /**
   * 发一次请求，拿回原始的 assistant message（含 tool_calls）。
   * chat() 只要文本，agentic 循环要函数调用，所以底层统一成这个，别让两边各写一遍重试逻辑。
   */
  private async rawMessage(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    options: { temperature: number; maxTokens: number; timeoutMs?: number; tools?: object[] }
  ): Promise<any> {
    if (!this.openai) {
      throw new Error('未配置 API Key');
    }

    const extra = this.thinkingParams();
    // 开思考后 max_tokens 只管回答，不把它加上就会「想完了没地方写答案」，界面表现为空计划
    const budget = Number(extra.thinking_budget) || 0;
    const maxTokens = options.maxTokens + budget;
    const requestOptions = options.timeoutMs ? { timeout: options.timeoutMs } : undefined;
    const request = (thinking: Record<string, unknown>) =>
      this.openai!.chat.completions.create({
        model: this.config.model,
        messages,
        temperature: options.temperature,
        max_tokens: maxTokens,
        ...(options.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {}),
        ...thinking
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, requestOptions);

    let response;
    try {
      response = await request(extra);
    } catch (error) {
      if (!Object.keys(extra).length || !isUnsupportedParamError(error)) throw error;
      response = await request({});
    }

    this.usedTokens = usageOf(response, this.usedTokens);
    return response.choices?.[0]?.message ?? {};
  }

  /**
   * 取走并清零累计用量。界面用它算「本轮消耗了多少 token」，
   * 所以调用方要成对使用：阶段开始先清一次，阶段结束再取一次。
   */
  drainUsage(): UsageReport {
    const usage = this.usedTokens;
    this.usedTokens = emptyUsage();
    return usage;
  }

  /** 当前生效的 Model ID，界面用来标注这条回复是哪个模型给的 */
  activeModel(): string {
    return this.config.model ?? '';
  }

  /** 记忆与工作区：跨会话攒下来的东西，占用记在「记忆」这一栏 */
  private memoryBlock(): string {
    const context = this.memoryManager.getContext();
    // 历史版本把需求原话也塞进了 recentFiles，会让提示里的「最近路径」变成一堆旧需求，
    // 把模型往「凡事先列目录」上带偏，这里只放行看起来像路径的条目。
    const recentPaths = context.recentFiles
      .filter(f => typeof f === 'string' && /[\/.]/.test(f) && !/\s/.test(f))
      .slice(0, 5)
      .join(', ') || '无';

    return `当前上下文：
- 工作区：${this.workspace}
- 最近操作过的路径：${recentPaths}`;
  }

  /**
   * agentic 循环的系统提示词：不再要求模型「先出一份计划」，而是告诉它怎么一轮一轮干活。
   * 工具本身由 function schema 给，不在提示词里重复一遍。
   */
  private agentPersonaBlock(): string {
    return `你是 Woder，一个运行在用户电脑上的工作助手。你像其他 agentic 工具那样干活：一轮一轮地调用工具、看结果、再决定下一步，直到需求真正做完，然后用中文说一句结论。

判断顺序：
- 打招呼、闲聊、问你是谁、问一个概念、让你解释看到的信息 —— 不调用任何工具，直接回一句中文就结束这一轮。
- 需求要对文件、网页、命令做点什么 —— 先按下面的「进展清单」开工，然后直接调用工具去做，不要反过来问用户「要不要我列一下目录」。
- 不知道工作区里有什么、某个文件在哪 —— 用 shell_run 跑 find / dir，或 file_grep / file_list 去看清楚再动手，别凭印象猜路径。
- 需求含糊、必须动文件才能往下做（没说要改哪个文件、要删的东西没点名）—— 用 ask_user 问一句，别猜着做。
- 说了要做就在这一轮把工具调用出来：只回一句「我先把文件读一遍」就结束，等于什么都没做，用户还得再催一次。

进展清单（要改东西、要跑好几步的需求才用）：
- 动手之前先 todo_update 一次，把需求拆成 3-6 条待办，全标 pending；第一条标 doing。
- 每做完一条就再 todo_update 一次，把整张清单重发一遍（全量，不是只发新完成的那条），完成标 done、正在做标 doing。
- 别为了一句话就能答完的需求列清单，也别每调一次工具都发一张清单，那只会刷屏。`;
  }

  /**
   * shell_run 起的是系统默认 shell（POSIX 下 /bin/sh，Windows 下 cmd.exe），
   * 命令语法两边不通。查找文件现在全靠 shell，不告诉模型自己在跟谁说话，它就会端错语法。
   */
  private shellBlock(): string {
    const win = process.platform === 'win32';
    return `运行环境与怎么找文件：
- 你现在在 ${win ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'} 上，shell_run 用 ${win ? 'cmd.exe' : '/bin/sh'}，工作目录已经是工作区根，命令里写相对路径。
- 想知道「有什么文件」「某个文件在哪」就用 shell_run 跑系统命令，没有别的查找工具：${win
      ? 'dir /s /b *util*、where /r . *.ts、type 文件名'
      : "find . -iname '*util*'、ls -la、find . -name '*.ts' -not -path './node_modules/*'"}。
- 递归查找记得排除 node_modules、.git、dist 这些大目录（find 用 -not -path，或加 | head 限制条数），不然结果会被截断，反而看不清。`;
  }

  private agentRuleBlock(): string {
    return `硬性规则：
1. path 一律相对于工作区根目录，不要用绝对路径，不要用 .. 越界。
2. 改文件之前必须先 file_read 看过原文；file_write 的 content 必须是完整的最终内容，不能留占位符或省略号。
3. 互不依赖的查询可以在同一轮里一起调用，省下来回。
4. 网页操作全走内置浏览器：browser_open 之后先 browser_read 拿带序号的元素清单，再 click / type；页面点过、跳转过就要重新 read，别沿用旧序号。
5. shell_run 就是普通的命令行：查询类的（find、ls、dir、grep 这些）直接跑，会改动东西的命令要先经用户放行；命令原样可执行、不要包 sudo，也不要跑 rm -rf 这类破坏性操作。
6. 需求没做完就一直往下推进，别中途停下来问「要不要继续」，也不要因为轮数多就提前收尾；做完再给结论。
7. 给用户看的文字一律中文、简洁，不要复述工具输出的大段内容。`;
  }

  /** 每轮都一样的那部分系统提示。记忆单独一块，上下文统计要分开记账 */
  private agentCorePrompt(): string {
    return [this.agentPersonaBlock(), this.agentRuleBlock(), this.shellBlock()].join('\n\n');
  }

  /**
   * agentic 循环里「消息」这一块能占多少 token。长跑几十轮时旧的工具结果按这个数折叠，
   * 窗口另一半留给系统提示、工具定义和输出，不然网关直接拒收。
   */
  messageBudgetTokens(): number {
    return Math.round((this.config.contextWindow || DEFAULT_CONTEXT_WINDOW) * 0.5);
  }

  /** agentic 循环真正要发的系统消息。AgentRunner 和上下文统计都读它，保证两边是同一份。 */
  agentSystemPrompt(): string {
    return [this.agentCorePrompt(), this.memoryBlock()].join('\n\n');
  }

  /**
   * 走一轮 agentic 请求：把当前消息和工具清单发出去，拿回模型这轮想说的话和想调的工具。
   * 不在这兜底降级——出错了由 AgentRunner 决定是收尾还是报错。
   */
  async agentTurn(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<AgentTurn> {
    if (!this.openai) {
      throw new Error('未配置 API Key');
    }
    const message = await this.rawMessage(messages, {
      temperature: this.config.temperature || 0.3,
      maxTokens: this.config.maxTokens || 4000,
      // 一次工具调用要写完整文件内容，比规划一份计划慢得多
      timeoutMs: 90_000,
      tools: openaiTools()
    });

    const calls: ToolCall[] = (message.tool_calls ?? []).map((c: any) => ({
      id: String(c?.id ?? ''),
      fn: String(c?.function?.name ?? ''),
      args: parseArgs(c?.function?.arguments)
    }));

    return { text: String(message.content ?? '').trim(), toolCalls: calls };
  }

  /**
   * 一轮请求的分区占用。界面右下角那个百分比和明细卡片都读这里，
   * 保证「显示给用户的」和「真要发给模型的」是同一份内容。
   */
  contextSections(history: HistoryMessage[], request: string): ContextSection[] {
    const messages = [...history.map(m => m.content), `需求：${request ?? ''}`].join('\n');
    return [
      { key: 'system', label: '系统提示词', text: this.agentCorePrompt() },
      { key: 'tools', label: '系统工具', text: JSON.stringify(openaiTools()) },
      { key: 'memory', label: '记忆', text: this.memoryBlock() },
      { key: 'messages', label: '消息', text: messages },
      // 输出不是文本，按 max_tokens 直接记账
      { key: 'output', label: '输出预留', text: '', tokens: this.config.maxTokens || 4000 }
    ];
  }

  contextStat(history: HistoryMessage[], request: string) {
    return statOf(this.contextSections(history, request), this.config.contextWindow ?? undefined);
  }

  /**
   * 压缩会话历史：把一堆「需求 → 结果」压成一段中文摘要。
   * 只说话不读文件，超时给足 30 秒；失败由主进程兜成本地摘要。
   */
  async compactContext(lines: string[]): Promise<string> {
    if (!this.openai) {
      throw new Error('未配置 API Key');
    }
    const content = await this.chat(
      [
        {
          role: 'system',
          content: '你是会话压缩助手。把下面多轮「需求 → 结果」压成一段不超过 120 字的中文摘要，保留做过什么、改动了哪些文件、还有什么没做完；不要分点、不要客套话。'
        },
        { role: 'user', content: lines.slice(0, 40).join('\n') }
      ],
      { temperature: 0.2, maxTokens: 400, timeoutMs: 30_000 }
    );
    const text = content.trim();
    if (!text) throw new Error('模型没有给出摘要');
    return text;
  }
  
  /**
   * 从请求中学习用户习惯。规划路径和 agentic 路径都要调，所以是公开的。
   */
  learnFromRequest(request: string): void {
    // 简单的模式识别
    if (request.includes('整理') || request.includes('organize')) {
      this.memoryManager.learnBehavior('file_organization', 1);
    }
    if (request.includes('浏览器') || request.includes('web') || request.includes('website')) {
      this.memoryManager.learnBehavior('browser_automation', 1);
    }
    if (request.includes('分析') || request.includes('analyze') || request.includes('report')) {
      this.memoryManager.learnBehavior('data_analysis', 1);
    }
  }

  /**
   * 获取对话历史（用于多轮对话）
   */
  async getChatCompletion(messages: Array<{role: string; content: string}>): Promise<string> {
    return this.chat(messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[], {
      temperature: this.config.temperature || 0.7,
      maxTokens: this.config.maxTokens || 1000,
      // 总结是计划里的显式步骤，界面上有进度，可以比规划多等一会儿
      timeoutMs: 60_000
    });
  }
  
  /**
   * 总结长文本
   */
  async summarizeText(text: string, maxLength: number = 500): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI API not configured');
    }
    
    const response = await this.getChatCompletion([
      {
        role: 'system',
        content: '你是一个文本总结助手。请将提供的文本浓缩为简洁的摘要，保留关键信息。'
      },
      {
        role: 'user',
        content: `请总结以下文本（最多 ${maxLength} 字）:\n\n${text}`
      }
    ]);
    
    return response;
  }
}
