#!/usr/bin/env bash

declare -r SCRIPT_NAME="RunGenShin"
declare -r SCRIPT_DESCRIPTION="一键启动原神并屏蔽指定域名。"
declare -r SCRIPT_VERSION="1.1.2"
declare -r SCRIPT_AUTHOR="LetsShareAll"

declare genshin_name="YuanShen"
declare genshin_launcher="${HOME}/Applications/CrossOver/YuanShen.app/Contents/MacOS/Menu Helper"
declare temp_block_domain="dispatchcnglobal.yuanshen.com"
declare temp_block_time=10
declare local_block_script=""
declare log_level=3 # 0：不输出日志, 1：输出错误日志, 2：输出警告日志, 3：输出信息日志, 4：输出调试日志

declare -r ARG_TIP="请使用 ${0} -h 或 ${0} --help 查看帮助信息。"
declare -r NAME_LENGTH_MIN=3
declare -r DOMAIN_LENGTH_MIN=3
declare -r REMOTE_BLOCK_SCRIPT="https://file.lssa.fun/document/script/block-host.sh"

declare -A STYPE_FORMAT=(
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
    [ERROR]="${STYLE_FORE_COLORS[RED]}${STYLE_BACK_COLORS[DEFAULT]}${STYPE_FORMAT[BOLD]}"
    [WARN]="${STYLE_FORE_COLORS[YELLOW]}${STYLE_BACK_COLORS[DEFAULT]}${STYPE_FORMAT[BOLD]}"
    [INFO]="${STYLE_FORE_COLORS[CYAN]}${STYLE_BACK_COLORS[DEFAULT]}"
    [NOTE]="${STYLE_FORE_COLORS[LIGHT_MAGENTA]}${STYLE_BACK_COLORS[DEFAULT]}${STYPE_FORMAT[UNDERLINE]}"
    [PROGRESS]="${STYLE_FORE_COLORS[LIGHT_BLUE]}${STYLE_BACK_COLORS[DEFAULT]}${STYPE_FORMAT[BLINK]}"
    [SUCCESS]="${STYLE_FORE_COLORS[GREEN]}${STYLE_BACK_COLORS[DEFAULT]}"
    [DEBUG]="${STYLE_FORE_COLORS[MAGENTA]}${STYLE_BACK_COLORS[DEFAULT]}"
    [TIMESTAMP]="${STYLE_FORE_COLORS[LIGHT_GRAY]}${STYLE_BACK_COLORS[DEFAULT]}${STYPE_FORMAT[DIM]}"
    [HIGHLIGHT]="${STYPE_FORMAT[REVERSE]}"
    [RESET_HIGHLIGHT]="${STYPE_FORMAT[RESET_REVERSE]}"
    [RESET]="${STYLE_FORE_COLORS[DEFAULT]}${STYLE_BACK_COLORS[DEFAULT]}${STYPE_FORMAT[RESET_ALL]}"
)

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
        -n | --name)
            if [[ -z "$2" ]]; then
                log ERROR "未指定原神进程名称！${ARG_TIP}"
                exit 1
            fi
            genshin_name="$2"
            shift 2
            ;;
        -l | --launcher)
            if [[ -z "$2" ]]; then
                log ERROR "未指定原神启动文件！${ARG_TIP}"
                exit 1
            fi
            genshin_launcher="$2"
            shift 2
            ;;
        -d | --domain)
            if [[ -z "$2" ]]; then
                log ERROR "未指定要屏蔽的域名！${ARG_TIP}"
                exit 1
            fi
            temp_block_domain="$2"
            shift 2
            ;;
        -s | --script)
            if [[ -z "$2" ]]; then
                log ERROR "未指定本地屏蔽脚本！${ARG_TIP}"
                exit 1
            fi
            local_block_script="$2"
            shift 2
            ;;
        -t | --time)
            if [[ -z "$2" ]]; then
                log ERROR "未指定屏蔽时间！${ARG_TIP}"
                exit 1
            fi
            if ! [[ "$2" =~ ^[0-9]+$ ]]; then
                log ERROR "屏蔽时间必须为数字！请检查输入：${STYLE[HIGHLIGHT]}${2}${STYLE[RESET_HIGHLIGHT]}。"
                exit 1
            fi
            if [[ "$2" -lt 10 ]]; then
                log ERROR "屏蔽时间不推荐小于 10 秒！请检查输入：${STYLE[HIGHLIGHT]}${2}${STYLE[RESET_HIGHLIGHT]}。"
                exit 1
            fi
            temp_block_time="$2"
            shift 2
            ;;
        --log-level)
            if [[ -z "$2" ]]; then
                log ERROR "未指定日志级别！${ARG_TIP}"
                exit 1
            fi
            log_level="$2"
            shift 2
            ;;
        -h | --help)
            show_help
            exit 0
            ;;
        -v | --version)
            echo "${SCRIPT_NAME} 版本 ${SCRIPT_VERSION}"
            echo "${SCRIPT_DESCRIPTION}"
            echo "作者：${SCRIPT_AUTHOR}"
            exit 0
            ;;
        *)
            echo "未知选项：${1}"
            show_help
            exit 1
            ;;
        esac
    done
}

