/**
 * AI 引擎 - 集成 OpenAI API 进行智能理解和任务规划
 */

import OpenAI from 'openai';
import { TaskPlan, TaskStep } from './planner';
import { MemoryManager } from './memory';
import { ContextSection, HistoryMessage, RequestImage, ThinkingLevel, THINKING_BUDGET, statOf } from './context';

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
    return response.choices?.[0]?.message?.content ?? '';
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

  /**
   * 使用 LLM 增强任务规划
   *
   * history 是同一会话里前面几轮的问答（被压缩过的部分由界面合成一条摘要传来）。
   * 带上它，「继续」「再改一下」这类需求才有依据；界面右下角的上下文占用也按这份消息算。
   * images 是用户随需求附上的图片，走多模态 content，模型不支持视觉时会报错并降级到本地规则。
   */
  async enhanceTaskPlan(
    userRequest: string,
    history: HistoryMessage[] = [],
    images: RequestImage[] = []
  ): Promise<TaskPlan> {
    if (!this.openai) {
      throw new Error('未配置 API Key');
    }

    const note = images.length ? `\n\n本条需求附了 ${images.length} 张图片，请结合图片内容规划。` : '';
    const brief = `需求：${userRequest}${note}\n\n请输出执行计划 JSON。`;
    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] | string = images.length
      ? [
          { type: 'text', text: brief },
          ...images.map(i => ({ type: 'image_url' as const, image_url: { url: i.dataUrl } }))
        ]
      : brief;

    try {
      const content = await this.chat(
        [
          { role: 'system', content: this.buildSystemPrompt() },
          ...history.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: userContent }
        ],
        {
          temperature: this.config.temperature || 0.3,
          // max_tokens 不影响思考关闭后的耗时，留大是为了让 file.write 的完整内容不被截断
          maxTokens: this.config.maxTokens || 6000
        }
      );

      if (!content.trim()) {
        throw new Error('模型只返回了思考内容，没有给出计划');
      }

      const plan = this.parseAIResponse(content);

      // 保存用户偏好（学习）
      this.learnFromRequest(userRequest);

      return plan;
    } catch (error) {
      // 不在这里偷偷降级：抛给主进程，界面才能区分「AI 规划」和「本地规则规划」
      console.error('AI planning error:', error);
      throw new Error(`AI 规划失败：${describeError(error, this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS)}`);
    }
  }
  
  /**
   * 角色与判断规则。单独成块是为了上下文统计能把它和工具清单分开算。
   */
  private personaBlock(): string {
    return `你是 Woder，一个运行在用户电脑上的智能工作助手。你的任务是把用户的自然语言需求拆解成一份可执行计划。

第一步先判断需求属于哪一类，再决定要不要动文件：
A. 打招呼、闲聊、问你是谁、问你能做什么、让你解释一个概念、问你看到的信息是什么意思 —— 这类只需要说话，不需要碰任何文件。只输出 1 步 ai.answer，把要回复的完整中文写在 params.text 里。绝对不要为了有事可做就去 file.list。
B. 明确要对工作区里的文件、网页做操作或分析，或者要跑一条命令 —— 才用下面的 file.* / shell.run / ai.summarize / browser.* 动作，并且只做需求真正要求的那几步。
C. 需求含糊、又必须动文件才能往下做（比如没说改哪个文件、目录下有同名候选、要删的东西没点名）—— 用 ask.user 问清楚，别猜着往下做。问题写成一句中文放进 question，可能的答案给成 2-4 个 options，实在需要自由输入（比如让用户给个文件名）就只留 1 个选项或者直接不给 options。`;
  }

  /** 执行器真正支持的 action，等价于其他产品里的「系统工具 / Skill」 */
  private toolBlock(): string {
    return `动作清单（action 只能取这些值）：
- ai.answer      params: { text: string }                             把话直接回复给用户，不读写任何文件
- ask.user       params: { question: string, options?: [{ label, detail?, recommended? }] }
                     停下来问用户一个选择题：界面弹出问答卡，用户点选项或自己输入，答案文本就是这一步的输出。
                     options 给 2-4 项，label 是几个字的短答案（要能直接当需求复述给后续步骤用），detail 说明选它会发生什么，
                     recommended 最多一项标「推荐」。实在要用户自由发挥（比如文件名）就少给或不给选项。
                     这一步必须是计划的最后一步，答完这一轮就结束了，用户的答案会作为下一条需求接着跑。
- file.list      params: { path: string, recursive?: boolean }        列出目录内容
- file.read      params: { path: string }                             读取文件
- file.write     params: { path: string, content: string }            写入/覆盖文件，content 必须是可直接落盘的完整内容
- file.append    params: { path: string, content: string }            追加内容到文件末尾
- file.mkdir     params: { path: string }                             创建目录
- file.move      params: { from: string, to: string }                 移动或重命名
- file.delete    params: { path: string }                             删除文件
- file.classify  params: { path: string }                             按扩展名统计分组
- ai.summarize   params: { path?: string, text?: string, maxLength?: number }  总结文本或文件；两个都不给时总结上一步的输出
- shell.run      params: { command: string, cwd?: string, timeoutMs?: number }  在工作区里执行一条终端命令，默认 30 秒超时、最长 120 秒
- browser.open   params: { url: string }                              在右侧内置浏览器里打开网页，只负责打开
- browser.read   params: { maxLength?: number }                       读当前页面：标题、正文、带序号的可点击元素清单
- browser.click  params: { index?: number, selector?: string, text?: string }  点击页面元素，优先用 browser.read 返回的 index
- browser.type   params: { text: string, index?: number, selector?: string, submit?: boolean }  往输入框填内容，submit 为 true 时顺便回车
- browser.extract params: { selectors: string[] }                     按 CSS 选择器抓页面文本
- browser.screenshot params: { path?: string }                        截取当前页面，存到工作区 screenshots/ 下
- browser.close  params: {}                                          关闭内置浏览器所有标签页
- wait           params: { ms: number }                               等待`;
  }

  private ruleBlock(): string {
    return `硬性规则：
1. path 一律使用相对于工作区根目录的相对路径，不要使用绝对路径，不要使用 .. 越界。
2. 需要读取结果再决定下一步时，用 dependsOn 声明依赖，被依赖步骤的 id 必须真实存在。
3. file.write 的 content 必须写全，不要用占位符或省略号。
4. 步骤数量控制在 1-8 个，能一步做完就不要拆多步；说话能解决的只做 1 步 ai.answer。
5. 回复给用户的文字一律用中文。
6. shell.run 只在用户明确要跑命令时使用，command 原样可执行、不要包 sudo，也不要用来做 rm -rf 这类破坏性操作；cwd 用相对路径。
7. 网页操作全部走内置浏览器：先 browser.open，再 browser.read，之后才能按 read 返回的序号 browser.click / browser.type。页面点过、跳转过就要重新 read，别沿用旧序号。
8. 只输出 JSON，不要任何解释文字、不要 markdown 代码块。
9. ask.user 只能放在最后一步：你拿不到答案就没法写后面的具体参数。要问就先说话再问（前面可以放 ai.answer 说明为什么要问）。

例子：
需求「你好」→ {"taskId":"t1","steps":[{"id":"s1","name":"打招呼并说明能做什么","action":"ai.answer","params":{"text":"你好，我可以帮你读写和整理工作区里的文件、总结文本、用内置浏览器打开网页看内容。直接说你想做什么就行。"}}],"status":"pending","createdAt":"2026-01-01T00:00:00.000Z"}
需求「把内容改成 456」且目录下同时有 123.txt 和 123.md → {"taskId":"t5","steps":[{"id":"s1","name":"说明为什么要问","action":"ai.answer","params":{"text":"目录下同时存在 123.txt 和 123.md，需要你确认改哪个。"}},{"id":"s2","name":"确认改哪个文件","action":"ask.user","params":{"question":"要把哪个文件的内容改成 456?","options":[{"label":"123.txt","detail":"修改 123.txt","recommended":true},{"label":"123.md","detail":"修改 123.md"},{"label":"两个都改","detail":"两个文件内容都改成 456"}]}}],"status":"pending","createdAt":"2026-01-01T00:00:00.000Z"}
需求「列出 src 目录」→ {"taskId":"t2","steps":[{"id":"s1","name":"列出 src 目录","action":"file.list","params":{"path":"src"}}],"status":"pending","createdAt":"2026-01-01T00:00:00.000Z"}
需求「跑一下 git status」→ {"taskId":"t3","steps":[{"id":"s1","name":"查看工作区改动","action":"shell.run","params":{"command":"git status --short"}}],"status":"pending","createdAt":"2026-01-01T00:00:00.000Z"}
需求「打开 https://example.com 看看讲了什么」→ {"taskId":"t4","steps":[{"id":"s1","name":"打开 example.com","action":"browser.open","params":{"url":"https://example.com"}},{"id":"s2","name":"读取页面内容","action":"browser.read","params":{},"dependsOn":["s1"]},{"id":"s3","name":"总结页面讲了什么","action":"ai.summarize","params":{"maxLength":300},"dependsOn":["s2"]}],"status":"pending","createdAt":"2026-01-01T00:00:00.000Z"}

输出结构：
{"taskId":"字符串","steps":[{"id":"字符串","name":"简短中文名","action":"上述动作之一","params":{},"dependsOn":["已存在的步骤id"]}],"status":"pending","createdAt":"ISO时间"}`;
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
   * 构建系统提示词
   */
  private buildSystemPrompt(): string {
    return [this.personaBlock(), this.toolBlock(), this.ruleBlock(), this.memoryBlock()].join('\n\n');
  }

  /**
   * 一次规划请求的分区占用。界面右下角那个百分比和明细卡片都读这里，
   * 保证「显示给用户的」和「真要发给模型的」是同一份内容。
   */
  contextSections(history: HistoryMessage[], request: string): ContextSection[] {
    const messages = [...history.map(m => m.content), `需求：${request ?? ''}`].join('\n');
    return [
      { key: 'system', label: '系统提示词', text: `${this.personaBlock()}\n\n${this.ruleBlock()}` },
      { key: 'tools', label: '系统工具', text: this.toolBlock() },
      { key: 'memory', label: '记忆', text: this.memoryBlock() },
      { key: 'messages', label: '消息', text: messages },
      // 输出不是文本，按 max_tokens 直接记账
      { key: 'output', label: '输出预留', text: '', tokens: this.config.maxTokens || 6000 }
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
   * 解析 AI 响应：容忍 markdown、前后解释文字，并补齐执行器需要的字段
   */
  private parseAIResponse(content: string): TaskPlan {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error('响应里没有 JSON 计划');
    }

    let plan: any;
    try {
      plan = JSON.parse(content.slice(start, end + 1));
    } catch {
      throw new Error('计划 JSON 不完整，可能被输出长度截断');
    }

    const rawSteps: any[] = Array.isArray(plan.steps) ? plan.steps : [];
    const usedIds = new Set<string>();
    const steps: TaskStep[] = rawSteps
      .filter(s => s && typeof s.action === 'string')
      .map((s, i) => {
        let id = typeof s.id === 'string' && s.id ? s.id : `step_${i + 1}`;
        // 模型偶尔会给出重复 id，执行器按 id 记录状态会串位
        while (usedIds.has(id)) id = `${id}_b`;
        usedIds.add(id);

        const params = typeof s.params === 'object' && s.params ? s.params : {};
        // ai.answer 的字段名模型会飘（answer/message/reply/content），统一成 text
        if (s.action === 'ai.answer' && typeof params.text !== 'string') {
          params.text = params.answer ?? params.message ?? params.reply ?? params.content ?? params.result ?? '';
        }

        return {
          id,
          name: typeof s.name === 'string' && s.name ? s.name : `步骤 ${i + 1}`,
          action: s.action,
          params,
          ...(Array.isArray(s.dependsOn) ? { dependsOn: s.dependsOn.filter((d: any) => typeof d === 'string') } : {})
        };
      });

    if (steps.length === 0) {
      throw new Error('模型没有给出可执行步骤');
    }

    return {
      taskId: typeof plan.taskId === 'string' && plan.taskId ? plan.taskId : this.generateTaskId(),
      steps,
      status: 'pending',
      createdAt: plan.createdAt ? new Date(plan.createdAt) : new Date()
    };
  }

  /**
   * 从请求中学习用户习惯
   */
  private learnFromRequest(request: string): void {
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
   * 生成任务 ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
