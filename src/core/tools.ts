/**
 * 工具清单：一份定义同时喂给模型（function schema）和执行器（action 分发）。
 * 之前动作说明手写在 ai-engine 的提示词里，执行器改了提示词不会跟着改，
 * 模型就会调出一个跑不动的动作；这里让两边只能引用同一个来源。
 */

export interface ToolParam {
  type: 'string' | 'number' | 'boolean' | 'integer' | 'array';
  description: string;
  /** array 的元素类型 */
  items?: 'string';
  enum?: string[];
}

export interface ToolSpec {
  /** 执行器里的 action 名，也是界面步骤行上的类型 */
  action: string;
  /** 发给模型的函数名：OpenAI 只接受 [a-zA-Z0-9_-]，所以点号换成下划线 */
  fn: string;
  /** 给模型看的一句话说明，越具体越少瞎调 */
  desc: string;
  params: Record<string, ToolParam>;
  required?: string[];
  /** 会改动工作区或外部状态：关掉自动放行时，这一步要先经用户同意 */
  mutating?: boolean;
  /** 是否作为工具开放给模型。ai.summarize 这类只在本地规则计划里出现，
   *  agentic 循环里模型自己就会写总结，没必要再套一次模型调用 */
  offered?: boolean;
}

const PATH = (description: string): ToolParam => ({ type: 'string', description });

