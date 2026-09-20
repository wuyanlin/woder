# Woder - AI 智能工作助手桌面应用

基于 Qodercn 和 Traework 理念构建的 AI 驱动的智能工作助手。

## 🎯 核心功能

- **🤖 AI 智能规划**: 使用 OpenAI GPT-4 理解自然语言需求并生成任务计划
- **📁 文件处理**: 读写、转换、组织各类文档（Office、PDF、图片等）
- **🌐 浏览器自动化**: Web 导航、表单填充、数据抓取
- **🧠 记忆系统**: 跨会话学习和用户偏好管理
- **⚡ 任务规划**: 复杂需求拆解为可执行步骤
- **🔌 技能扩展**: 可扩展的插件机制

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 OpenAI API

有两种方式配置 API Key:

**方式一：通过 UI 界面配置（推荐）**
- 启动应用后点击右上角 "⚙️ AI 配置" 按钮
- 输入你的 OpenAI API Key
- 选择模型（推荐 GPT-4o）

**方式二：环境变量配置**
```bash
# 创建 .env 文件
cp .env.example .env

# 编辑 .env 文件，填入你的 API Key
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4o
```

> 💡 获取 API Key: [OpenAI Dashboard](https://platform.openai.com/api-keys)

### 3. 运行开发模式

```bash
npm run dev
```

### 4. 打包发布

```bash
npm run build
```

## 💡 使用示例

### 1. 整理文件

在输入框中输入："帮我整理项目文件"

系统会自动：
- ✅ 扫描目录中的所有文件
- ✅ 按文件类型分类
- ✅ 建议重新组织结构

**AI 会识别意图并生成多步骤计划**

### 2. 浏览器自动化

在输入框中输入："从网页提取价格信息"

系统会：
- ✅ 导航到指定 URL
- ✅ 点击目标元素
- ✅ 填写表单数据
- ✅ 提取页面内容

### 3. 数据分析

在输入框中输入："分析销售数据并生成报告"

系统会：
- ✅ 读取数据文件
- ✅ 执行统计分析
- ✅ 生成可视化图表
- ✅ 创建总结报告

### 4. 保存偏好设置

系统会自动学习你的工作习惯，例如：
- 常用的文件路径
- 偏好的操作方式
- 最近访问的文件

## 🔧 技术栈

| 技术 | 说明 |
|------|------|
| **Electron** | 桌面应用框架 |
| **TypeScript** | 类型安全的 JavaScript |
| **OpenAI SDK** | GPT-4 集成 |
| **MCP (Model Context Protocol)** | 标准化的工具调用协议 |
| **electron-store** | 本地数据存储 |

## 📁 项目结构

```
woder/
├── src/
│   ├── main/               # Electron 主进程
│   │   └── main.ts         # 主入口 + IPC 通信
│   ├── core/               # 核心引擎
│   │   ├── planner.ts      # 基础任务规划器
│   │   ├── memory.ts       # 记忆管理器
│   │   └── ai-engine.ts    # OpenAI 集成引擎 ⭐新增
│   ├── skills/             # 技能模块
│   │   ├── file-skill.ts        # 文件处理技能
│   │   └── browser-skill.ts     # 浏览器自动化技能
│   ├── renderer/           # 渲染进程（UI）
│   │   └── index.html      # 主界面（含 AI 配置弹窗）
│   └── preload.js          # IPC 通信桥梁
├── package.json            # 项目配置（已添加 openai 依赖）
├── tsconfig.json           # TypeScript 配置
├── .env.example            # 环境变量模板 ⭐新增
└── README.md               # 使用说明
```

## 🆕 OpenAI 集成特性

### 智能任务规划

```typescript
// AI 引擎会自动解析自然语言请求
const plan = await aiEngine.enhanceTaskPlan("帮我整理项目文件");

// 返回增强的任务计划
{
  taskId: "task_1234567890_abc123",
  steps: [
    {
      id: "step_1234567890_xyz789",
      name: "Discover Files",
      action: "file.discover",
      params: { path: "./project", recursive: true }
    },
    {
      id: "step_1234567890_def456",
      name: "Classify by Type",
      action: "file.classify",
      params: { criteria: "extension" },
      dependsOn: ["step_1234567890_xyz789"]
    }
  ],
  status: "pending",
  createdAt: "2024-01-01T00:00:00.000Z"
}
```

### 支持的 OpenAI 模型

- `gpt-4o` - 推荐，最智能
- `gpt-4o-mini` - 快速且经济
- `gpt-4-turbo` - 高精度
- `gpt-4` - 经典版本
- `gpt-3.5-turbo` - 轻量级

### 降级策略

如果 OpenAI API 不可用，系统会自动降级到基础规则引擎，确保基本功能可用。

## 🛠️ 扩展开发

### 添加新技能

在 `src/skills/` 目录下创建新的技能文件：

```typescript
export class MyCustomSkill {
  async execute(params: any): Promise<Result> {
    // 实现你的自定义逻辑
  }
}
```

然后在 `main.ts` 中注册 IPC 处理器。

### 使用 AI 增强技能

```typescript
const summary = await aiEngine.summarizeText(longText, 500);
const response = await aiEngine.getChatCompletion(messages);
```

## 📝 License

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 🔗 相关链接

- [OpenAI 文档](https://platform.openai.com/docs)
- [Electron 文档](https://www.electronjs.org/docs)
- [Qodercn 官方文档](https://docs.qoder.cn)
- [Traework 介绍](https://www.yjpoo.com/site/7384.html)

---

**提示**: 这是一个完整的 AI 驱动桌面应用框架，集成了 OpenAI GPT-4 进行智能任务规划和执行。你可以根据需要扩展更多技能和功能！
