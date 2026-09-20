/**
 * 任务规划器 - 将复杂需求拆解为可执行步骤
 * 未配置 LLM 时作为降级方案，使用关键词规则生成计划
 */

export interface TaskStep {
  id: string;
  name: string;
  action: string;
  params: Record<string, any>;
  dependsOn?: string[];
}

export interface TaskPlan {
  taskId: string;
  steps: TaskStep[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
}

export class Planner {
  async planTask(userRequest: string): Promise<TaskPlan> {
    const steps: TaskStep[] = [];
    // IPC 传什么都可能，先归一成字符串，下面 guessPath/reportTemplate 才能直接用
    userRequest = typeof userRequest === 'string' ? userRequest : String(userRequest ?? '');
    const text = userRequest.toLowerCase();

    const wantsOrganize = /整理|分类|归位|扫描|盘点|organize|classify/.test(text);
    const wantsList = /列出|列一?下|都有哪些|都有啥|有哪些|有什么文件|看看|list|ls\b/.test(text);
    const wantsSummary = /总结|摘要|概括|概览|summary|summarize/.test(text);
    const wantsReport = /报告|汇报|写一份|生成一份|report|周报|日报/.test(text);
    const wantsWeb = /网页|网站|浏览器|抓取|提取|url|http|browser|scrape/.test(text);
    const wantsCommand = /运行|执行|跑一?下|终端|命令行|shell|command/.test(text);
    const command = this.guessCommand(userRequest);

    if (this.looksConversational(text)) {
      steps.push(this.step('直接回复用户', 'ai.answer', { text: this.introText() }));
    } else if (wantsCommand && command) {
      // 本地规则不猜命令内容，只有需求里确实带了一条能识别的命令才敢跑
      steps.push(this.step(`运行 ${command.slice(0, 48)}`, 'shell.run', { command }));
    } else if (wantsOrganize) {
      const discovery = this.step('盘点工作区文件', 'file.list', { path: '.', recursive: true });
      const classify = this.step('按类型统计', 'file.classify', { path: '.' }, [discovery.id]);
      const report = this.step(
        '输出整理报告',
        'file.write',
        { path: 'organize-report.md', content: this.reportTemplate(userRequest) },
        [classify.id]
      );
      steps.push(discovery, classify, report);
    } else if (wantsList) {
      // 只想看一眼目录就别顺手写报告文件
      const dir = this.guessDir(userRequest);
      steps.push(this.step(
        `列出 ${dir === '.' ? '工作区根目录' : dir} 的内容`,
        'file.list',
        { path: dir, recursive: /递归|所有子目录|整个工作区/.test(text) }
      ));
    } else if (wantsSummary) {
      const read = this.step('读取目标文件', 'file.read', { path: this.guessPath(userRequest) });
      const summary = this.step('生成摘要', 'ai.summarize', { path: this.guessPath(userRequest), maxLength: 400 }, [read.id]);
      steps.push(read, summary);
    } else if (wantsReport) {
      const mkdir = this.step('准备输出目录', 'file.mkdir', { path: 'reports' });
      const write = this.step(
        '写入报告文件',
        'file.write',
        { path: 'reports/report.md', content: this.reportTemplate(userRequest, 'report') },
        [mkdir.id]
      );
      steps.push(mkdir, write);
    } else if (wantsWeb) {
      // 本地规则只做「打开 + 读」两步，要不要接着点由模型规划
      const open = this.step('在内置浏览器打开网页', 'browser.open', { url: this.guessUrl(userRequest) });
      const read = this.step('读取页面内容', 'browser.read', { maxLength: 3000 }, [open.id]);
      steps.push(open, read);
    } else {
      // 猜不出意图时不要顺手去列目录，问一句比做错一步有用
      steps.push(this.step('请用户补充目标', 'ai.answer', {
        text: `我还不确定「${userRequest.slice(0, 40)}」要我具体做什么。说一下要操作哪个文件或目录（比如「列出 src 目录」「总结 README.md」），我就拆成步骤执行。`
      }));
    }

    return {
      taskId: `task_${Date.now()}_${this.rand()}`,
      steps,
      status: 'pending',
      createdAt: new Date()
    };
  }

  private step(
    name: string,
    action: string,
    params: Record<string, any>,
    dependsOn?: string[]
  ): TaskStep {
    return { id: `step_${Date.now()}_${this.rand()}`, name, action, params, dependsOn };
  }

