#!/usr/bin/env bash
# 搭建本地测试目录（模拟服务器结构，覆盖所有文件名类型）
set -u
BASE="/tmp/mo_test/种子"
mkdir -p "$BASE/视频/剧集/动画/合集" "$BASE/视频/电影/动画" "$BASE/视频/音乐"

# ---------- 剧集域 ----------
TV="$BASE/视频/剧集/动画/合集"
# 一部典型剧集：正片 + SPs 特典 + CDs 音乐 + Scans
SHOW="$TV/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Ma10p_1080p]"
mkdir -p "$SHOW" "$SHOW/SPs" "$SHOW/CDs" "$SHOW/Scans" "$SHOW/Fonts"
# 正片：S##E## 格式
touch "$SHOW/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Ma10p_1080p] S01E01.mkv"
touch "$SHOW/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Ma10p_1080p] S01E01.zh.ass"
touch "$SHOW/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Ma10p_1080p] S01E01.zh-tw.ass"
touch "$SHOW/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Ma10p_1080p] S01E02.mkv"
# 正片：#x## 格式
touch "$SHOW/Some Show 1x03.mkv"
# 正片：[数字] 格式
touch "$SHOW/[VCB-Studio] Ore no Imoto II [13][Hi10p_1080p][x264_flac].mkv"
# 正片：N Season 格式
touch "$SHOW/[Nekomoe kissaten&VCB-Studio] Show Name 2nd Season [Ma10p_1080p].mkv"
# 电影格式（剧集目录里的剧场版）
touch "$SHOW/[VCB-Studio] Some Movie (2010).mkv"

