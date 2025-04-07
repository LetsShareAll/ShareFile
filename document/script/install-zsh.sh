#!/usr/bin/env bash
# -*- coding: utf-8 -*-
#==============================================================================
# 文件名称: install-zsh.sh
# 功能描述: 在 Linux 和 macOS 系统上安装并配置 Zsh 和 Oh My Zsh
# 版本信息: 2.0.1
# 作者信息: LetsShareAll
# 创建日期: 2023-10-10
# 最后修改: 2025-04-07
# 运行环境: Linux/macOS
# 依赖组件: git, curl, zsh
#==============================================================================

#==============================================================================
# 脚本初始化
#==============================================================================
# 启用严格模式
set -euo pipefail
IFS=$'\n\t'

# 启用错误追踪
set -E           # 启用 ERR trap
set -o errtrace  # 错误追踪穿透函数
set -o functrace # 启用函数追踪

#==============================================================================
# 常量定义
#==============================================================================
readonly SCRIPT_VERSION="2.0.1"
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 颜色定义
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_YELLOW='\033[1;33m'
readonly COLOR_RED='\033[0;31m'
readonly COLOR_BLUE='\033[0;34m'
readonly COLOR_RESET='\033[0m'

# 路径设置
readonly PATH_ZSHRC="${HOME}/.zshrc"
readonly PATH_OH_MY_ZSH="${HOME}/.oh-my-zsh"
readonly PATH_CUSTOM="${PATH_OH_MY_ZSH}/custom"
readonly PATH_BACKUP_DIR="${HOME}/.zsh_backup"
readonly PATH_LOG_FILE="/tmp/install-zsh-$(date +%Y%m%d%H%M%S).log"

# 默认主题与插件
ZSH_THEME=${ZSH_THEME:-"random"}
declare -a PLUGINS=(
  "zsh-syntax-highlighting:github:zsh-users/zsh-syntax-highlighting"
  "zsh-autosuggestions:github:zsh-users/zsh-autosuggestions"
  "zsh-completions:github:zsh-users/zsh-completions"
  "zsh-history-substring-search:github:zsh-users/zsh-history-substring-search"
)

# 网络设置
URL_GHPROXY=${URL_GHPROXY:-"https:/"}
URL_GITHUB="${URL_GHPROXY}/github.com"
URL_RAW_GITHUB="${URL_GHPROXY}/raw.githubusercontent.com"
readonly URL_GITLAB="https://gitlab.com"

# Oh My Zsh 设置
readonly REPO="ohmyzsh/ohmyzsh"
readonly REMOTE="${URL_GITHUB}/${REPO}.git"
readonly BRANCH="master"
readonly CHSH="yes"
readonly RUNZSH="no"
readonly KEEP_ZSHRC="no"

#==============================================================================
# 日志函数
#==============================================================================
log_to_file() {
  local level="$1"
  local message="$2"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] ${message}" >>"${PATH_LOG_FILE}"
}

log_info() {
  echo -e "${COLOR_GREEN}[✨ INFO]${COLOR_RESET} $1。"
  log_to_file "INFO" "$1"
}

log_warn() {
  echo -e "${COLOR_YELLOW}[⚠️ WARN]${COLOR_RESET} $1！"
  log_to_file "WARN" "$1"
}

log_error() {
  echo -e "${COLOR_RED}[❌ ERROR]${COLOR_RESET} $1！"
  log_to_file "ERROR" "$1"
}

log_prompt() {
  local message="$1"
  local input_type="${2:-text}" # 默认为文本输入
  local response=""

  printf -v prompt_message "%b[🤔 INPUT]%b %s" "${COLOR_BLUE}" "${COLOR_RESET}" "${message}"

  case "$input_type" in
  "password")
    echo -ne "${prompt_message}"
    log_to_file "INPUT" "${message} -> ********"
    ;;
  "text")
    read -r -p "${prompt_message}: " response
    log_to_file "INPUT" "${message} -> ${response}"
    ;;
  *)
    log_error "不支持的输入类型：${input_type}！"
    return 1
    ;;
  esac

  echo "${response}"
}

