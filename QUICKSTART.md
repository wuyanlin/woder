# Woder 快速启动指南 🚀

## 5 分钟快速上手

### 第一步：安装依赖

```bash
cd /Users/wuxs/code/woder
npm install
```

### 第二步：配置 OpenAI API

#### 方式 A: UI 界面配置（推荐新手）

1. **启动应用**
   ```bash
   npm run dev
   ```

2. **点击 "⚙️ AI 配置" 按钮**
   - 位于右上角
   
3. **输入你的 API Key**
   - 从 [OpenAI Dashboard](https://platform.openai.com/api-keys) 获取
   - 选择模型（推荐 `GPT-4o`）
   
4. **保存并测试**

#### 方式 B: 环境变量配置（适合开发者）

```bash
# 复制模板文件
cp .env.example .env

# 编辑 .env 文件
nano .env
```

填入：
```env
OPENAI_API_KEY=sk-your-actual-api-key-here
OPENAI_MODEL=gpt-4o
```

### 第三步：开始使用

在输入框中输入以下示例：

#### 示例 1: 整理文件
```
帮我整理项目文件，按类型分类
```

#### 示例 2: 浏览器自动化
```
从网页提取价格信息
```

#### 示例 3: 数据分析
```
分析销售数据并生成报告
```

---

## 🎯 功能演示

### 1. 智能任务规划

**输入**: "帮我整理项目文件"

**AI 生成的计划**:
```json
{
  "taskId": "task_1726689600000_abc123",
  "steps": [
    {
      "id": "step_1726689600001_xyz789",
      "name": "Discover Files",
      "action": "file.discover",
      "params": {"path": "./project", "recursive": true}
    },
    {
      "id": "step_1726689600002_def456",
      "name": "Classify by Type",
      "action": "file.classify",
      "params": {"criteria": "extension"},
      "dependsOn": ["step_1726689600001_xyz789"]
    }
  ],
  "status": "pending",
  "createdAt": "2024-01-01T12:00:00.000Z"
}
```

**UI 显示**:
- ✅ 任务已规划 (AI Powered)
- 📋 执行步骤列表
- 🕐 创建时间

### 2. 降级策略

如果 OpenAI API 不可用，系统会自动切换到基础规则引擎：

**输入**: "整理文件"

**基础计划**:
```json
{
  "taskId": "task_1726689600003_ghi789",
  "steps": [
    {
      "id": "step_1726689600004_jkl012",
      "name": "Discover Files",
      "action": "file.discover",
      "params": {"path": "./", "recursive": true}
    }
  ],
  "status": "pending"
}
```

---

## 🛠️ 开发环境设置

### 安装 Node.js (如果未安装)

```bash
# macOS
brew install node@18

# 验证安装
node --version
npm --version
```

### 安装项目依赖

```bash
cd /Users/wuxs/code/woder
npm install
```

这会安装：
- Electron (桌面框架)
- TypeScript (类型系统)
- OpenAI SDK (AI 集成)
- electron-store (数据存储)

### 运行开发模式

```bash
npm run dev
```

应用会在默认浏览器中打开。

### 打包为桌面应用

```bash
npm run build
```

生成的安装包位于 `dist/` 目录。

---

## 📝 常见问题

### Q: 如何获取 OpenAI API Key？

A: 
1. 访问 https://platform.openai.com/account/api-keys
2. 点击 "Create new secret key"
3. 复制 Key 并妥善保存（只显示一次）

### Q: 推荐使用哪个模型？

A:
- **GPT-4o**: 最智能，推荐用于复杂任务
- **GPT-4o-mini**: 快速且经济，适合简单任务
- **GPT-3.5-turbo**: 轻量级，成本最低

### Q: API Key 会保存在哪里？

A: 
- UI 配置：仅保存在内存中，不持久化
- 环境变量：保存在 `.env` 文件中

### Q: 可以离线使用吗？

A: 
- 基础功能（文件操作、浏览器控制）可以离线使用
- AI 增强功能需要联网

### Q: 支持哪些操作系统？

A:
- ✅ macOS (Intel & Apple Silicon)
- ✅ Windows 10+
- ✅ Linux (Ubuntu 18.04+)

---

## 🔧 调试技巧

### 查看主进程日志

在开发模式下，打开开发者工具：
- 菜单 → View → Developer Tools
- Console 标签页

### 检查 IPC 通信

```javascript
// 在控制台测试
window.electronAPI.ai.isConfigured()
window.electronAPI.planner.planTask("测试任务")
```

### 查看存储的数据

```typescript
// MemoryManager 使用 electron-store
// 数据位置：~/Library/Application Support/woder/user-memory.json
```

---

## 📚 下一步学习

1. **阅读完整文档**
   - [README.md](./README.md) - 完整说明
   - [ARCHITECTURE.md](./ARCHITECTURE.md) - 架构设计

2. **扩展技能**
   - 添加新的技能模块
   - 集成更多 MCP 服务器

3. **定制 UI**
   - 修改 `src/renderer/index.html`
   - 添加主题样式

---

## 💡 提示

- ✨ 首次使用时建议先用简单任务测试
- 🎯 AI Powered 标识表示使用了 GPT-4 智能规划
- 🔄 失败时自动降级到基础模式
- 📊 查看 Console 了解详细日志

---

**祝你使用愉快！** 🎉

如有问题，欢迎提交 Issue 或 Pull Request。
