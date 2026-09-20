# Woder 架构设计文档

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        渲染进程 (Renderer)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    UI 界面层                           │   │
│  │  - 任务输入框                                          │   │
│  │  - 结果展示区                                          │   │
│  │  - AI 配置弹窗                                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                            ↓                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   IPC 通信层                          │   │
│  │  - electronAPI.planner                               │   │
│  │  - electronAPI.ai                                    │   │
│  │  - electronAPI.file                                  │   │
│  │  - electronAPI.browser                               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↕ IPC
┌─────────────────────────────────────────────────────────────┐
│                      主进程 (Main)                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  IPC 处理器                            │   │
│  │  - ai:set-config, ai:is-configured                   │   │
│  │  - ai:enhance-plan, ai:summarize                     │   │
│  │  - planner:plan-task                                 │   │
│  │  - file:read, file:write, file:list                  │   │
│  │  - browser:navigate, browser:extract                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                            ↓                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  核心引擎层                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │   │
│  │  │   Planner    │  │   Memory     │  │  AI      │  │   │
│  │  │  (基础规划)  │  │   Manager    │  │ Engine   │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────┘  │   │
│  │         ↓                                   ↑        │   │
│  │  ┌─────────────────────────────────────────────┐  │   │
│  │  │       OpenAI API Integration                │  │   │
│  │  │       - GPT-4o / GPT-4 Turbo               │  │   │
│  │  │       - 自然语言理解                       │  │   │
│  │  │       - 任务拆解与优化                     │  │   │
│  │  └─────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                            ↓                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   技能层 (Skills)                     │   │
│  │  ┌──────────────┐  ┌──────────────┐                 │   │
│  │  │   FileSkill  │  │ BrowserSkill │                 │   │
│  │  │  - 文件读写  │  │  - Web 导航   │                 │   │
│  │  │  - 目录列表  │  │  - 表单填充  │                 │   │
│  │  │  - 文件分类  │  │  - 数据提取  │                 │   │
│  │  │  - 移动删除  │  │              │                 │   │
│  │  └──────────────┘  └──────────────┘                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 工作流程

### 1. 用户请求处理流程

```
用户输入 → UI 层 → IPC 调用 → Planner → AI Engine → 返回计划 → 展示结果
   ↓
[自然语言]    [preload]  [main.ts]  [planner] [ai-engine]  [IPC]   [HTML]
```

### 2. AI 增强规划流程

```
用户请求 → AI Engine → System Prompt + User Request → OpenAI API 
                                              ↓
                                       LLM 解析与推理
                                              ↓
                                        JSON 格式响应 → 验证与执行
                                              ↓
                                        降级策略（失败时）
```

### 3. 记忆学习流程

```
用户操作 → MemoryManager → 保存偏好 → electron-store 
                          ↓
                    行为模式识别 → 学习频率更新
```

## 📦 模块详解

### Core 核心模块

#### 1. Planner (任务规划器)
**职责**: 将复杂需求拆解为可执行步骤序列
**关键方法**:
- `planTask(userRequest)`: 生成任务计划
- `createFileDiscoveryStep()`: 文件发现步骤
- `createClassificationStep()`: 分类步骤
- `createReorganizationStep()`: 重组步骤

**数据结构**:
```typescript
interface TaskPlan {
  taskId: string;           // 唯一任务 ID
  steps: TaskStep[];        // 执行步骤数组
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;          // 创建时间
}

interface TaskStep {
  id: string;               // 步骤 ID
  name: string;             // 步骤名称
  action: string;           // 动作类型
  params: Record<string, any>; // 参数
  dependsOn?: string[];     // 依赖的步骤 ID
}
```

#### 2. MemoryManager (记忆管理器)
**职责**: 持久化用户偏好和工作上下文
**关键方法**:
- `savePreference(key, value)`: 保存用户偏好
- `getContext()`: 获取工作上下文
- `addRecentFile(filePath)`: 添加最近访问文件
- `learnBehavior(pattern, frequency)`: 学习行为模式

**存储内容**:
- 用户偏好设置
- 当前项目信息
- 最近访问的 20 个文件
- 活跃的技能列表
- 行为模式统计