#==============================================================================
# 错误处理与清理函数
#==============================================================================
trap_error() {
  local lineno="$1"
  local command="$2"
  local retval="$3"
  log_error "错误发生在第 ${lineno} 行: '${command}' 退出码: ${retval}"
  cleanup
  exit "${retval}"
}

trap 'trap_error ${LINENO} "${BASH_COMMAND}" $?' ERR

error_exit() {
  log_error "$1"
  cleanup
  exit "${2:-1}"
}

cleanup() {
  local exit_code=$?
  if [ "${exit_code}" -ne 0 ]; then
    log_warn "脚本执行失败(退出码: ${exit_code})，开始清理"
    restore_backup
  fi
  return "${exit_code}"
}

trap cleanup EXIT

#==============================================================================
# 辅助函数
#==============================================================================
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

backup_file() {
  local file="$1"
  local backup="${PATH_BACKUP_DIR}/$(basename "$file").backup-$(date +%Y%m%d%H%M%S)"
  mkdir -p "${PATH_BACKUP_DIR}"
  if [ -f "$file" ]; then
    log_info "💾 备份文件 \"$file\" 到 \"$backup\""
    cp "$file" "$backup" || error_exit "❌ 备份失败: $file" 1
  fi
}

restore_backup() {
  local latest_backup
  latest_backup=$(find "${PATH_BACKUP_DIR}" -name "zshrc.backup-*" -type f -print0 | xargs -0 ls -t | head -n1)
  if [ -n "$latest_backup" ]; then
    log_info "💾 恢复配置文件备份: $latest_backup"
    cp "$latest_backup" "${PATH_ZSHRC}"
  fi
}

update_plugins_config() {
  local config_file="$1"
  local plugin_name="$2"

  if [ ! -f "$config_file" ]; then
    echo "plugins=($plugin_name)" >"$config_file"
    return 0
  fi

  if grep -q "^plugins=" "$config_file"; then
    if grep -q "^plugins=.*\b${plugin_name}\b" "$config_file"; then
      return 0
    fi

    if [[ "${OSTYPE}" == "darwin"* ]]; then
      sed -i '' -E "s/^(plugins=\()(.*)(\))/\1\2 ${plugin_name}\3/" "$config_file"
    else
      sed -i -E "s/^(plugins=\()(.*)(\))/\1\2 ${plugin_name}\3/" "$config_file"
    fi
  else
    if [[ "${OSTYPE}" == "darwin"* ]]; then
      sed -i '' '1i\
plugins=('"$plugin_name"')
' "$config_file"
    else
      sed -i '1i plugins=('"$plugin_name"')' "$config_file"
    fi
  fi
}

#==============================================================================
# 插件处理
#==============================================================================
install_plugin() {
  local plugin_str="$1"
  local plugin_name="${plugin_str%%:*}"
  local remainder="${plugin_str#*:}"
  local source_type="${remainder%%:*}"
  local source_path="${remainder#*:}"
  local plugin_path="${PATH_CUSTOM}/plugins/${plugin_name}"
  local source_url=""

  case "$source_type" in
  "github")
    source_url="${URL_GITHUB}/${source_path}"
    ;;
  "gitlab")
    source_url="${URL_GITLAB}/${source_path}"
    ;;
  "custom")
    source_url="$source_path"
    ;;
  *)
    error_exit "❌ 不支持的源类型: ${source_type}" 1
    ;;
  esac

  if [ -d "${plugin_path}" ]; then
    log_info "🔄 正在更新插件：${plugin_name}"
    git -C "${plugin_path}" reset --hard HEAD
    git -C "${plugin_path}" clean -fd
    git -C "${plugin_path}" pull --depth=1 --force
  else
    log_info "📥 正在安装插件：${plugin_name}"
    git clone --depth=1 "${source_url}" "${plugin_path}"
    update_plugins_config "${PATH_ZSHRC}" "${plugin_name}"
  fi

  # 修复换行符问题
  find "${plugin_path}" -type f -name "*.zsh" -o -name "*.sh" -o -name "*.plugin.zsh" | while read -r file; do
    if [[ -f "$file" ]]; then
      log_info "🔧 修复文件换行符：${file}"
      if [[ "${OSTYPE}" == "darwin"* ]]; then
        # macOS 使用 tr 命令
        tr -d '\r' <"$file" >"${file}.tmp" && mv "${file}.tmp" "$file"
      else
        # Linux 使用 sed 命令
        sed -i 's/\r$//' "$file"
      fi
    fi
  done
}