export const TOOLS: ToolSpec[] = [
  {
    action: 'ai.answer',
    fn: 'ai_answer',
    desc: '把一句话直接回复给用户，不读写任何文件。',
    params: { text: { type: 'string', description: '要回复给用户的完整中文' } },
    required: ['text'],
    // agentic 循环里模型说完话这一轮就结束了，不需要再套一个「说话」工具
    offered: false
  },
  {
    action: 'ask.user',
    fn: 'ask_user',
    desc: '向用户提一个选择题并等他的回答。需求含糊、要改哪个文件没说清、要删的东西没点名时用；答案会作为本步输出回到你的上下文。',
    params: {
      question: { type: 'string', description: '一句话中文问题' },
      options: { type: 'array', items: 'string', description: '2-4 个候选答案，每项写成 "标签|说明选它会怎样"，可省说明' }
    },
    required: ['question']
  },
  {
    action: 'file.list',
    fn: 'file_list',
    desc: '列出某个目录下的条目。recursive 为 true 时列整棵子树（结果条数有上限）。',
    params: {
      path: PATH('相对工作区根目录的路径，默认 "."'),
      recursive: { type: 'boolean', description: '是否递归子目录' }
    }
  },
  {
    action: 'file.grep',
    fn: 'file_grep',
    desc: '在工作区文件内容里递归搜一段文本，返回「文件:行号: 内容」。找某个函数/字符串定义在哪时用。',
    params: {
      pattern: { type: 'string', description: '要搜的文本或正则（按 JS RegExp 解析，非法时退化成普通文本匹配）' },
      path: PATH('限定在某个子目录下搜，默认 "."'),
      glob: { type: 'string', description: '只搜匹配这个名字的文件，例如 *.ts' },
      ignoreCase: { type: 'boolean', description: '忽略大小写' },
      maxMatches: { type: 'integer', description: '最多返回多少条命中，默认 60，上限 300' }
    },
    required: ['pattern']
  },
  {
    action: 'file.read',
    fn: 'file_read',
    desc: '读取文本文件内容。文件很大时用 from/to 按行号取一段，别一次读全。',
    params: {
      path: PATH('相对路径'),
      from: { type: 'integer', description: '起始行号，从 1 开始' },
      to: { type: 'integer', description: '结束行号，含该行' }
    },
    required: ['path']
  },
  {
    action: 'file.write',
    fn: 'file_write',
    desc: '写入或覆盖整个文件。content 必须是完整可落盘的内容，不要用占位符或省略号。',
    params: {
      path: PATH('相对路径'),
      content: { type: 'string', description: '文件完整内容' }
    },
    required: ['path', 'content'],
    mutating: true
  },
  {
    action: 'file.append',
    fn: 'file_append',
    desc: '往文件末尾追加内容，文件不存在时创建。',
    params: {
      path: PATH('相对路径'),
      content: { type: 'string', description: '要追加的内容' }
    },
    required: ['path', 'content'],
    mutating: true
  },
  {
    action: 'file.mkdir',
    fn: 'file_mkdir',
    desc: '创建目录（含缺失的父级）。',
    params: { path: PATH('相对路径') },
    required: ['path'],
    mutating: true
  },
  {
    action: 'file.move',
    fn: 'file_move',
    desc: '移动或重命名文件/目录。',
    params: {
      from: PATH('原相对路径'),
      to: PATH('目标相对路径')
    },
    required: ['from', 'to'],
    mutating: true
  },
  {
    action: 'file.delete',
    fn: 'file_delete',
    desc: '删除一个文件或空目录。删之前必须已经用 file.read / file.list 确认过目标就是用户要的。',
    params: { path: PATH('相对路径') },
    required: ['path'],
    mutating: true
  },
  {
    action: 'file.classify',
    fn: 'file_classify',
    desc: '统计一个目录里各扩展名的文件数量，做「整理/盘点」类需求时用。',
    params: { path: PATH('相对路径，默认 "."') }
  },
  {
    action: 'ai.summarize',
    fn: 'ai_summarize',
    desc: '用模型总结一段文本或一个文件。',
    params: {
      path: PATH('要总结的文件相对路径'),
      text: { type: 'string', description: '直接给要总结的文本' },
      maxLength: { type: 'integer', description: '摘要字数上限' }
    },
    offered: false
  },
  {
    action: 'shell.run',
    fn: 'shell_run',
    desc: '在工作区里执行一条终端命令，返回头尾截断的输出和退出码。找文件、看目录结构就走这里：按当前系统用 find / ls（macOS、Linux）或 dir /s /b（Windows）。纯查询的命令不会弹确认，会改动东西的才要用户放行；绝不跑 rm -rf 这类破坏性命令。',
    params: {
      command: { type: 'string', description: '原样可执行的命令，不要包 sudo' },
      cwd: PATH('执行目录，相对路径，默认工作区根'),
      timeoutMs: { type: 'integer', description: '超时毫秒，默认 30000，最长 120000' }
    },
    required: ['command'],
    // 默认按改动类对待；只读查询命令由 isMutating 里的白名单放行
    mutating: true
  },
  {
    action: 'browser.open',
    fn: 'browser_open',
    desc: '在右侧内置浏览器里打开一个网址。',
    params: {
      url: { type: 'string', description: '完整 http(s) 地址' },
      background: { type: 'boolean', description: '后台打开，不抢当前页签' }
    },
    required: ['url']
  },
  {
    action: 'browser.read',
    fn: 'browser_read',
    desc: '读当前页面：标题、正文、带序号的可点击元素清单。点过、跳转过之后要重新 read 拿新序号。',
    params: { maxLength: { type: 'integer', description: '正文最多取多少字，默认 3000' } }
  },
  {
    action: 'browser.click',
    fn: 'browser_click',
    desc: '点击页面元素，优先用上一次 browser.read 返回的 index。',
    params: {
      index: { type: 'integer', description: 'read 清单里的序号' },
      selector: { type: 'string', description: 'CSS 选择器' },
      text: { type: 'string', description: '按可见文字找元素' }
    }
  },
  {
    action: 'browser.type',
    fn: 'browser_type',
    desc: '往页面输入框填内容，submit 为 true 时顺便回车。',
    params: {
      text: { type: 'string', description: '要输入的内容' },
      index: { type: 'integer', description: 'read 清单里的序号' },
      selector: { type: 'string', description: 'CSS 选择器' },
      submit: { type: 'boolean', description: '输入完回车' }
    },
    required: ['text']
  },
  {
    action: 'browser.extract',
    fn: 'browser_extract',
    desc: '按 CSS 选择器从当前页面抓文本列表。',
    params: {
      selectors: { type: 'array', items: 'string', description: '一组 CSS 选择器' }
    },
    required: ['selectors']
  },
  {
    action: 'browser.screenshot',
    fn: 'browser_screenshot',
    desc: '截取内置浏览器当前页面，存到工作区 screenshots/ 下，返回相对路径。',
    params: { path: PATH('文件名，可省，默认带时间戳') }
  },
  {
    action: 'browser.close',
    fn: 'browser_close',
    desc: '关闭内置浏览器所有标签页。',
    params: {}
  },
  {
    action: 'wait',
    fn: 'wait',
    desc: '等一会儿再继续，网页操作后用一次让页面稳定下来。',
    params: { ms: { type: 'integer', description: '等待毫秒，最多 3000' } },
    required: ['ms']
  }
];

