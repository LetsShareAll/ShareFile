#!/usr/bin/env bash
# -*- coding：utf-8 -*-
#==============================================================================
# 文件名称：block-host.sh
# 功能描述：临时屏蔽指定域名，自定义时间后自动恢复（macOS/Linux）。
# 版本信息：1.1.1
# 编写作者：LetsShareAll
# 创建日期：2025-06-10
# 最后修改：2025-06-10
# 依赖组件：bash >=4.0, figlet
# 版权信息：本脚本遵循 MIT 许可证，你可以自由使用、修改和分发。
#==============================================================================

declare -r SCRIPT_NAME="BlockHost"
declare -r SCRIPT_DESCRIPTION="临时屏蔽指定域名，自定义时间后自动恢复（macOS/Linux）。"
declare -r SCRIPT_VERSION="1.1.1"
declare -r SCRIPT_AUTHOR="LetsShareAll"

### 全局配置 ###
declare -a BLOCK_DOMAINS=()       # 要屏蔽的域名数组
declare -i BLOCK_TIME=10          # 默认屏蔽时长（秒）
declare -i ENABLE_ANIMATION=0     # 启用进度动画（0/1）
declare -i LOG_LEVEL=3            # 默认日志级别（1:ERROR, 2:WARNING, 3:INFO, 4:DEBUG）

### 颜色定义 ###
declare -A STYPE_FORMATS=(
    [BOLD]="\e[1m"
    [DIM]="\e[2m"
    [UNDERLINE]="\e[4m"
    [BLINK]="\e[5m"
    [REVERSE]="\e[7m"
    [HIDDEN]="\e[8m"
    [RESET_ALL]="\e[0m"
    [RESET_BOLD]="\e[21m"
    [RESET_DIM]="\e[22m"
    [RESET_UNDERLINE]="\e[24m"
    [RESET_BLINK]="\e[25m"
    [RESET_REVERSE]="\e[27m"
    [RESET_HIDDEN]="\e[28m"
)

declare -A STYLE_FORE_COLORS=(
    [DEFAULT]="\e[39m"
    [BLACK]="\e[30m"
    [RED]="\e[31m"
    [GREEN]="\e[32m"
    [YELLOW]="\e[33m"
    [BLUE]="\e[34m"
    [MAGENTA]="\e[35m"
    [CYAN]="\e[36m"
    [LIGHT_GRAY]="\e[37m"
    [DARK_GRAY]="\e[90m"
    [LIGHT_RED]="\e[91m"
    [LIGHT_GREEN]="\e[92m"
    [LIGHT_YELLOW]="\e[93m"
    [LIGHT_BLUE]="\e[94m"
    [LIGHT_MAGENTA]="\e[95m"
    [LIGHT_CYAN]="\e[96m"
    [WHITE]="\e[97m"
)

declare -A STYLE_BACK_COLORS=(
    [DEFAULT]="\e[49m"
    [BLACK]="\e[40m"
    [RED]="\e[41m"
    [GREEN]="\e[42m"
    [YELLOW]="\e[43m"
    [BLUE]="\e[44m"
    [MAGENTA]="\e[45m"
    [CYAN]="\e[46m"
    [LIGHT_GRAY]="\e[47m"
    [DARK_GRAY]="\e[100m"
    [LIGHT_RED]="\e[101m"
    [LIGHT_GREEN]="\e[102m"
    [LIGHT_YELLOW]="\e[103m"
    [LIGHT_BLUE]="\e[104m"
    [LIGHT_MAGENTA]="\e[105m"
    [LIGHT_CYAN]="\e[106m"
    [WHITE]="\e[107m"
)

declare -A STYLE=(
    [ERROR]="${STYLE_FORE_COLORS[RED]}${STYLE_BACK_COLORS[DEFAULT]}${STYPE_FORMATS[BOLD]}"
    [WARN]="${STYLE_FORE_COLORS[YELLOW]}${STYLE_BACK_COLORS[DEFAULT]}${STYPE_FORMATS[BOLD]}"
    [INFO]="${STYLE_FORE_COLORS[CYAN]}${STYLE_BACK_COLORS[DEFAULT]}"
    [NOTE]="${STYLE_FORE_COLORS[LIGHT_MAGENTA]}${STYLE_BACK_COLORS[DEFAULT]}${STYPE_FORMATS[UNDERLINE]}"
    [PROGRESS]="${STYLE_FORE_COLORS[LIGHT_BLUE]}${STYLE_BACK_COLORS[DEFAULT]}${STYPE_FORMATS[BLINK]}"
    [SUCCESS]="${STYLE_FORE_COLORS[GREEN]}${STYLE_BACK_COLORS[DEFAULT]}"
    [DEBUG]="${STYLE_FORE_COLORS[MAGENTA]}${STYLE_BACK_COLORS[DEFAULT]}"
    [TIMESTAMP]="${STYLE_FORE_COLORS[LIGHT_GRAY]}${STYLE_BACK_COLORS[DEFAULT]}${STYPE_FORMATS[DIM]}"
    [HIGHLIGHT]="${STYPE_FORMATS[UNDERLINE]}${STYPE_FORMATS[REVERSE]}"
    [RESET_HIGHLIGHT]="${STYPE_FORMATS[RESET_UNDERLINE]}${STYPE_FORMATS[RESET_REVERSE]}"
    [RESET]="${STYLE_FORE_COLORS[DEFAULT]}${STYLE_BACK_COLORS[DEFAULT]}${STYPE_FORMATS[RESET_ALL]}"
)

