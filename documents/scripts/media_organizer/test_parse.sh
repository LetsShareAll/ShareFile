#!/usr/bin/env bash
# 本地加速测试 v2：视频喂 parse（模拟 VIDEO_FILES），flac 单独走 process_audio（Music）
set -uo pipefail
D="/home/shuery/Developer/LetsShareAll/ShareFile/documents/scripts/media_organizer"
TMP_SRC=$(mktemp)
grep -v '^main "\$@"$' "$D/media_organizer.sh" > "$TMP_SRC"
CACHE_DIR="$D/.tmp_t2"; TMDB_LANG=zh-CN; COLOR_OUTPUT=false; DEBUG_LEVEL=0; LOG_FILE=""; AUTOMATED=false; DRY_RUN=true
DESTINATION_DIR="/tmp/mo_test/out"
MEDIA_WORKERS=2; FOLDER_MOVIES=Movies; FOLDER_SHOWS=Shows; FOLDER_MUSIC=Music; FOLDER_UNKNOWN=Unknown
_log(){ :; }; curl(){ echo '{}'; }
source "$TMP_SRC"

echo "===== ① 视频文件 parse 识别（模拟 VIDEO_FILES） ====="
declare -A COUNT
while IFS= read -r f; do
  info=$(parse_media_filename "$f")
  IFS='|' read -r type title year season ep ep_end frag <<<"$info"
  COUNT["$type"]=$(( ${COUNT["$type"]:-0} + 1 ))
  printf '%-7s S=%-2s E=%-3s frag=%-22s %s\n' "$type" "${season:-}" "${ep:-}" "${frag:-}" "$(basename "$f")"
done < <(find /tmp/mo_test/种子 -type f \( -name "*.mkv" -o -name "*.mp4" -o -name "*.mka" \) -print0 | while IFS= read -r -d '' x; do echo "$x"; done)
echo "--- 视频类型统计 ---"
for t in movie tv skip unknown; do echo "  $t: ${COUNT[$t]:-0}"; done

echo ""
echo "===== ② 音频 process_audio（模拟 AUDIO_FILES → Music） ====="
AUDIO_FILES=()
while IFS= read -r -d '' x; do AUDIO_FILES+=("$x"); done < <(find /tmp/mo_test/种子 -type f \( -name "*.flac" -o -name "*.mp3" \) -print0)
echo "音频文件数: ${#AUDIO_FILES[@]}"
process_audio 2>/dev/null
for k in "${!MEDIA_DESTINATION_MAP[@]}"; do
  if [[ "$k" == *.flac || "$k" == *.mp3 ]]; then
    echo "  $k -> ${MEDIA_DESTINATION_MAP[$k]}"
  fi
done
rm -rf "$TMP_SRC" "$CACHE_DIR"
