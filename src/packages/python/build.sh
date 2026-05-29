#!/bin/bash
# 构建脚本 - Linux/macOS

set -e

echo "开始构建 ShareFile Python 工具..."

# 检查 Python 版本
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "Python 版本: $python_version"

# 安装依赖
echo "安装依赖..."
pip3 install -r requirements.txt

# 清理旧的构建文件
echo "清理旧的构建文件..."
rm -rf build dist

# 构建可执行文件
echo "构建可执行文件..."
pyinstaller build.spec

# 检查构建结果
if [ -f "dist/generate-info" ] && [ -f "dist/generate-share-file" ]; then
    echo "✓ 构建成功！"
    echo "可执行文件位于 dist/ 目录："
    ls -lh dist/
else
    echo "✗ 构建失败！"
    exit 1
fi

echo "完成！"