### 日志系统 ###
log() {
    local level="$1"
    local message="$2"
    local timestamp="${STYLE[TIMESTAMP]}【$(date '+%Y-%m-%d %H:%M:%S')】${STYLE[RESET]}"
    local icon=""
    local sentence=""
    local log_num=0

    case "$level" in
    debug)
        log_num=4
        icon="◇"
        sentence="${STYLE[DEBUG]}【DEBUG】${icon} ${message}${STYLE[RESET]}"
        ;;
    info)
        log_num=3
        icon="◆"
        sentence="${STYLE[INFO]}【INFO】${icon} ${message}${STYLE[RESET]}"
        ;;
    success)
        log_num=3
        icon="✔"
        sentence="${STYLE[SUCCESS]}【SUCCESS】${icon} ${message}${STYLE[RESET]}"
        ;;
    progress)
        log_num=3
        icon="↺"
        sentence="${STYLE[PROGRESS]}【PROGRESS】${icon} ${message}${STYLE[RESET]}"
        ;;
    warning)
        log_num=2
        icon="⚠"
        sentence="${STYLE[WARN]}【WARN】${icon} ${message}${STYLE[RESET]}"
        ;;
    error)
        log_num=1
        icon="✖"
        sentence="${STYLE[ERROR]}【ERROR】${icon} ${message}${STYLE[RESET]}"
        ;;
    *)
        log_num=0
        icon="?"
        sentence="【UNKNOWN】${icon} ${message}"
        ;;
    esac

    # 检查日志级别
    ((LOG_LEVEL < log_num)) && return

    # 输出带颜色的日志
    echo -e "${timestamp}${SCRIPT_NAME}${sentence}"
}

### 检查管理员权限 ###
check_root() {
    if [[ "$(id -u)" != "0" ]]; then
        log error "此脚本必须使用 sudo 运行！"
        exit 1
    fi
}

### 检查 figlet 安装 ###
check_figlet() {
    if ! command -v figlet &>/dev/null; then
        log warning "未找到 figlet！将使用简易标题。"
        return 1
    fi
    return 0
}

### 显示帮助信息 ###
show_help() {
    cat <<EOF
${SCRIPT_NAME} - ${SCRIPT_DESCRIPTION}
版本：${SCRIPT_VERSION}
作者：${SCRIPT_AUTHOR}
用法：${0} [选项]
选项:
  -d, --domains <域名列表>  *必须*设置要屏蔽的域名（逗号分隔）
  -t, --time <秒数>         设置屏蔽持续时间（默认：10）
  -a, --animation           启用进度动画
  --debug                   启用调试输出
  -h, --help                显示帮助信息
  -v, --version             显示版本信息

示例:
  sudo ./block-host.sh -d "example.com,test.com" -t 30
  sudo ./block-host.sh --domains=example.com --time=15 --animation
EOF
}