#==============================================================================
# 参数解析
#==============================================================================
parse_args() {
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
    --ghproxy=*)
      URL_GHPROXY="${1#*=}"
      readonly URL_GITHUB="${URL_GHPROXY}/github.com"
      readonly URL_RAW_GITHUB="${URL_GHPROXY}/raw.githubusercontent.com"
      shift
      ;;
    --theme=*)
      ZSH_THEME="${1#*=}"
      log_info "设置主题: ${ZSH_THEME}"
      shift
      ;;
    --plugins=*)
      local plugins_str="${1#*=}"
      plugins_str="${plugins_str#'['}"
      plugins_str="${plugins_str%']'}"
      PLUGINS=()
      while IFS= read -r plugin; do
        [[ -z "$plugin" ]] && continue
        plugin="${plugin#"${plugin%%[![:space:]]*}"}"
        plugin="${plugin%"${plugin##*[![:space:]]}"}"
        PLUGINS+=("$plugin")
      done < <(echo "$plugins_str" | tr ' ' '\n')
      shift
      ;;
    --help)
      show_help
      exit 0
      ;;
    --version)
      echo "${SCRIPT_VERSION}"
      exit 0
      ;;
    *)
      error_exit "❌ 未知参数: $1" 1
      ;;
    esac
  done
}

#==============================================================================
# 帮助信息
#==============================================================================
show_help() {
  cat <<EOF
使用方法: ${SCRIPT_NAME} [选项]

选项:
    --theme=NAME    设置 Oh My Zsh 主题 (默认: ${ZSH_THEME})
    --plugins=[] 设置要安装的插件列表
    --ghproxy=URL   设置 GitHub 代理地址 (默认: ${URL_GHPROXY})
    --help          显示此帮助信息
    --version       显示版本信息

插件格式:
    plugin-name:source-type:source-path
    
源类型:
    - github  默认值，自动使用 GitHub 代理
    - gitlab  直接访问，不使用代理
    - custom  自定义源，需提供完整 URL

默认插件集:
$(for plugin in "${PLUGINS[@]}"; do
    echo "    - $plugin"
  done)

示例:
    基本安装:
    ${SCRIPT_NAME} --theme='robbyrussell'

    自定义插件:
    ${SCRIPT_NAME} --plugins='[
        "zsh-autosuggestions:github:zsh-users/zsh-autosuggestions"
        "github-plugin:github:user/github-plugin"
        "gitlab-plugin:gitlab:group/gitlab-plugin"
        "docker:custom:https://custom.domain/docker.git"
    ]'

    使用代理:
    ${SCRIPT_NAME} --ghproxy='https://gh-proxy.com'

注意事项:
    1. 默认使用 random 主题
    2. 未指定插件时自动安装默认插件集
    3. custom 源需要提供完整 URL
    4. GitLab 和自定义源将直接访问，不使用代理
    5. GitHub 代理仅对 github 类型的源生效

日志位置: ${PATH_LOG_FILE}
备份位置: ${PATH_BACKUP_DIR}
EOF
}

