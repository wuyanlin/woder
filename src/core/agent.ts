/**
 * Agentic 循环 —— 模型每轮自己决定调哪个工具，工具结果回灌给它，直到它不再调用为止。
 *
 * 和原来「一次让模型出一份计划 JSON、然后照着跑完」的区别在于：模型能看见执行结果。
 * 用户说「看看 util 下面有什么」，它先 shell_run 跑一次 find 找到 src/util，再 file_list 进去看，
 * 而不是像之前那样把需求里的词硬凑成一个目录名、凑不出来就列根目录。
 */

import { AIEngine } from './ai-engine';
import { Executor, EventSink, ExecutionEvent, ExecutionSummary, RunOptions } from './executor';
import { TaskStep } from './planner';
import { FileDiff } from './diff';
import { byFn, normalizeArgs } from './tools';
import { HistoryMessage, RequestImage, estimateTokens } from './context';

/**
 * 一段连做的轮数预算。跑满不等于任务做完，只是换个气：接着自动开下一段，
 * 所以这个数不再像以前那样把用户卡在「请先说继续」上。
 */
const ROUNDS_PER_LEG = 12;

/** 自动续跑的段数上限（共 96 轮）。到顶说明需求真做不完或模型在原地打转，别再烧 token */
const MAX_LEGS = 8;

/** 换段时回灌的那句：明说继续做，别停下来征求同意 */
const KEEP_GOING = '上一段到点了，但需求还没做完：接着按原需求往下推进，不要停下来问我要不要继续，做完再给结论。';

/**
 * 从最老的工具结果开始折成一句提要（预算按模型窗口算，见 AIEngine.messageBudgetTokens）。
 * 只改 content、不删消息：assistant 的 tool_calls 和 tool 消息必须成对，
 * 少一条网关就直接拒收。
 */
function foldOldResults(messages: any[], budgetTokens: number): void {
  const size = () => messages.reduce((n, m) => n + estimateTokens(String(m.content ?? '')), 0);
  let total = size();
  if (total <= budgetTokens) return;
  for (const m of messages) {
    if (total <= budgetTokens) return;
    if (m.role !== 'tool') continue;
    const text = String(m.content ?? '');
    if (estimateTokens(text) <= 200) continue;
    m.content = `${text.slice(0, 200)}\n（这段结果已经用完，为省上下文折叠）`;
    total = size();
  }
}

/** 光表态不调工具最多催这么多次，免得模型反复「我这就去」把回合耗光 */
const MAX_NUDGES = 2;

/**
 * flash 级模型常把「我先把文件读一遍」当成一句话说完就收尾，需求一个字没动。
 * 这里只认「第一人称 + 马上要做的动作」那种句式；已经做完的（「我改好了」）、
 * 自我介绍里的（「我可以帮你读写文件」）都不算，纯聊天的回答不会被催。
 */
const ONLY_INTENT = /(?:我|让我|这就|马上|接下来|下面|待我)[^。，,；;]{0,12}(?:先|去|来|再|着手|尝试)?[^。，,；;]{0,4}(?:读|查看|看一下|看一遍|看看|查|找|列|搜|翻|打开|运行|执行|跑|确认|检查|核对|对比|改|写入|写进|补|加|删|移动|动手|下手)(?!了|好|过|完)/i;

const NUDGE = '你刚才只说了要做什么，没有真的调用工具。现在就把那个动作调用出来；确实不需要工具的话，直接给结论，别再重复这句话。';

/** 单个工具结果回灌给模型的长度。界面那份已经截过，这里是第二道闸，防止一次 find 把上下文吃光 */
const MAX_FEEDBACK = 4000;

export interface AgentRequest {
  taskId: string;
  request: string;
  history?: HistoryMessage[];
  images?: RequestImage[];
}