### 参数解析 ###
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
        -d | --domains)
            IFS=',' read -r -a BLOCK_DOMAINS <<<"$2"
            shift 2
            ;;
        -t | --time)
            BLOCK_TIME="$2"
            shift 2
            ;;
        -a | --animation)
            ENABLE_ANIMATION=1
            shift
            ;;
        --debug)
            LOG_LEVEL=4
            shift
            ;;
        -h | --help)
            show_help
            exit 0
            ;;
        -v | --version)
            echo "block-host.sh ${STYLE[HIGHLIGHT]}v${SCRIPT_VERSION}${STYLE[RESET_HIGHLIGHT]}"
            exit 0
            ;;
        *)
            log error "未知参数：$1。"
            show_help
            exit 1
            ;;
        esac
    done

    if [[ ${#BLOCK_DOMAINS[@]} -eq 0 ]]; then
        log error "必须通过 -d/--domains 参数指定至少一个域名！"
        show_help
        exit 1
    fi
}

### 创建 hosts 文件备份 ###
create_backup() {
    log debug "开始备份 hosts 文件……" >&2
    local host_backup="/etc/hosts.bak.$(date +%s)"

    if ! cp -f /etc/hosts "$host_backup"; then
        log error "备份 hosts 文件失败！"
        exit 1
    fi

    log success "已备份 hosts 文件：${STYLE[HIGHLIGHT]}$(echo $host_backup)${STYLE[RESET_HIGHLIGHT]}！" >&2
    echo "$host_backup"
}

### 添加屏蔽规则 ###
add_block_rules() {
    log debug "开始添加屏蔽规则……"
    {
        printf '\n# Block-Host Temporary Rules (Generated at %s)\n' "$(date '+%Y-%m-%d %T')"
        for domain in "${BLOCK_DOMAINS[@]}"; do
            printf '0.0.0.0 %s\n' "$domain"
        done
        echo "# End of Block Rules"
    } >>/etc/hosts

    log success "已添加屏蔽规则！"
}

### 刷新 DNS 缓存 ###
flush_dns() {
    log debug "开始刷新 DNS 缓存……"
    case "$(uname -s)" in
    Darwin)
        darwin_version=$(sw_vers -productVersion)
        darwin_major=${darwin_version%%.*}
        if ((darwin_major >= 14)); then
            killall -HUP mDNSResponder
            dscacheutil -flushcache
        else
            discoveryutil mdnsflushcache
        fi
        ;;
    Linux)
        if [[ -f /etc/os-release ]]; then
            source /etc/os-release
            case "$ID" in
            ubuntu | debian) systemd-resolve --flush-caches ;;
            fedora | centos | rhel) systemctl restart nscd ;;
            arch) systemctl restart systemd-networkd ;;
            *) log warning "不支持的Linux发行版：$ID。" ;;
            esac
        fi
        ;;
    *)
        log warning "不支持的 OS 类型：$(uname -s)。"
        ;;
    esac
    log success "已刷新 DNS 缓存！"
}

### 恢复原始 hosts 文件 ###
restore_hosts() {
    log debug "开始恢复 hosts 文件……"
    local host_backup="$1"

    if ! mv -f "$host_backup" /etc/hosts; then
        log error "恢复 hosts 文件失败！"
        exit 1
    fi

    log success "已恢复 hosts 文件！"
}

### 清理函数 ###
cleanup() {
    local host_backup="$1"

    log debug "开始清理修改……"
    restore_hosts "$host_backup"
    flush_dns
    log success "已清理修改！"
}

### 显示进度 ###
show_progress() {
    local -i duration="$1"

    log info "域名屏蔽中……"

    if ((ENABLE_ANIMATION)); then
        local -i steps=50
        local -i interval=$((duration * 1000 / steps))

        for ((step = steps; step >= 0; step--)); do
            printf "\r${STYLE_FORE_COLORS[LIGHT_BLUE]}剩余时间：["
            printf "%0.s█" $(seq 1 $((step)))
            printf "%0.s░" $(seq 1 $((steps - step)))
            printf "] %5d 秒${STYLE_FORE_COLORS[DEFAULT]}" $((step * duration / steps))
            sleep "$(bc <<<"scale=2; $interval / 1000")"
        done
    else
        for ((i = duration; i >= 0; i--)); do
            log progress "剩余时间：${STYLE[HIGHLIGHT]}$i${STYLE[RESET_HIGHLIGHT]} 秒……"
            sleep 1
        done
    fi

    echo
    log info "域名屏蔽已结束！"
}

### 主函数 ###
main() {
    # 显示标题
    printf "\n${STYLE_FORE_COLORS[LIGHT_GREEN]}"
    if check_figlet; then
        figlet -f slant "Block-Host"
    else
        echo "BLOCK-HOST"
    fi
    printf "${STYLE_FORE_COLORS[DEFAULT]}\n"

    # 解析参数
    parse_args "$@"

    # 检查权限
    check_root

    # 显示配置信息
    log info "屏蔽域名：${STYLE[HIGHLIGHT]}${BLOCK_DOMAINS[*]}${STYLE[RESET_HIGHLIGHT]}。"
    log info "屏蔽时长：${STYLE[HIGHLIGHT]}${BLOCK_TIME}${STYLE[RESET_HIGHLIGHT]} 秒。"
    log info "进度动画: ${STYLE[HIGHLIGHT]}$([ $ENABLE_ANIMATION -ne 0 ] && echo "启用" || echo "禁用")${STYLE[RESET_HIGHLIGHT]}。"
    log debug "调试模式：${STYLE[HIGHLIGHT]}启用${STYLE[RESET_HIGHLIGHT]}。"

    # 创建备份
    local ho s t
    host_backup=$(create_backup)

    # 添加屏蔽规则
    add_block_rules

    # 刷新DNS
    flush_dns

    # 显示进度
    show_progress "$BLOCK_TIME"

    # 清理恢复
    cleanup "$host_backup"
}

### 执行入口 ###
main "$@"