#### 3. AIEngine (AI 引擎) ⭐新增
**职责**: 集成 OpenAI API 进行智能理解和任务规划
**关键方法**:
- `setConfig(config)`: 设置 API 配置
- `enhanceTaskPlan(userRequest)`: AI 增强的任务规划
- `summarizeText(text)`: 文本总结
- `getChatCompletion(messages)`: 对话完成

**配置选项**:
```typescript
interface AIConfig {
  apiKey: string;           // OpenAI API Key
  model: string;            // 模型选择
  temperature?: number;     // 创造性 (0-2)
  maxTokens?: number;       // 最大输出长度
}
```

**System Prompt 设计**:
- 定义助手角色和能力范围
- 指定支持的任务类型
- 规定输出格式（JSON Schema）
- 融入用户上下文信息

### Skills 技能模块

#### 1. FileSkill (文件处理)
**授权机制**: 路径白名单控制
**核心功能**:
- 文件读取/写入
- 目录遍历（递归/非递归）
- 按扩展名分类
- 文件移动/重命名
- 文件删除
- 目录创建

**安全性**: 所有操作前检查路径授权

#### 2. BrowserSkill (浏览器自动化)
**状态管理**: 维护当前 URL
**核心功能**:
- 页面导航
- 元素点击
- 表单填写
- 数据提取
- 截图保存

**MCP 集成**: 预留 MCP browser-use 工具调用接口

## 🔌 IPC 通信协议

### 主进程 → 渲染进程

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `planner:plan-task` | userRequest: string | {success, data, useAI} | 任务规划 |
| `ai:set-config` | config | {success, message} | 设置 AI 配置 |
| `ai:is-configured` | - | {configured: boolean} | 检查配置状态 |
| `ai:enhance-plan` | userRequest | {success, data} | AI 增强规划 |
| `ai:summarize` | text, maxLength | {success, data} | 文本总结 |
| `file:read` | filePath | {success, message, data} | 读取文件 |
| `file:write` | filePath, content | {success, message} | 写入文件 |
| `file:list` | dirPath, recursive | {success, message, data} | 列出目录 |
| `file:classify` | dirPath | {success, message, data} | 分类文件 |
| `memory:get-context` | - | {success, data} | 获取上下文 |

## 🎯 设计模式

### 1. 策略模式 (Strategy Pattern)
```typescript
// Planner 作为策略，可以被 AIEngine 替换或增强
const plan = await aiEngine.enhanceTaskPlan(request);
// 失败时自动降级到基础 Planner
if (!plan) plan = await planner.planTask(request);
```

### 2. 单例模式 (Singleton Pattern)
```typescript
// 核心组件全局单例
const planner = new Planner();
const memoryManager = new MemoryManager();
const aiEngine = new AIEngine(config, memoryManager);
```

### 3. 适配器模式 (Adapter Pattern)
```typescript
// IPC 层适配主进程和渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  planner: { planTask },
  ai: { setConfig, isConfigured }
});
```

## 🔒 安全设计

### 1. 路径授权
```typescript
class FileSkill {
  private authorizedPaths: Set<string>;
  
  authorizePath(path: string): void {
    this.authorizedPaths.add(path);
  }
  
  isAuthorized(filePath: string): boolean {
    // 检查文件是否在授权范围内
  }
}
```

### 2. API Key 保护
- UI 输入采用 password 类型
- 不保存到本地磁盘
- 仅内存中持有

### 3. CSP 策略
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; script-src 'self'">
```

## 📈 扩展性设计

### 添加新技能
1. 在 `src/skills/` 创建新类
2. 实现标准接口
3. 在 `main.ts` 注册 IPC 处理器
4. 在 `preload.js` 暴露给渲染进程

### 添加新 AI 模型
1. 在 `package.json` 添加依赖
2. 在 `ai-engine.ts` 实现适配器
3. 在 UI 中添加模型选择

### 添加新 MCP 服务器
1. 安装 MCP SDK
2. 配置服务器连接
3. 注册工具映射

## 🚀 性能优化

### 1. 缓存策略
- MemoryManager 使用 electron-store 缓存
- 避免重复 API 调用

### 2. 异步处理
- 所有 I/O 操作异步
- 使用 Promise 链式调用

### 3. 懒加载
- 按需加载技能模块
- 延迟初始化 AI 引擎

---

**版本**: v1.0.0  
**最后更新**: 2026-09-18