# SPs 特典（各种类型）
SP="$SHOW/SPs"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Menu01][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Menu01_1][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [PV01][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [NCED01][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [NCED03_EP][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [NCOP01][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [CM01][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [CM Collection][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Preview01][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Preview23-24v][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Web Preview 01][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Mini Anime 01][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Sword Art Offline 01][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [SP01_][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [SP02_MMR][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Character PV 01][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Teaser][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Picture Drama 01][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [IV][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Trailer01][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Tralier01][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Program01][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [OVA][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [WebRadio01v][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [TV-SPOT][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Special ED][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [PV Collection][Ma10p_1080p][x265_flac].mkv"
touch "$SP/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [S2 Announcement][Ma10p_1080p][x265_flac].mkv"
# 裸特典（无方括号，靠 SPs 父目录识别）
touch "$SP/CM01.mkv"
touch "$SP/CM02.mkv"
touch "$SP/｢Anytime Anywhere｣ Special MV.mkv"
touch "$SP/TV Anime MV.mkv"

# CDs 音乐
CD="$SHOW/CDs"
mkdir -p "$CD/[250110] ｢幸せのレシピ｣／平井大 [24bit_48kHz] (flac)"
touch "$CD/[250110] ｢幸せのレシピ｣／平井大 [24bit_48kHz] (flac)/01. 幸せのレシピ.flac"
mkdir -p "$CD/[250917] ORIGINAL SOUNDTRACK (flac+webp)/THCA-60298-1"
touch "$CD/[250917] ORIGINAL SOUNDTRACK (flac+webp)/THCA-60298-1/01. 薬屋の娘.flac"
touch "$CD/[250917] ORIGINAL SOUNDTRACK (flac+webp)/THCA-60298-1/02. Hi (ごきげんよう).flac"
# Scans / Fonts（应被忽略，不在 VIDEO_EXTS）
touch "$SHOW/Scans/01.webp" "$SHOW/Scans/02.webp"
touch "$SHOW/Fonts/[Nekomoe kissaten&VCB-Studio] Kusuriya no Hitorigoto [Fonts].7z"

# 另一部剧：SP 特典带括号内空格（Web Preview 等）
SHOW2="$TV/[VCB-Studio] Sword Art Online [Ma10p_1080p]"
mkdir -p "$SHOW2" "$SHOW2/SPs"
touch "$SHOW2/[VCB-Studio] Sword Art Online [Ma10p_1080p]/[VCB-Studio] Sword Art Online [01][Ma10p_1080p][x265_flac].mkv"
touch "$SHOW2/SPs/[VCB-Studio] Sword Art Online [Preview02][Ma10p_1080p][x265_flac].mkv"
touch "$SHOW2/SPs/[VCB-Studio] Sword Art Online [Event01][Ma10p_1080p][x265_aac].mkv"

# ---------- 电影域 ----------
MV="$BASE/视频/电影/动画"
MV1="$MV/[DMG&VCB-Studio] Sword Art Online Progressive - Hoshinaki Yoru no Aria [Ma10p_1080p]"
mkdir -p "$MV1" "$MV1/SPs" "$MV1/CDs" "$MV1/Scans"
# 正片 + 伴随
touch "$MV1/[DMG&VCB-Studio] Sword Art Online Progressive - Hoshinaki Yoru no Aria [Ma10p_1080p][x265_flac].mkv"
touch "$MV1/[DMG&VCB-Studio] Sword Art Online Progressive - Hoshinaki Yoru no Aria [Ma10p_1080p][x265_flac].mka"
touch "$MV1/[DMG&VCB-Studio] Sword Art Online Progressive - Hoshinaki Yoru no Aria [Ma10p_1080p][x265_flac].sc.ass"
touch "$MV1/[DMG&VCB-Studio] Sword Art Online Progressive - Hoshinaki Yoru no Aria [Ma10p_1080p][x265_flac].tc.ass"
# 电影特典（应跳过）
touch "$MV1/SPs/[DMG&VCB-Studio] Sword Art Online Progressive - Hoshinaki Yoru no Aria [Menu01][Ma10p_1080p][x265_flac].mkv"
touch "$MV1/SPs/[DMG&VCB-Studio] Sword Art Online Progressive - Hoshinaki Yoru no Aria [CM01][Ma10p_1080p][x265_flac].mkv"
touch "$MV1/SPs/[DMG&VCB-Studio] Sword Art Online Progressive - Hoshinaki Yoru no Aria [SP][Ma10p_1080p][x265_aac].mkv"
touch "$MV1/SPs/[DMG&VCB-Studio] Sword Art Online Progressive - Hoshinaki Yoru no Aria [Inside Stories '22 Part 1][Ma10p_1080p][x265_aac].mkv"
touch "$MV1/SPs/[DMG&VCB-Studio] Sword Art Online Progressive - Hoshinaki Yoru no Aria [Teaser Notice][Ma10p_1080p][x265_flac].mkv"
touch "$MV1/SPs/[DMG&VCB-Studio] Sword Art Online Progressive - Hoshinaki Yoru no Aria [Tralier01][Ma10p_1080p][x265_flac].mkv"
# 电影 CDs 音乐（应归 Music）
mkdir -p "$MV1/CDs/[200226] ｢final phase｣／fripSide (flac+webp+mkv)"
touch "$MV1/CDs/[200226] ｢final phase｣／fripSide (flac+webp+mkv)/01. final phase.flac"
# Scans
touch "$MV1/Scans/01.webp"

# 另一部电影（2160p）
MV2="$MV/[VCB-Studio] Sword Art Online -Ordinal Scale- [Ma10p_2160p]"
mkdir -p "$MV2" "$MV2/SPs"
touch "$MV2/[VCB-Studio] Sword Art Online -Ordinal Scale- [Ma10p_2160p][x265_flac].mkv"
touch "$MV2/SPs/[VCB-Studio] Sword Art Online -Ordinal Scale- [Menu][Ma10p_2160p_SDR][x265_flac].mkv"
touch "$MV2/SPs/[VCB-Studio] Sword Art Online -Ordinal Scale- [Menu][Ma10p_2160p_DoVi_P8.1][x265_flac].mkv"

# ---------- 未知域（识别不出 → AI） ----------
mkdir -p "$BASE/随便"
touch "$BASE/随便/奇怪名字.mkv"

echo "=== 本地测试目录搭建完成 ==="
find "$BASE" -type f | wc -l
echo "个文件"