#==============================================================================
# 系统与包管理器检查
#==============================================================================
check_system() {
  # Shell 兼容性检查
  if [ -n "${BASH_VERSION:-}" ]; then
    readonly CURRENT_SHELL="bash"
    # Bash 专用设置已在初始化时完成
  elif [ -n "${ZSH_VERSION:-}" ]; then
    error_exit "❌ 暂不支持在 Zsh 环境下运行此脚本" 1
  else
    error_exit "❌ 不支持的 Shell 环境，请使用 Bash 运行此脚本" 1
  fi
  log_info "🔍 当前执行环境：${CURRENT_SHELL} Shell"

  # 操作系统检查
  case "${OSTYPE}" in
  darwin*)
    readonly OS_TYPE="macos"
    check_homebrew
    ;;
  linux*)
    readonly OS_TYPE="linux"
    check_package_manager
    ;;
  *)
    error_exit "❌ 不支持的操作系统类型: ${OSTYPE}" 1
    ;;
  esac

  log_info "✅ 系统环境检查通过：${OS_TYPE}"
}

check_package_manager() {
  if command_exists brew; then
    readonly PACKAGE_MANAGER="brew"
  elif command_exists apt; then
    readonly PACKAGE_MANAGER="apt"
  elif command_exists pacman; then
    readonly PACKAGE_MANAGER="pacman"
  elif command_exists yum; then
    readonly PACKAGE_MANAGER="yum"
  elif command_exists zypper; then
    readonly PACKAGE_MANAGER="zypper"
  else
    error_exit "❌ 未找到支持的包管理器" 1
  fi
}

check_homebrew() {
  if ! command_exists brew; then
    install_brew_resp=$(log_prompt "检测到系统未安装 Homebrew。是否安装？[Y/n] ")
    if [[ -z "$install_brew_resp" || "$install_brew_resp" =~ ^[Yy]$ ]]; then
      log_info "正在安装 Homebrew"
      if [[ "${URL_PROXY:-}" != "https:/" ]]; then
        log_info "使用国内镜像源安装 Homebrew"
        /bin/zsh -c "$(curl -fsSL https://gitee.com/cunkai/HomebrewCN/raw/master/Homebrew.sh)" || {
          error_exit "❌ Homebrew 安装失败（国内源）" 1
        }
      else
        log_info "使用官方源安装 Homebrew"
        /bin/bash -c "$(curl -fsSL ${URL_RAW_GITHUB}/Homebrew/install/HEAD/install.sh)" || {
          error_exit "❌ Homebrew 安装失败（官方源）" 1
        }
      fi
      log_info "Homebrew 安装成功"
    else
      error_exit "❌ 用户取消了 Homebrew 安装" 1
    fi
  fi
}

#==============================================================================
# 依赖安装
#==============================================================================
install_dependencies() {
  local deps=("zsh" "git" "curl")
  for dep in "${deps[@]}"; do
    if ! command_exists "${dep}"; then
      log_info "📦 正在安装依赖：${dep}"
      case "${PACKAGE_MANAGER}" in
      brew)
        brew install "${dep}"
        ;;
      apt)
        sudo apt update && sudo apt install -y "${dep}"
        ;;
      pacman)
        sudo pacman -Sy --noconfirm "${dep}"
        ;;
      yum)
        sudo yum install -y "${dep}"
        ;;
      zypper)
        sudo zypper install -y "${dep}"
        ;;
      esac || error_exit "❌ 安装 ${dep} 失败" 1
    else
      log_info "✅ ${dep} 已经安装完成"
    fi
  done
}