/** 开放给模型的工具：agentic 循环里能被调用的那部分 */
export function offeredTools(): ToolSpec[] {
  return TOOLS.filter(t => t.offered !== false);
}

/**
 * 发给模型的工具定义。JSON Schema 里 enum 只允许出现在 type 为 string 的参数上，
 * 这里就地把 enum 收紧成 string，省得每个调用方再判一次。
 */
export function openaiTools(): Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }> {
  return offeredTools().map(t => ({
    type: 'function' as const,
    function: {
      name: t.fn,
      description: t.desc,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(Object.entries(t.params).map(([k, v]) => [k, {
          type: v.enum ? 'string' : v.type,
          description: v.description,
          ...(v.enum ? { enum: v.enum } : {}),
          ...(v.type === 'array' ? { items: { type: v.items ?? 'string' } } : {})
        }])),
        ...(t.required?.length ? { required: t.required } : {})
      }
    }
  }));
}

export function byFn(fn: string): ToolSpec | undefined {
  return TOOLS.find(t => t.fn === fn);
}

export function byAction(action: string): ToolSpec | undefined {
  return TOOLS.find(t => t.action === action);
}

/**
 * 只读命令白名单：这些跑完不落盘，shell_run 里的查询步就不必弹确认卡。
 * 名单外的一律按改动类处理，宁可多问一句。
 */
const READ_ONLY_CMDS = new Set([
  'find', 'ls', 'dir', 'tree', 'pwd', 'cd', 'cat', 'head', 'tail', 'wc', 'sort', 'uniq',
  'cut', 'tr', 'diff', 'file', 'stat', 'du', 'df', 'which', 'where', 'type', 'echo',
  'grep', 'rg', 'ag', 'fd', 'date', 'uname', 'whoami', 'hostname', 'printenv', 'git'
]);

const GIT_READ_ONLY = new Set([
  'status', 'log', 'diff', 'show', 'ls-files', 'ls-tree', 'blame', 'rev-parse', 'describe', 'shortlog'
]);

/** 名字在名单里、但带上这些参数就开始往文件里写的命令 */
const WRITER_FLAGS: Record<string, RegExp> = {
  find: /^-(delete|exec|execdir|ok|okdir|fprint|fprintf|fls)$/,
  sort: /^(-o|--output)/,
  tree: /^(-o|--out|--chdir)$/
};

/**
 * 这条命令是不是纯查询。重定向、命令替换、后台运行、跨行都可能是把活干到别处去，
 * 见到就直接判为改动类。
 */
export function isReadOnlyShellCommand(command: string): boolean {
  const raw = String(command ?? '');
  const squeezed = raw.replace(/&&|\|\|/g, ';');
  if (!raw.trim() || /[<>`]|\$\(|&|\r|\n/.test(squeezed)) return false;
  return squeezed
    .split(/[|;]/)
    .map(seg => seg.trim().split(/\s+/))
    .every(argv => {
      const cmd = (argv[0] ?? '').toLowerCase().replace(/\.exe$/, '');
      if (!cmd || !READ_ONLY_CMDS.has(cmd)) return false;
      const writer = WRITER_FLAGS[cmd];
      if (writer && argv.some(a => writer.test(a))) return false;
      if (cmd === 'git') return GIT_READ_ONLY.has(argv[1] ?? '');
      return true;
    });
}

/** 这个 action 会不会改动工作区/外部状态。shell_run 要看具体命令，其余照定义 */
export function isMutating(action: string, params: Record<string, any> = {}): boolean {
  if (action === 'shell.run') return !isReadOnlyShellCommand(String(params.command ?? ''));
  return !!byAction(action)?.mutating;
}
