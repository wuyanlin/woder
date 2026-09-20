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
import { byFn } from './tools';
import { HistoryMessage, RequestImage } from './context';

/** 一轮任务最多推进这么多轮。到了上限就收尾说明情况，别让它自己转圈转到天荒地老 */
const MAX_ROUNDS = 12;

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

    while (round < MAX_ROUNDS) {
      if (cancelled()) break;
      round++;

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

      if (!turn.toolCalls.length) break;

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
        const params = call.args ?? {};
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
    }

    if (!answer && round >= MAX_ROUNDS) {
      answer = `这个需求推进了 ${MAX_ROUNDS} 轮还没做完，我先停在这里。接着说「继续」我就接着往下做。`;
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
