#!/bin/bash

# Woder 开发环境启动脚本

echo "🚀 启动 Woder 开发环境..."
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误：未检测到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org"
    exit 1
fi

echo "✅ Node.js 版本：$(node --version)"
echo ""

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo "⚠️  未检测到 node_modules 目录"
    echo ""
    echo "正在尝试安装依赖..."
    echo ""
    
    # 使用淘宝镜像加速
    npm config set registry https://registry.npmmirror.com
    
    echo "📦 开始安装依赖（这可能需要几分钟）..."
    npm install --legacy-peer-deps
    
    if [ $? -ne 0 ]; then
        echo ""
        echo "❌ 依赖安装失败！"
        echo ""
        echo "可能的原因："
        echo "1. 网络连接不稳定"
        echo "2. Electron 包下载超时（约 200MB）"
        echo ""
        echo "建议解决方案："
        echo "- 查看 INSTALL.md 获取详细安装指南"
        echo "- 尝试在晚上或凌晨网络较少时重试"
        echo "- 使用手机热点试试"
        echo ""
        echo "或者你可以手动安装后再次运行此脚本"
        exit 1
    fi
    
    echo ""
    echo "✅ 依赖安装成功！"
else
    echo "✅ 检测到已安装的依赖"
fi

echo ""
echo "🔧 编译 TypeScript..."
npx tsc

if [ $? -ne 0 ]; then
    echo "❌ TypeScript 编译失败"
    exit 1
fi

echo "✅ TypeScript 编译完成"
echo ""

# 启动应用
echo "🎯 启动应用..."
echo ""
npm run dev