show_help() {
    echo "${SCRIPT_NAME} - ${SCRIPT_DESCRIPTION}"
    echo "版本：${SCRIPT_VERSION}"
    echo "作者：${SCRIPT_AUTHOR}"
    echo "用法：${0} [选项]"
    echo "选项："
    echo "  -n, --name <name>         设置原神进程名称（默认：${genshin_name}）"
    echo "  -l, --launcher <launcher> 设置原神启动文件（默认：${genshin_launcher}）"
    echo "  -d, --domain <domain>     设置要屏蔽的域名（默认：${temp_block_domain}）"
    echo "  -s, --script <script>     设置本地屏蔽脚本（默认：${local_block_script}）"
    echo "  -t, --time <time>         设置屏蔽时间（默认：${temp_block_time} 秒）"
    echo "  --log-level <level>       设置日志级别（默认：${log_level}）"
    echo "  -h, --help                显示此帮助信息"
    echo "  -v, --version             显示脚本版本信息"
}

log() {
    local level="$1"
    local message="$2"
    local timestamp="${STYLE[TIMESTAMP]}【$(date '+%Y-%m-%d %H:%M:%S')】${STYLE[RESET]}"
    local sentence=""
    case "$level" in
    INFO)
        log_num=3
        sentence="${STYLE[INFO]}【INFO】${message}${STYLE[RESET]}"
        ;;
    NOTE)
        log_num=2
        sentence="${STYLE[NOTE]}【NOTE】${message}${STYLE[RESET]}"
        ;;
    SUCCESS)
        log_num=3
        sentence="${STYLE[SUCCESS]}【SUCCESS】${message}${STYLE[RESET]}"
        ;;
    WARN)
        log_num=2
        sentence="${STYLE[WARN]}【WARN】${message}${STYLE[RESET]}"
        ;;
    ERROR)
        log_num=1
        sentence="${STYLE[ERROR]}【ERROR】${message}${STYLE[RESET]}"
        ;;
    DEBUG)
        log_num=4
        sentence="${STYLE[DEBUG]}【DEBUG】${message}${STYLE[RESET]}"
        ;;
    *)
        log_num=0
        sentence="【UNKNOWN】${message}"
        ;;
    esac
    if [[ $log_num -gt $log_level ]]; then
        return
    fi
    echo -e "${timestamp}${SCRIPT_NAME}${sentence}"
}

get_privilege() {
    log INFO "正获取权限：${STYLE[HIGHLIGHT]}sudo${STYLE[RESET_HIGHLIGHT]}……"
    local exit_code=0
    sudo -v 2>/dev/null
    exit_code=$?
    if [[ exit_code -ne 0 ]]; then
        log ERROR "未获取权限！错误代码：${STYLE[HIGHLIGHT]}${exit_code}${STYLE[RESET_HIGHLIGHT]}。"
        exit 1
    fi
    log SUCCESS "已获取权限！"
}

