#!/usr/bin/env bash
# -*- coding：utf-8 -*-
#==============================================================================
# 文件名称：block-host.sh
# 功能描述：临时屏蔽指定域名，自定义时间后自动恢复 (macOS/Linux)
# 版本信息：1.1.0
# 编写作者：LetsShareAll
# 创建日期：2025-06-10
# 最后修改：2025-06-10
# 依赖组件：bash >=4.0, figlet
# 版权信息：本脚本遵循 MIT 许可证，你可以自由使用、修改和分发。
#==============================================================================

### 全局配置 ###
declare -a BLOCK_DOMAINS=()       # 要屏蔽的域名数组
declare -i BLOCK_TIME=10          # 默认屏蔽时长（秒）
declare -i ENABLE_ANIMATION=0     # 启用进度动画（0/1）
declare -i LOG_LEVEL=3            # 默认日志级别（1:ERROR, 2:WARNING, 3:INFO, 4:DEBUG）
declare -x SCRIPT_VERSION="1.1.0" # 脚本版本

### 颜色定义 ###
declare -A COLORS=(
    [reset]="\033[0m"
    [timestamp]="\033[38;5;244m"
    [header]="\033[38;5;198m"
    [code]="\033[38;5;183m"
    [debug]="\033[38;5;111m"
    [info]="\033[38;5;87m"
    [success]="\033[38;5;82m"
    [progress]="\033[38;5;57m"
    [warning]="\033[38;5;214m"
    [error]="\033[38;5;196m"
)

### 日志系统 ###
log() {
    local level="$1"
    local message="$2"
    local icon=""
    local log_num=0

    case "$level" in
    debug)
        log_num=4
        icon="◇"
        ;;
    info)
        log_num=3
        icon="◆"
        ;;
    success)
        log_num=3
        icon="✔"
        ;;
    progress)
        log_num=3
        icon="↺"
        ;;
    warning)
        log_num=2
        icon="⚠"
        ;;
    error)
        log_num=1
        icon="✖"
        ;;
    *)
        log_num=0
        icon="?"
        ;;
    esac

    # 检查日志级别
    ((LOG_LEVEL < log_num)) && return

    # 输出带颜色的日志
    echo -e \
        "${COLORS[timestamp]}[$(date '+%T')]${COLORS[reset]} ${COLORS[$level]}${icon} ${message}${COLORS[reset]}"
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
用法：sudo ./block-host.sh [选项]

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
            echo "block-host.sh ${COLORS[code]}v${SCRIPT_VERSION}${COLORS[reset]}"
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

    log success "已备份 hosts 文件：${COLORS[code]}$(echo $host_backup)${COLORS[success]}！" >&2
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
            printf "\r${COLORS[progress]}剩余时间：["
            printf "%0.s█" $(seq 1 $((step)))
            printf "%0.s░" $(seq 1 $((steps - step)))
            printf "] %5d 秒${COLORS[reset]}" $((step * duration / steps))
            sleep "$(bc <<< "scale=2; $interval / 1000")"
        done
    else
        for ((i = duration; i >= 0; i--)); do
            printf "\r${COLORS[progress]}剩余时间：%d 秒${COLORS[reset]}" "$i"
            sleep 1
        done
    fi

    echo
    log info "域名屏蔽已结束！"
}

### 主函数 ###
main() {
    # 显示标题
    printf "\n${COLORS[header]}"
    if check_figlet; then
        figlet -f slant "Block-Host"
    else
        echo "BLOCK-HOST"
    fi
    printf "${COLORS[reset]}\n"

    # 解析参数
    parse_args "$@"

    # 检查权限
    check_root

    # 显示配置信息
    log info "屏蔽域名：${COLORS[code]}${BLOCK_DOMAINS[*]}${COLORS[info]}。"
    log info "屏蔽时长：${COLORS[code]}${BLOCK_TIME}${COLORS[info]} 秒。"
    log info "进度动画: ${COLORS[code]}$([ $ENABLE_ANIMATION -ne 0 ] && echo "启用" || echo "禁用")${COLORS[info]}。"
    log debug "调试模式：${COLORS[code]}启用${COLORS[debug]}。"

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