#!/bin/bash
# -*- coding: utf-8 -*-
# -----------------------------------------------------------------------------
# 文件名: install-zsh.sh
# 说明: 一个用于在 Linux 系统上安装 Zsh 和 Oh My Zsh 的脚本
# 作者: Shuery
# 创建日期: 2023-10-10
# 最后修改: 2023-12-11
# -----------------------------------------------------------------------------

set -e  # 启用错误终止模式

# -----------------------------------------------------------------------------
# 定义颜色
# -----------------------------------------------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'  # 恢复默认颜色

# -----------------------------------------------------------------------------
# 提示用户输入 sudo 密码
# -----------------------------------------------------------------------------
echo -e "${YELLOW}请输入您的 sudo 密码：${NC}"
sudo -v

# -----------------------------------------------------------------------------
# 根据发行版设置软件包管理器和安装命令
# -----------------------------------------------------------------------------
if command -v apt &> /dev/null; then
  PACKAGE_MANAGER="apt"
elif command -v pacman &> /dev/null; then
  PACKAGE_MANAGER="pacman"
elif command -v yum &> /dev/null; then
  PACKAGE_MANAGER="yum"
elif command -v zypper &> /dev/null; then
  PACKAGE_MANAGER="zypper"
else
  echo -e "${RED}不支持的软件包管理器。请手动安装软件包。${NC}"
  exit 1
fi

# -----------------------------------------------------------------------------
# 更新系统和安装基础软件
# -----------------------------------------------------------------------------
if [ "$PACKAGE_MANAGER" == "pacman" ]; then
  echo -e "${YELLOW}正在更新系统和安装基础软件...${NC}"
  sudo "${PACKAGE_MANAGER}" -Syu --noconfirm || { echo -e "${RED}${PACKAGE_MANAGER} -Syu 失败${NC}"; exit 1; }
  sudo "${PACKAGE_MANAGER}" -S zsh curl git --noconfirm
else
  echo -e "${YELLOW}正在更新系统和安装基础软件...${NC}"
  sudo "${PACKAGE_MANAGER}" update && sudo "${PACKAGE_MANAGER}" upgrade -y || { echo -e "${RED}${PACKAGE_MANAGER} update/upgrade 失败${NC}"; exit 1; }
  sudo "${PACKAGE_MANAGER}" install zsh curl git -y
fi

# -----------------------------------------------------------------------------
# 设置代理和 GitHub 地址
# -----------------------------------------------------------------------------
PROXY="https://ghproxy.net/"
GITHUB="${PROXY}github.com/"

# -----------------------------------------------------------------------------
# 安装 Oh My Zsh
# -----------------------------------------------------------------------------
echo -e "${YELLOW}请注意：在安装 Oh My Zsh 后，脚本会因其安装脚本切换 Shell 而退出。请在 Oh My Zsh 安装完成后重新运行脚本。${NC}"
# 检查是否已安装 Oh My Zsh
if [ -d "${HOME}/.oh-my-zsh" ]; then
  echo -e "${GREEN}Oh My Zsh 已安装。跳过安装步骤并执行余下步骤。${NC}"
else
  # 如果不存在 .oh-my-zsh 目录，则执行安装步骤
  echo -e "${YELLOW}正在安装 Oh My Zsh...${NC}"
  sh -c "$(curl -fsSL ${PROXY}raw.github.com/robbyrussell/oh-my-zsh/master/tools/install.sh)" REMOTE="${GITHUB}${REPO}.git"
fi

# -----------------------------------------------------------------------------
# 修改 Zsh 配置
# -----------------------------------------------------------------------------
echo -e "${YELLOW}正在修改 Zsh 配置...${NC}"
ZSHRC_FILE="${HOME}/.zshrc"
sed -i '/^ZSH_THEME=".*"$/s/robbyrussell/random/' "$ZSHRC_FILE"