block_domain() {
    if [[ -z "$temp_block_domain" ]]; then
        log ERROR "未设置要屏蔽的域名！"
        exit 14
    fi
    if [[ ${#temp_block_domain} -lt "$DOMAIN_LENGTH_MIN" ]]; then
        log ERROR "屏蔽域名太短！请检查域名：${STYLE[HIGHLIGHT]}${temp_block_domain}${STYLE[RESET_HIGHLIGHT]}。"
        log NOTE "域名至少有 ${STYLE[HIGHLIGHT]}${DOMAIN_LENGTH_MIN}${STYLE[RESET_HIGHLIGHT]} 个字符，如：d.c。"
        exit 14
    fi
    log INFO "正屏蔽域名：${STYLE[HIGHLIGHT]}${temp_block_domain}${STYLE[RESET_HIGHLIGHT]}……"
    log WARN "请在屏蔽域名结束前启动并置顶原神！"
    local exit_code=0
    if [[ -n "$local_block_script" ]]; then
        if [[ ! -f "$local_block_script" ]]; then
            log ERROR "不存在本地屏蔽脚本文件：${STYLE[HIGHLIGHT]}${local_block_script}${STYLE[RESET_HIGHLIGHT]}！"
            exit 18
        fi
        log INFO "正运行本地脚本：${STYLE[HIGHLIGHT]}${local_block_script}${STYLE[RESET_HIGHLIGHT]}。"
        sudo bash ${local_block_script} -d ${temp_block_domain} -t ${temp_block_time} 2>/dev/null
        exit_code=$?
        if [[ exit_code -ne 0 ]]; then
            log ERROR "未运行本地脚本！错误代码：${STYLE[HIGHLIGHT]}${exit_code}${STYLE[RESET_HIGHLIGHT]}。"
            exit 15
        fi
    else
        log INFO "正运行远程脚本：${STYLE[HIGHLIGHT]}${REMOTE_BLOCK_SCRIPT}${STYLE[RESET_HIGHLIGHT]}。"
        curl -sS "$REMOTE_BLOCK_SCRIPT" | sudo bash -s -- -d "$temp_block_domain" -t "$temp_block_time" 2>/dev/null
        exit_code=$?
        if [[ $exit_code -ne 0 ]]; then
            log ERROR "未运行远程脚本！错误代码：${STYLE[HIGHLIGHT]}${exit_code}${STYLE[RESET_HIGHLIGHT]}。"
            exit 19
        fi
    fi
    log SUCCESS "已屏蔽域名！"
    return 12
}

start_genshin() {
    if [[ -z "$genshin_launcher" ]]; then
        log ERROR "未设置原神启动文件！"
        exit 24
    fi
    if [[ ! -f "$genshin_launcher" ]]; then
        log ERROR "不存在原神启动文件：${STYLE[HIGHLIGHT]}${genshin_launcher}${STYLE[RESET_HIGHLIGHT]}！"
        exit 28
    fi
    log INFO "正启动原神：${STYLE[HIGHLIGHT]}${genshin_launcher}${STYLE[RESET_HIGHLIGHT]}……"
    log NOTE "如果原神未启动，请手动启动原神。"
    local exit_code=0
    open "$genshin_launcher" 2>/dev/null
    exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log ERROR "未启动原神！错误代码：${STYLE[HIGHLIGHT]}${exit_code}${STYLE[RESET_HIGHLIGHT]}。"
        log WARN "请尝试手动启动原神！"
        return 25
    fi
    log SUCCESS "已启动原神！"
    return 22
}

front_genshin() {
    if [[ -z "$genshin_name" ]]; then
        log ERROR "未设置原神进程名称！"
        exit 34
    fi
    if [[ ${#genshin_name} -lt "$NAME_LENGTH_MIN" ]]; then
        log ERROR "原神进程名称太短！请检查名称：${STYLE[HIGHLIGHT]}${genshin_name}${STYLE[RESET_HIGHLIGHT]}。"
        log NOTE "名称至少有 ${STYLE[HIGHLIGHT]}${NAME_LENGTH_MIN}${STYLE[RESET_HIGHLIGHT]} 个字符。太短会导致匹配结果过多，若名称本身就短可以尝试添加路径，如：YS 改为 CrossOver/YS。"
        exit 34
    fi
    log INFO "正置顶原神：${STYLE[HIGHLIGHT]}${genshin_name}${STYLE[RESET_HIGHLIGHT]}……"
    log WARN "如果原神未启动，脚本将等待 10 秒直到原神进程出现！"
    log NOTE "如果原神未置顶，请手动置顶原神。"
    local exit_code=0
    local genshin_pid
    local seconds=0
    while [[ -z "$genshin_pid" && "$seconds" -le "$temp_block_time" ]]; do
        log DEBUG "等待原神进程出现，已等待 ${STYLE[HIGHLIGHT]}${seconds}${STYLE[RESET_HIGHLIGHT]} 秒……"
        sleep 1
        genshin_pid=$(pgrep -f "$genshin_name")
        ((seconds++))
    done
    if [[ -z "$genshin_pid" ]]; then
        log ERROR "未找到原神进程！"
        exit 38
    fi
    log DEBUG "原神进程 ID：${STYLE[HIGHLIGHT]}${genshin_pid}${STYLE[RESET_HIGHLIGHT]}。"
    osascript -e "tell application \"System Events\"
      set frontmost of every process whose unix id is ${genshin_pid} to true
      end tell" 2>/dev/null
    exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log ERROR "未置顶原神！错误代码：${STYLE[HIGHLIGHT]}${exit_code}${STYLE[RESET_HIGHLIGHT]}。"
        log WARN "请尝试手动置顶原神！"
        return 35
    fi
    log SUCCESS "已置顶原神！"
    return 32
}

exit_script() {
    local exit_code="$1"
    log DEBUG "进程退出，退出代码：${STYLE[HIGHLIGHT]}${exit_code}${STYLE[RESET_HIGHLIGHT]}。"
    case "$exit_code" in
    0)
        log INFO "脚本正常退出！"
        clean_self
        ;;
    *)
        log ERROR "脚本异常退出！请检查日志。"
        terminate_block_script
        terminate_yuanshen
        clean_self
        ;;
    esac
    log DEBUG "此退出码 ${STYLE[HIGHLIGHT]}${exit_code}${STYLE[RESET_HIGHLIGHT]} 进程已退出。"
}

terminate_block_script() {
    local block_script_pid=$(pgrep -f "$local_block_script")
    if [[ -n "$block_script_pid" ]]; then
        log INFO "正终止屏蔽脚本进程：${STYLE[HIGHLIGHT]}${block_script_pid}${STYLE[RESET_HIGHLIGHT]}……"
        kill "$block_script_pid" 2>/dev/null
        log SUCCESS "已终止屏蔽脚本进程！"
    else
        log INFO "未找到屏蔽脚本进程，无需终止。"
    fi
}

terminate_yuanshen() {
    local genshin_pid=$(pgrep -f "$genshin_launcher")
    if [[ -n "$genshin_pid" ]]; then
        log INFO "正终止原神进程：${STYLE[HIGHLIGHT]}${genshin_pid}${STYLE[RESET_HIGHLIGHT]}……"
        kill "$genshin_pid" 2>/dev/null
        log SUCCESS "已终止原神进程！"
    else
        log INFO "未找到原神进程，无需终止。"
    fi
}

clean_self() {
    log INFO "正清理子进程……"
    pkill -P "$$"
    log SUCCESS "已清理子进程！"
    log INFO "退出脚本！"
    exit 0
}

main() {
    parse_args "$@"

    trap 'exit_script "$?"' EXIT

    get_privilege

    (block_domain) &
    local block_pid=$!
    log DEBUG "已启动屏蔽脚本进程：${STYLE[HIGHLIGHT]}${block_pid}${STYLE[RESET_HIGHLIGHT]}。"
    (sleep 1 && start_genshin) &
    local start_pid=$!
    log DEBUG "已启动启动脚本进程：${STYLE[HIGHLIGHT]}${start_pid}${STYLE[RESET_HIGHLIGHT]}。"
    (sleep 5 && front_genshin) &
    local front_pid=$!
    log DEBUG "已启动置顶脚本进程：${STYLE[HIGHLIGHT]}${front_pid}${STYLE[RESET_HIGHLIGHT]}。"

    while kill -0 "$block_pid" 2>/dev/null ||
        kill -0 "$start_pid" 2>/dev/null ||
        kill -0 "$front_pid" 2>/dev/null; do
        log DEBUG "屏蔽进程状态：${STYLE[HIGHLIGHT]}${block_pid}${STYLE[RESET_HIGHLIGHT]} → ${STYLE[HIGHLIGHT]}$(ps -p ${block_pid} >/dev/null && echo 运行中 || echo 已结束)${STYLE[RESET_HIGHLIGHT]}"
        log DEBUG "启动进程状态：${STYLE[HIGHLIGHT]}${start_pid}${STYLE[RESET_HIGHLIGHT]} → ${STYLE[HIGHLIGHT]}$(ps -p ${start_pid} >/dev/null && echo 运行中 || echo 已结束)${STYLE[RESET_HIGHLIGHT]}"
        log DEBUG "置顶进程状态：${STYLE[HIGHLIGHT]}${front_pid}${STYLE[RESET_HIGHLIGHT]} → ${STYLE[HIGHLIGHT]}$(ps -p ${front_pid} >/dev/null && echo 运行中 || echo 已结束)${STYLE[RESET_HIGHLIGHT]}"
        sleep 1
    done

    log DEBUG "所有子进程已结束。"
}

main "$@"