  private reportTemplate(request: string, kind: 'organize' | 'report' = 'organize'): string {
    if (kind === 'report') {
      return [
        '# 工作报告',
        '',
        `> 由 Woder 自动生成于 ${new Date().toLocaleString()}`,
        '',
        '## 原始需求',
        '',
        request,
        '',
        '## 本期进展',
        '',
        '- （待补充）',
        '',
        '## 下期计划',
        '',
        '- （待补充）',
        '',
        '## 风险与需要的支持',
        '',
        '- （待补充）',
        ''
      ].join('\n');
    }

    return [
      '# 工作区整理报告',
      '',
      `> 由 Woder 自动生成于 ${new Date().toLocaleString()}`,
      '',
      '## 原始需求',
      '',
      request,
      '',
      '## 文件分布',
      '',
      '按扩展名统计的结果见上一步输出。',
      '',
      '## 后续建议',
      '',
      '- 将临时文件移入 tmp/ 目录',
      '- 为文档类文件建立 docs/ 索引',
      ''
    ].join('\n');
  }

  private looksConversational(text: string): boolean {
    // 只认明确的打招呼/问能力说法。「整理工作区文件」也只有 7 个字，不能按长度一刀切
    return /你好|您好|哈喽|嗨|hello|hi\b|早上好|下午好|晚上好|在吗|在不在|谢谢|辛苦|你是谁|你叫什么|做什么|干什么|能干嘛|会什么|有什么功能|怎么用|如何使用|help|测试一下|再试试?一次/.test(text);
  }

  private introText(): string {
    return [
      '我在，可以直接说要做的事。我擅长这几类活：',
      '· 看文件：列出目录、读某个文件（例：列出 src 目录）',
      '· 改文件：新建、追加、改名、删除（例：新建 notes/todo.md 写三条待办）',
      '· 整理归类：按扩展名统计并出报告（例：整理工作区文件，生成分类报告）',
      '· 总结内容：（例：总结 README.md）',
      '· 网页：在右侧内置浏览器里打开网址、读页面内容、点按钮填表单（例：打开 https://example.com 看看讲了什么）',
      '· 跑命令：在工作区里执行一条终端命令（例：运行 `git status`）',
      '说清楚目标或路径，我会先给出执行计划，再一步步做。'
    ].join('\n');
  }

  private guessDir(request: string): string {
    const withSlash = request.match(/([\w\-.]+\/)+/);
    if (withSlash) return withSlash[0].replace(/\/+$/, '');
    const named = ['src', 'dist', 'docs', 'assets', 'reports', 'node_modules'];
    const hit = named.find(d => new RegExp(`(^|[\\s/])${d}([\\s/]|$)`, 'i').test(request));
    return hit ?? '.';
  }

  private guessPath(request: string): string {
    const match = request.match(/[\w\-./]+\.[a-zA-Z]{1,6}/);
    return match ? match[0] : 'README.md';
  }

  private guessUrl(request: string): string {
    const match = request.match(/https?:\/\/[^\s，。]+/);
    return match ? match[0] : 'https://example.com';
  }

  /**
   * 从需求里挑出一条真正可跑的命令：优先引号/反引号里的内容，
   * 其次整句去掉「帮我运行」这类前缀后确实以常见命令开头的，就当它是命令。
   * 认不出来返回空串，让上层去问用户，绝不自己编一条 shell。
   */
  private guessCommand(request: string): string {
    const text = String(request ?? '').trim();
    const candidates: string[] = [];
    const quoted = text.match(/[`'“”]([^`'”“\n]{2,200})[`'”“]/);
    if (quoted) candidates.push(quoted[1].trim());
    candidates.push(text
      .replace(/^(请|帮我|麻烦|你)?\s*(在终端|用终端|终端里|命令行里)?\s*(运行|执行|跑|run|exec)\s*(一下|下|命令|指令|个)?\s*[：:，,]?\s*/, '')
      .replace(/[。！!]$/, '')
      .trim());
    return candidates.find(c => this.looksLikeCommand(c)) ?? '';
  }

  /** 只认「以一个常见命令名开头」的串，避免把引号里的路径、标题当命令跑 */
  private looksLikeCommand(cmd: string): boolean {
    return /^[\w~./-]+(\s|$)/.test(cmd) &&
      /^(npm|pnpm|yarn|bun|npx|git|ls|pwd|cd|cat|grep|find|head|tail|wc|du|df|echo|touch|mkdir|mv|cp|rm|node|python|python3|tsc|make|cargo|docker|brew|open|curl|wget|date|whoami|uname)\b/.test(cmd);
  }

  private rand(): string {
    return Math.random().toString(36).slice(2, 11);
  }
}