# -----------------------------------------------------------------------------
# 定义要安装的插件和对应的仓库
# -----------------------------------------------------------------------------
declare -A PLUGINS=(
  ["zsh-syntax-highlighting"]="zsh-users/zsh-syntax-highlighting"
  ["zsh-autosuggestions"]="zsh-users/zsh-autosuggestions"
  ["zsh-completions"]="zsh-users/zsh-completions"
  ["zsh-history-substring-search"]="zsh-users/zsh-history-substring-search"
)

# -----------------------------------------------------------------------------
# 安装 Zsh 插件
# -----------------------------------------------------------------------------
function install_plugin {
  local plugin_name="$1"
  local plugin_repo="$2"
  local plugin_path="${ZSH_CUSTOM:-${HOME}/.oh-my-zsh/custom}/plugins/${plugin_name}"

  # 检查插件目录是否已存在
  if [ -d "$plugin_path" ]; then
    # 检查插件文件是否已存在
    if [ "$(ls -A "$plugin_path")" ]; then
      echo -e "${GREEN}插件 $plugin_name 已安装。跳过安装步骤。${NC}"
      sudo git -C "$plugin_path" pull --depth=1
      echo -e "${GREEN}插件 $plugin_name 更新成功。${NC}"
    fi
  else
    sudo git clone --depth=1 "${GITHUB}${plugin_repo}" "$plugin_path"
    sed -i "/^plugins=/{/${plugin_name}/!s/)/ ${plugin_name})/}" "$ZSHRC_FILE"
    echo -e "${GREEN}插件 $plugin_name 安装成功。${NC}"
  fi
}

# -----------------------------------------------------------------------------
# 安装所有插件
# -----------------------------------------------------------------------------
echo -e "${YELLOW}正在安装 Zsh 插件...${NC}"
for plugin_name in "${!PLUGINS[@]}"; do
  install_plugin "$plugin_name" "${PLUGINS[$plugin_name]}"
done

# -----------------------------------------------------------------------------
# 检查是否所有插件都已安装
# -----------------------------------------------------------------------------
all_plugins_installed=true
for plugin_name in "${!PLUGINS[@]}"; do
  plugin_path="${ZSH_CUSTOM:-${HOME}/.oh-my-zsh/custom}/plugins/${plugin_name}"

  if [ ! -d "$plugin_path" ] || [ -z "$(ls -A "$plugin_path")" ]; then
    all_plugins_installed=false
    echo -e "${RED}警告：插件 $plugin_name 未安装或安装失败。${NC}"
  fi
done

# -----------------------------------------------------------------------------
# 如果有未安装插件，进行重试安装
# -----------------------------------------------------------------------------
if [ "$all_plugins_installed" == false ]; then
  echo -e "${YELLOW}正在重试安装缺失的插件...${NC}"
  for plugin_name in "${!PLUGINS[@]}"; do
    install_plugin "$plugin_name" "${PLUGINS[$plugin_name]}"
  done
fi

# -----------------------------------------------------------------------------
# 检查当前 shell 是否为 Zsh，如果是则不切换
# -----------------------------------------------------------------------------
if echo "$SHELL" | grep -i "zsh" >/dev/null; then
  echo -e "${GREEN}Zsh 已经是默认 shell。无需切换。${NC}"
else
  # 切换为 Zsh，仅在插件安装完毕后切换
  if [ -d "${ZSH_CUSTOM:-${HOME}/.oh-my-zsh/custom}/plugins" ]; then
    chsh -s "$(command -v zsh)"
    echo -e "${GREEN}已切换到 Zsh。请重新启动您的终端。${NC}"
  else
    echo -e "${RED}未切换到 Zsh。请在插件安装后重新运行脚本。${NC}"
  fi
fi

# -----------------------------------------------------------------------------
# 脚本执行完毕
# -----------------------------------------------------------------------------
echo -e "${YELLOW}脚本执行完毕。请执行 \`source ~/.zshrc\` 以使更改生效${N