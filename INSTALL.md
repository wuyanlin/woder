# Woder 安装指南

## 📦 方法一：完整安装（推荐）

### 1. 确保 Node.js 已安装

```bash
node --version
npm --version
```

如果未安装，请访问 https://nodejs.org 下载并安装 LTS 版本。

### 2. 安装项目依赖

由于 Electron 包较大（约 200MB），建议使用国内镜像源加速：

```bash
cd /Users/wuxs/code/woder

# 使用淘宝镜像源
npm config set registry https://registry.npmmirror.com

# 安装依赖（可能需要几分钟）
npm install --legacy-peer-deps
```

**注意**: 如果遇到网络问题，可以：
- 检查网络连接
- 尝试使用手机热点
- 在晚上或凌晨网络较少时安装

### 3. 验证安装

```bash
ls node_modules | grep electron
# 应该看到 electron 相关目录
```

### 4. 配置 OpenAI API

启动应用前，请先配置 API Key：

**方式 A: UI 界面配置（推荐）**
1. 启动应用后点击右上角 "⚙️ AI 配置"
2. 输入你的 OpenAI API Key
3. 选择模型（推荐 GPT-4o）

**方式 B: 环境变量配置**
```bash
cp .env.example .env
nano .env
# 填入你的 API Key
```

### 5. 运行开发模式

```bash
npm run dev
```

应用会在默认浏览器中打开。

---

## 🚀 方法二：跳过依赖直接运行（快速测试）

如果你想快速查看界面效果，可以先暂时移除对 openai 和 electron 的依赖：

### 1. 修改 package.json

将 `package.json` 改为：

```json
{
  "name": "woder",
  "version": "1.0.0",
  "description": "AI-driven intelligent work assistant desktop application",
  "main": "src/main/main.js",
  "scripts": {
    "dev": "electron .",
    "build": "tsc && electron-builder",
    "start": "electron ."
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.4.0",
    "electron-store": "^8.1.0"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.9.0",
    "typescript": "^5.3.0"
  }
}
```

### 2. 安装基础依赖

```bash
npm install --legacy-peer-deps
```

### 3. 运行应用

```bash
npm run dev
```

这样会启动一个基础版本的应用（没有 AI 功能），但可以看到 UI 界面。

---

## 🔧 常见问题解决

### Q: npm install 一直超时怎么办？

A: 
1. 使用国内镜像源：
   ```bash
   npm config set registry https://registry.npmmirror.com
   ```

2. 增加超时时间：
   ```bash
   npm config set fetch-timeout 300000
   ```

3. 清理缓存重试：
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

### Q: 安装成功后运行报错？

A: 确保 TypeScript 已编译：
```bash
npx tsc
```

然后运行：
```bash
npm run dev
```

### Q: macOS 提示无法打开应用？

A: 需要在系统偏好设置中允许：
- 系统偏好设置 → 安全性与隐私 → 通用
- 点击"仍要打开"

---

## 📝 手动下载 Electron（备选方案）

如果 npm 下载失败，可以：

1. 访问 https://github.com/electron/electron/releases
2. 下载对应平台的版本
3. 解压到 `node_modules/electron` 目录

---

## ✅ 验证清单

安装完成后，检查以下项目：

- [ ] `node_modules` 目录存在
- [ ] `electron` 在依赖列表中
- [ ] `openai` 在依赖列表中
- [ ] `.env` 文件包含 API Key（可选）
- [ ] 能成功运行 `npm run dev`

---

**提示**: 首次安装需要下载较大的依赖包，请耐心等待。后续的运行速度会很快！