#==============================================================================
# Oh My Zsh 安装
#==============================================================================
install_oh_my_zsh() {
  if [ -d "${PATH_OH_MY_ZSH}" ]; then
    log_info "✨ Oh My Zsh 已经安装完成"
    return 0
  fi

  confirm_resp=$(log_prompt "🚀 即将安装 Oh My Zsh，是否继续？[Y/n]")
  if [[ -z "$confirm_resp" || "$confirm_resp" =~ ^[Yy]$ ]]; then
    export ZSH="${PATH_OH_MY_ZSH}"
    export REPO
    export REMOTE
    export BRANCH
    export KEEP_ZSHRC
    export CHSH
    export RUNZSH
    log_info "执行 Oh My Zsh 安装命令"
    sh -c "$(curl -fsSL ${URL_RAW_GITHUB}/${REPO}/master/tools/install.sh)" || {
      local ret=$?
      error_exit "❌ Oh My Zsh 安装失败，退出码: ${ret}" ${ret}
    }
  else
    error_exit "❌ 用户取消了 Oh My Zsh 安装" 1
  fi
}

#==============================================================================
# 主题设置
#==============================================================================
set_theme() {
  if [[ -f "${PATH_ZSHRC}" ]]; then
    log_info "🎨 正在设置 Oh My Zsh 主题为：${ZSH_THEME}"
    if [[ "${OSTYPE}" == "darwin"* ]]; then
      sed -i '' "s/^ZSH_THEME=.*$/ZSH_THEME=\"${ZSH_THEME}\"/" "${PATH_ZSHRC}"
    else
      sed -i "s/^ZSH_THEME=.*$/ZSH_THEME=\"${ZSH_THEME}\"/" "${PATH_ZSHRC}"
    fi
  else
    error_exit "❌ 未找到 .zshrc 文件" 1
  fi
}

#==============================================================================
# 插件安装
#==============================================================================
install_plugins() {
  for plugin_str in "${PLUGINS[@]}"; do
    install_plugin "$plugin_str"
  done
}

#==============================================================================
# 验证安装
#==============================================================================
verify_installation() {
  local errors=0
  local error_msgs=()

  if ! command_exists zsh; then
    error_msgs+=("Zsh 未正确安装")
    ((errors++))
  fi

  if [ ! -d "${PATH_OH_MY_ZSH}" ]; then
    error_msgs+=("Oh My Zsh 目录不存在")
    ((errors++))
  fi

  if [ ! -f "${PATH_ZSHRC}" ]; then
    error_msgs+=(".zshrc 配置文件不存在")
    ((errors++))
  fi

  for plugin_str in "${PLUGINS[@]}"; do
    local plugin_name="${plugin_str%%:*}"
    local plugin_path="${PATH_CUSTOM}/plugins/${plugin_name}"
    if [ ! -d "${plugin_path}" ]; then
      error_msgs+=("插件未安装: ${plugin_name}")
      ((errors++))
    fi
  done

  if [ ${errors} -gt 0 ]; then
    log_error "🔍 安装验证失败，发现 ${errors} 个问题："
    printf '%s\n' "${error_msgs[@]}" | sed 's/^/    ❌ /'
    error_exit "❌ 请检查以上问题并重试" 1
  fi

  log_info "✅ 安装验证完成，所有组件检查通过"
}

#==============================================================================
# 清理备份
#==============================================================================
cleanup_backup() {
  log_info "🧹 开始清理备份"

  # 清理备份目录
  if [ -d "${PATH_BACKUP_DIR}" ]; then
    rm -rf "${PATH_BACKUP_DIR}"
    log_info "💾 已删除备份目录: ${PATH_BACKUP_DIR}"
  fi

  log_info "✨ 备份清理完成"
}

#==============================================================================
# 权限检查
#==============================================================================
check_root_privileges() {
  if [[ "$EUID" -ne 0 ]]; then
    log_prompt "请输入您的 sudo 密码：" "password"
    sudo -S -v
  fi
}

