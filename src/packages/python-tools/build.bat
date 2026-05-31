@echo off
REM 构建脚本 - Windows

echo 开始构建 ShareFile Python 工具...

REM 检查 Python 版本
python --version
if %errorlevel% neq 0 (
    echo Python 未安装或不在 PATH 中
    exit /b 1
)

REM 安装依赖
echo 安装依赖...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo 依赖安装失败
    exit /b 1
)

REM 清理旧的构建文件
echo 清理旧的构建文件...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

REM 构建可执行文件
echo 构建可执行文件...
pyinstaller build.spec
if %errorlevel% neq 0 (
    echo 构建失败
    exit /b 1
)

REM 检查构建结果
if exist "dist\generate-info.exe" (
    if exist "dist\generate-share-file.exe" (
        echo ✓ 构建成功！
        echo 可执行文件位于 dist\ 目录：
        dir dist\*.exe
    ) else (
        echo ✗ generate-share-file.exe 构建失败
        exit /b 1
    )
) else (
    echo ✗ generate-info.exe 构建失败
    exit /b 1
)

echo 完成！