/** 每调一个工具就产出一条计划步骤，界面照旧按步骤渲染。主进程的放行提示也用这个名字 */
export function stepLabel(action: string, p: Record<string, any>): string {
  const text = (v: unknown, max = 40) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const path = text(p.path ?? p.from ?? '.', 50);
  switch (action) {
    case 'file.list': return `列出 ${path}`;
    case 'file.grep': return `搜索 ${text(p.pattern, 30)}`;
    case 'file.read': return `读取 ${path}`;
    case 'file.write': return `写入 ${path}`;
    case 'file.append': return `追加到 ${path}`;
    case 'file.mkdir': return `创建目录 ${path}`;
    case 'file.move': return `移动 ${path} → ${text(p.to, 50)}`;
    case 'file.delete': return `删除 ${path}`;
    case 'file.classify': return `统计 ${path} 的文件类型`;
    case 'shell.run': return `运行 ${text(p.command, 60)}`;
    case 'browser.open': return `打开 ${text(p.url, 60)}`;
    case 'browser.read': return '读取页面内容';
    case 'browser.click': return `点击 ${text(p.text ?? p.selector ?? `序号 ${p.index}`, 40)}`;
    case 'browser.type': return `输入 ${text(p.text, 40)}`;
    case 'browser.extract': return '抓取页面字段';
    case 'browser.screenshot': return '截取页面';
    case 'browser.close': return '关闭浏览器';
    case 'ask.user': return `问用户：${text(p.question, 50)}`;
    case 'todo.update': return `更新待办清单（${(Array.isArray(p.todos) ? p.todos : []).length} 项）`;
    case 'wait': return `等待 ${Number(p.ms) || 300}ms`;
    default: return text(p.command ?? p.path ?? p.url ?? action, 50) || action;
  }
}

export class AgentRunner {
  constructor(private executor: Executor, private ai: AIEngine) {}

  /**
   * 跑一轮需求。emit 出去的仍是 task:event，界面无需知道这次是 agentic 还是本地规则计划。
   */
  async run(req: AgentRequest, emit: EventSink, opts: RunOptions = {}): Promise<{
    steps: TaskStep[];
    summary: ExecutionSummary;
    answer: string;
    rounds: number;
  }> {
    const cancelled = () => !!opts.token?.aborted;
    const messages: any[] = [
      { role: 'system', content: this.ai.agentSystemPrompt() },
      ...(req.history ?? []).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: this.userContent(req.request, req.images ?? []) }
    ];

    const steps: TaskStep[] = [];
    const diffs: FileDiff[] = [];
    let completed = 0;
    let failed = 0;
    let answer = '';
    let seq = 0;
    let round = 0;
    let nudges = 0;
    let leg = 0;
    let legRounds = 0;
    let hitCeiling = false;