#==============================================================================
# 切换 Shell
#==============================================================================
switch_shell() {
  # 如果当前 Shell 已经是 zsh，则跳过
  if [ "$(basename -- "$SHELL")" = "zsh" ]; then
    log_info "✅ 当前 Shell 已经是 Zsh，无需切换"
    return 0
  fi

  # 检查系统是否支持 chsh 命令
  if ! command_exists chsh; then
    log_warn "⚠️ 系统不支持 chsh 命令，无法自动切换 Shell"
    log_info "💡 请手动将默认 Shell 更改为 Zsh"
    return 1
  fi

  # 检查是否在 Termux 环境中运行
  if [ -n "${PREFIX+x}" ] && [[ "$PREFIX" == *"com.termux"* ]]; then
    readonly TERMUX=true
    ZSH_PATH="zsh"
  else
    readonly TERMUX=false
    # 检查 shells 文件位置
    if [ -f /etc/shells ]; then
      readonly SHELLS_FILE=/etc/shells
    elif [ -f /usr/share/defaults/etc/shells ]; then # Solus OS
      readonly SHELLS_FILE=/usr/share/defaults/etc/shells
    else
      log_error "未找到 /etc/shells 文件"
      log_info "💡 请手动更改默认 Shell"
      return 1
    fi

    # 获取 zsh 二进制文件路径
    if ! ZSH_PATH=$(command -v zsh) || ! grep -qx "$ZSH_PATH" "$SHELLS_FILE"; then
      if ! ZSH_PATH=$(grep '^/.*/zsh$' "$SHELLS_FILE" | tail -n 1) || [ ! -f "$ZSH_PATH" ]; then
        log_error "未找到 zsh 或其未在 ${SHELLS_FILE} 中列出"
        log_info "💡 请手动更改默认 Shell"
        return 1
      fi
    fi
  fi

  # 备份当前 Shell 设置
  if [ -n "$SHELL" ]; then
    echo "$SHELL" >"${PATH_BACKUP_DIR}/.shell.pre-oh-my-zsh"
  else
    grep "^$USER:" /etc/passwd | awk -F: '{print $7}' >"${PATH_BACKUP_DIR}/.shell.pre-oh-my-zsh"
  fi

  log_info "🔄 正在将默认 Shell 切换为 ${ZSH_PATH}"

  # 使用适当的权限执行 chsh 命令
  if [ "$EUID" -eq 0 ]; then # 如果是 root 用户
    chsh -s "$ZSH_PATH" "$USER"
  else
    sudo -k chsh -s "$ZSH_PATH" "$USER" # -k 强制密码提示
  fi

  # 检查 Shell 切换是否成功
  if [ $? -ne 0 ]; then
    log_error "Shell 切换失败"
    log_info "💡 请手动执行: chsh -s $(command -v zsh)"
    return 1
  else
    export SHELL="$ZSH_PATH"
    log_info "✅ Shell 已成功切换为 ${ZSH_PATH}"
  fi
}

#==============================================================================
# 更新 Shell
#==============================================================================
update_shell() {
  if [ -f "${PATH_ZSHRC}" ]; then
    # 检查当前 Shell 类型
    # if [ "$(basename -- "$SHELL")" = "zsh" ]; then
    #   log_info "♻️ 正在重新加载 Zsh 配置"
    #   # 使用 zsh 命令显式执行配置重载
    #   zsh -c "source ${PATH_ZSHRC}"
    # else
    log_info "🚀 正在切换到新的 Zsh 会话"
    # 直接切换到新的 zsh 会话
    exec zsh -l
    # fi
  else
    log_warn "⚠️ .zshrc 文件不存在"
    # log_info "💡 请重新启动终端以完成切换"
  fi
}

#==============================================================================
# 主函数
#==============================================================================
main() {
  log_info "🚀 开始执行 ${SCRIPT_NAME} (版本 ${SCRIPT_VERSION})"
  parse_args "$@"

  check_root_privileges
  check_system
  install_dependencies
  install_oh_my_zsh
  backup_file "${PATH_ZSHRC}"
  set_theme
  install_plugins
  verify_installation

  # switch_shell

  log_info "🎉 安装完成！"
  log_info "📝 日志文件位置：${PATH_LOG_FILE}"

  cleanup_backup

  update_shell
}

# 执行主函数
main "$@"