    while (true) {
      if (cancelled()) break;
      // 一段跑满时模型上一轮还在调工具，说明活儿干到一半：自动接着往下跑，
      // 不把「说继续」这件事推回给用户。
      if (legRounds >= ROUNDS_PER_LEG) {
        if (leg + 1 >= MAX_LEGS) {
          hitCeiling = true;
          break;
        }
        leg++;
        legRounds = 0;
        messages.push({ role: 'user', content: KEEP_GOING });
      }
      round++;
      legRounds++;

      let turn;
      try {
        turn = await this.ai.agentTurn(messages);
      } catch (error) {
        // 第一步都没迈出去，多半是这家网关不认函数调用 —— 抛给主进程转本地规则，
        // 界面会写明原因并给出「去设置」，比只报一句「模型没答上来」有用
        if (round === 1 && steps.length === 0) throw error;
        answer = `模型这一轮没答上来：${(error as Error).message}`;
        failed++;
        emit(this.event(req.taskId, this.synthetic('模型调用失败', 'ai.answer', {}), 'failed', undefined, answer));
        break;
      }

      // 边说边做是允许的：这句话先记下，没有后续工具调用时它就是最终回答
      if (turn.text) answer = turn.text;

      if (!turn.toolCalls.length) {
        // 只回了一句「我先把文件读一遍」却没带函数调用：这一轮等于没干活，催它真去做。
        // 纯聊天（打招呼、答概念）不命中那个句式，照旧直接结束，不会被多拖一个来回。
        if (nudges < MAX_NUDGES && ONLY_INTENT.test(turn.text)) {
          nudges++;
          messages.push({ role: 'assistant', content: turn.text });
          messages.push({ role: 'user', content: NUDGE });
          continue;
        }
        break;
      }

      messages.push({
        role: 'assistant',
        content: turn.text || '',
        tool_calls: turn.toolCalls.map(c => ({
          id: c.id,
          type: 'function',
          function: { name: c.fn, arguments: JSON.stringify(c.args ?? {}) }
        }))
      });

      for (const call of turn.toolCalls) {
        const spec = byFn(call.fn);
        const action = spec?.action ?? call.fn;
        // 参数在进门这一步就整形成界面要的形状：树里存的就是它，别等到下发时才改
        const params = normalizeArgs(action, call.args ?? {});
        const step = this.synthetic(stepLabel(action, params), action, params, `s${++seq}`);
        steps.push(step);

        if (cancelled()) {
          emit(this.event(req.taskId, step, 'skipped', '已取消，未执行'));
          continue;
        }

        emit(this.event(req.taskId, step, 'running'));
        let output: string;
        try {
          const result = await this.executor.dispatch(action, params, {
            ...opts,
            // 本轮没有上一步可言：该看什么由模型自己决定，别把上一个工具的输出硬塞给它
            lastOutput: ''
          });
          output = result.output ?? '(这一步没有输出)';
          if (result.diff) {
            diffs.push(result.diff);
            emit(this.event(req.taskId, step, 'completed', output, undefined, result.diff));
          } else {
            emit(this.event(req.taskId, step, 'completed', output));
          }
          completed++;
        } catch (error) {
          // 失败也要回灌：模型看见「文件不存在」才会换个路径再找，否则它以为一切顺利
          const message = (error as Error).message;
          output = `这一步失败了：${message}`;
          failed++;
          emit(this.event(req.taskId, step, 'failed', undefined, message));
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: output.length > MAX_FEEDBACK ? `${output.slice(0, MAX_FEEDBACK)}\n⋯ 结果过长已截断 ⋯` : output
        });
      }
      foldOldResults(messages, this.ai.messageBudgetTokens());
    }

    if (!answer && hitCeiling) {
      answer = `这个需求推进了 ${round} 轮还没做完，我先停在这里。接着说「继续」我就接着往下做。`;
    }
    if (!answer && steps.length === 0) {
      // 模型既没调工具也没说话，气泡总得留一句能看懂的话，不能空着
      answer = '这一轮没有做出动作，也没有给出说明。把需求说具体一点，或者说「继续」让我再试一次。';
    }
    if (cancelled()) {
      // 「已经停了」这件事由界面说（停止那一刻就写在气泡上），这里再补一句就是两条重复提示
      answer = '';
    }

    // 最后那句结论也占一个步骤位，界面照原有渲染就能显示成一条回答
    if (answer) {
      const step = this.synthetic('回复用户', 'ai.answer', { text: answer }, 'answer');
      steps.push(step);
      emit(this.event(req.taskId, step, 'running'));
      emit(this.event(req.taskId, step, 'completed', answer));
      completed++;
    }

    this.ai.learnFromRequest(req.request);

    return {
      steps,
      answer,
      rounds: round,
      summary: { taskId: req.taskId, completed, failed, skipped: 0, diffs }
    };
  }

  /** 多模态：需求文本 + 用户附带的图片，和规划路径的拼法一致 */
  private userContent(request: string, images: RequestImage[]): any {
    if (!images.length) return `需求：${request}`;
    return [
      { type: 'text', text: `需求：${request}\n\n本条需求附了 ${images.length} 张图片，请结合图片内容来做。` },
      ...images.map(i => ({ type: 'image_url', image_url: { url: i.dataUrl } }))
    ];
  }

  /** agentic 没有前置计划，这些步骤是跑的时候才冒出来的，字段得补成执行器原来的形状 */
  private synthetic(
    name: string,
    action: string,
    params: Record<string, any>,
    suffix?: string
  ): TaskStep {
    return {
      id: suffix ? `agent_${Date.now()}_${suffix}` : `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      action,
      params
    };
  }

  private event(
    taskId: string,
    step: TaskStep,
    status: ExecutionEvent['status'],
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
      ...(output ? { output } : {}),
      ...(error ? { error } : {}),
      ...(diff ? { diff } : {}),
      timestamp: Date.now()
    };
  }
}
