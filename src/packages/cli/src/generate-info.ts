#!/usr/bin/env node

/**
 * @fileoverview 递归生成或更新目录下 `._info.json` 文件的 CLI 工具。
 * 支持通过 Git 提取时间戳、计算文件哈希、自动精简与格式化 JSON 结构。
 */

import { execFile } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';

import {
  DirectoryNode,
  FileNode,
  HoldInfo,
  InfoFile,
  SelfInfo,
  VirtualDirectoryNode,
  VirtualFileNode,
  getNodeMountSource,
} from '@share-file/types';
import {
  Logger,
  getErrorMessage,
  readInfoFileAsync,
} from '@share-file/types/logger';

import {
  getBoolean,
  getConfigSection,
  getString,
  getStringArray,
  loadJsonConfig,
  resolveConfigPath,
} from './utils/config';

const execFileAsync = promisify(execFile);

// ────────────── 日志系统扩展 ──────────────

/**
 * 信息生成器专属的扩展日志记录类。
 * 继承自基础 Logger，额外提供具体的节点扫描统计和执行摘要打印能力。
 */
class GenInfoLogger extends Logger {
  /** 收集执行过程中各类节点的状态变更计数。 */
  public stats = {
    processedFiles: 0,
    processedFolders: 0,
    virtualNodes: 0,
    removed: 0,
    skipped: 0,
  };

  /**
   * 将当前收集到的全部统计数据以高亮格式打印到终端。
   */
  printSummary(): void {
    console.log('\n\x1b[1m\x1b[36m=== 生成执行摘要 ===\x1b[0m');
    console.log(`⏱️  总计耗时: \x1b[33m${this.getElapsedSeconds()} s\x1b[0m`);
    console.log(`📄 处理文件: \x1b[32m${this.stats.processedFiles}\x1b[0m`);
    console.log(`📁 处理目录: \x1b[32m${this.stats.processedFolders}\x1b[0m`);
    console.log(`👻 虚拟节点: \x1b[36m${this.stats.virtualNodes}\x1b[0m`);
    console.log(`🧹 清理节点: \x1b[31m${this.stats.removed}\x1b[0m`);
    console.log(`⏭️  跳过扫描: \x1b[90m${this.stats.skipped}\x1b[0m\n`);
  }
}

// ────────────── 接口配置与常量 ──────────────

/**
 * 命令行与配置文件解析合并后得到的最终生成选项。
 */
interface GenerateOptions {
  /** 目标扫描起始目录的绝对或相对路径。 */
  dirPath: string;
  /** 是否移除已不存在于物理磁盘上的失效节点（保留虚拟节点）。 */
  clean: boolean;
  /** 是否一并移除物理存在，但命中了忽略规则配置的节点。 */
  cleanIgnored: boolean;
  /** 是否清理文件夹节点上的非法冗余字段（如目录不需要 file 独有的 size 和 md5）。 */
  purify: boolean;
  /** 是否在序列化为 JSON 之前，按照预设顺序重排对象的键名顺序。 */
  format: boolean;
  /** 是否自动读取文件内容并计算 MD5 和 SHA256 哈希值。 */
  computeHash: boolean;
  /** 是否利用 Git log 历史记录推断节点的创建和更新时间。 */
  useGitTime: boolean;
  /** 是否自动读取系统文件体积信息并更新至节点配置中。 */
  updateSize: boolean;
  /** 用户从命令行或配置文件传入的附加正则表达式忽略列表。 */
  extraIgnorePatterns: string[];
  /** 是否启用调试模式并输出详细的步骤日志。 */
  verbose: boolean;
  /** 是否显式启用全局默认的同步整合模式。 */
  sync: boolean;
  /** 是否无视节点数据上的 `hold` 锁定规则，强制覆写所有的自动化生成字段。 */
  force: boolean;
  /** 是否仅执行计算并预览 JSON 结果，不产生任何实际的文件系统写入操作。 */
  dryRun: boolean;
  /** 是否递归处理目标目录下的所有子目录树。 */
  recursive: boolean;
  /** 如果指定，所有的元数据将输出到此特定文件而非每个目录下的 `._info.json`。 */
  outputFile?: string;
}

/** * 全局默认需要跳过扫描的目录和文件正则表达式列表。
 */
const DEFAULT_IGNORE_PATTERNS: RegExp[] = [
  /^\.claude$/,
  /^\.DS_Store$/,
  /^\.eslintrc\.json$/,
  /^\.git$/,
  /^\.github$/,
  /^\.gitignore$/,
  /^\.prettierrc$/,
  /^\.tmp$/i,
  /^.*\.html?$/,
  /^assets$/,
  /^dist$/,
  /^eslint\.config\.(js|cjs|mjs)$/,
  /^LICENSE$/,
  /^node_modules$/,
  /^package-lock\.json$/,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^prettier\.config\.mjs$/,
  /^tsconfig\.json$/,
  /^vite\.config\.ts$/,
  /~$/,
];

/** * 通过扩展名推导文件默认描述文本的静态映射表。
 */
const DEFAULT_DESCRIPTION_MAP: Record<string, string> = {
  '.txt': '纯文本文件',
  '.md': 'Markdown 文档',
  '.rtf': '富文本格式文档',
  '.pdf': 'PDF 文档',
  '.doc': 'Microsoft Word 文档',
  '.docx': 'Microsoft Word 文档',
  '.xls': 'Microsoft Excel 工作表',
  '.xlsx': 'Microsoft Excel 工作表',
  '.ppt': 'Microsoft PowerPoint 演示文稿',
  '.pptx': 'Microsoft PowerPoint 演示文稿',
  '.csv': '逗号分隔值文件',
  '.log': '日志文件',
  '.html': 'HTML 网页文件',
  '.htm': 'HTML 网页文件',
  '.css': '层叠样式表',
  '.js': 'JavaScript 脚本',
  '.mjs': 'JavaScript 模块',
  '.ts': 'TypeScript 脚本',
  '.json': 'JSON 数据文件',
  '.xml': 'XML 数据文件',
  '.php': 'PHP 脚本',
  '.jpg': 'JPEG 图像',
  '.jpeg': 'JPEG 图像',
  '.png': 'PNG 图像',
  '.gif': 'GIF 图像',
  '.bmp': 'BMP 位图图像',
  '.svg': 'SVG 矢量图形',
  '.ico': '图标文件',
  '.webp': 'WebP 图像',
  '.tif': 'TIFF 图像',
  '.tiff': 'TIFF 图像',
  '.mp3': 'MP3 音频',
  '.wav': 'WAV 音频',
  '.flac': 'FLAC 无损音频',
  '.aac': 'AAC 音频',
  '.ogg': 'OGG 音频',
  '.wma': 'Windows Media 音频',
  '.mid': 'MIDI 音乐',
  '.midi': 'MIDI 音乐',
  '.mp4': 'MP4 视频',
  '.avi': 'AVI 视频',
  '.mkv': 'MKV 视频',
  '.mov': 'QuickTime 视频',
  '.wmv': 'Windows Media 视频',
  '.flv': 'Flash 视频',
  '.webm': 'WebM 视频',
  '.zip': 'ZIP 压缩包',
  '.rar': 'RAR 压缩包',
  '.7z': '7-Zip 压缩包',
  '.gz': 'GZip 压缩文件',
  '.bz2': 'BZip2 压缩文件',
  '.xz': 'XZ 压缩文件',
  '.tar': 'TAR 归档文件',
  '.tar.gz': '源代码压缩包',
  '.tgz': '源代码压缩包',
  '.tar.bz2': 'BZip2 压缩归档',
  '.tar.xz': 'XZ 压缩归档',
  '.exe': 'Windows 可执行程序',
  '.msi': 'Windows 安装包',
  '.appx': 'Windows 应用商店包',
  '.bat': '批处理脚本',
  '.sh': 'Shell 脚本',
  '.ps1': 'PowerShell 脚本',
  '.apk': 'Android 安装包',
  '.jar': 'Java 归档文件',
  '.py': 'Python 脚本',
  '.java': 'Java 源文件',
  '.c': 'C 语言源文件',
  '.cpp': 'C++ 源文件',
  '.h': 'C/C++ 头文件',
  '.go': 'Go 源文件',
  '.rs': 'Rust 源文件',
  '.swift': 'Swift 源文件',
  '.kt': 'Kotlin 源文件',
  '.rb': 'Ruby 脚本',
  '.lua': 'Lua 脚本',
  '.sql': 'SQL 脚本',
  '.yaml': 'YAML 配置文件',
  '.yml': 'YAML 配置文件',
  '.toml': 'TOML 配置文件',
  '.ini': 'INI 配置文件',
  '.env': '环境变量文件',
  '.dockerfile': 'Docker 构建文件',
  '.ttf': 'TrueType 字体',
  '.otf': 'OpenType 字体',
  '.woff': 'Web 开放字体',
  '.woff2': 'Web 开放字体',
  '.iso': '光盘镜像文件',
  '.dmg': 'macOS 磁盘映像',
  '.torrent': 'BitTorrent 种子文件',
  '.db': '数据库文件',
  '.sqlite': 'SQLite 数据库',
  '.epub': '电子书（EPUB 格式）',
  '.mobi': '电子书（Mobi 格式）',
};

/** * 对象序列化时，基础共享字段期望被排列的首选顺序。
 */
const BASE_FIELD_ORDER = [
  'type',
  'description',
  'hidden',
  'redirect',
  'hold',
  'created_at',
  'updated_at',
] as const;

/** * 对象序列化时，目录特有字段期望被排列的首选顺序（接续在基础字段后）。
 */
const DIRECTORY_SPECIFIC_FIELD_ORDER = ['mount_source'] as const;

/** * 对象序列化时，文件特有字段期望被排列的首选顺序（接续在基础字段后）。
 */
const FILE_SPECIFIC_FIELD_ORDER = ['version', 'size', 'md5', 'sha256'] as const;

// ────────────── 核心工具函数 ──────────────

/**
 * 打印该 CLI 工具的帮助信息和用法指南到标准输出。
 */
function printHelp(): void {
  console.log(`
用法: generate-info [目录] [选项]

生成或更新 ._info.json 文件。
注意：默认情况下（即 sync 模式），脚本会递归处理所有子目录。
      若只需处理单个目录，请使用 --no-recursive 禁用。

模式选项:
  --sync              显式启用默认同步模式（默认行为）
  --force             忽略所有 hold 锁定，强制更新自动字段
  --dry-run           仅计算并预览将要生成的 JSON，不实际写入

更新控制:
  --no-hash           不计算 MD5/SHA256 哈希值
  --no-git            不从 Git 历史获取时间戳
  --no-size           不更新文件大小

清理与格式化:
  --no-clean          不移除失效的物理节点
  --no-clean-ignored  不移除物理存在但被忽略规则匹配的节点
  --no-purify         不精简文件夹节点的冗余字段（如 size, md5）
  --no-format         不排序字段顺序

忽略规则:
  --ignore <re>       添加额外的忽略正则表达式（可多次使用）

输出控制:
  --output <file>     将生成的 JSON 输出到指定文件（默认 ._info.json）
  --verbose           输出详细调试日志

递归控制:
  --recursive         递归处理所有子目录（默认启用）
  --no-recursive      禁用递归处理

配置文件:
  --config <file>     从指定的 JSON 配置文件加载选项

其他:
  --help, -h          显示此帮助信息
  --version, -v       显示版本号
`);
}

/**
 * 异步检查指定目录中是否存在某个具有实际物理载体（文件或目录）的实体。
 *
 * @param name 待检测的实体名称。
 * @param dirPath 实体所在的父目录路径。
 * @returns 当实体物理存在且有效时返回 true，否则返回 false。
 */
async function hasPhysicalEntityAsync(
  name: string,
  dirPath: string,
): Promise<boolean> {
  try {
    const stat = await fsp.stat(path.join(dirPath, name));
    return stat.isFile() || stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 评估给定的节点对象是否是一个虚拟节点（包含 redirect 或 mount_source 配置）。
 *
 * @param node 需要判定的节点对象。
 * @returns 包含 redirect 或 mount_source 属性时返回 true，否则 false。
 */
function isVirtualNode(node?: FileNode | DirectoryNode): boolean {
  if (!node) return false;
  return node.redirect !== undefined || getNodeMountSource(node) !== undefined;
}

/**
 * 结合文件系统的物理状态和输入节点状态，异步解析节点的实际类型。
 *
 * @param name 节点名称。
 * @param node 保留的旧节点配置（在物理路径失效时可提供虚拟退路）。
 * @param dirPath 节点所处的父级绝对目录路径。
 * @returns 'file' 或 'folder' 字符串，若无法确认类型则返回 undefined。
 */
async function resolveNodeTypeAsync(
  name: string,
  node?: FileNode | DirectoryNode,
  dirPath?: string,
): Promise<'file' | 'folder' | undefined> {
  if (dirPath) {
    try {
      const stat = await fsp.stat(path.join(dirPath, name));
      if (stat.isDirectory()) return 'folder';
      if (stat.isFile()) return 'file';
    } catch {
      // 若抛出异常说明物理节点不存在，继续下降尝试虚拟节点的匹配逻辑
    }
  }

  if (
    isVirtualNode(node) &&
    (node?.type === 'file' || node?.type === 'folder')
  ) {
    return node.type;
  }

  return undefined;
}

/**
 * 提取文件名的完整或复合扩展名，并尽可能匹配字典中的映射键（如 `.tar.gz`）。
 *
 * @param fileName 需要解析的完整文件名。
 * @returns 匹配的后缀名字符串（包含先导点号）。
 */
function extractFullExtension(fileName: string): string {
  const lowerName = fileName.toLowerCase();
  const sortedExtensions = Object.keys(DEFAULT_DESCRIPTION_MAP).sort(
    (a, b) => b.length - a.length,
  );

  for (const ext of sortedExtensions) {
    if (lowerName.endsWith(ext)) {
      return ext;
    }
  }

  return path.extname(lowerName);
}

/**
 * 根据文件命名习惯（如前置点号或波浪线），判断该节点是否应被缺省设为隐藏。
 *
 * @param name 待判断的节点名称。
 * @returns 应隐藏则返回 true。
 */
function isHiddenByDefault(name: string): boolean {
  return (
    name.startsWith('.') ||
    name.endsWith('~') ||
    name === 'Thumbs.db' ||
    name === 'desktop.ini'
  );
}

/**
 * 根据节点名和类别类型，利用预置字典或名称转化自动推导出一个适当的描述文案。
 *
 * @param name 节点的名称。
 * @param type 节点的类别角色（'file', 'folder', 或 'self'）。
 * @returns 推导得出的说明文字。
 */
function getDefaultDescription(
  name: string,
  type: 'file' | 'folder' | 'self',
): string {
  if (type === 'self') return '当前目录';
  if (type === 'folder') return '文件夹';

  const ext = extractFullExtension(name);

  if (ext && DEFAULT_DESCRIPTION_MAP[ext]) {
    return DEFAULT_DESCRIPTION_MAP[ext];
  }

  if (ext) {
    return `${ext.slice(1).toUpperCase()} 文件`;
  }

  return '文件';
}

/**
 * 尝试通过调用 Git 客户端，寻找指定路径所在的 Git 仓库的根目录。
 * 用于限制 `git log` 命令的执行域，以此大幅提升历史追踪速度。
 *
 * @param dirPath 正在处理的本地目录绝对路径。
 * @param logger 记录当前任务状态的日志实例。
 * @returns Git 根目录路径，若该项目非 Git 管理库则返回 undefined。
 */
async function getGitRootAsync(
  dirPath: string,
  logger: GenInfoLogger,
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--show-toplevel'],
      { cwd: dirPath, encoding: 'utf-8' },
    );
    return stdout.trim();
  } catch {
    logger.debug(`未检测到 Git 仓库或解析失败: ${dirPath}`);
    return undefined;
  }
}

/**
 * 使用本地 Git 客户端追溯特定文件的生命周期时间戳信息。
 * 包含首次入库提交时间 (created_at) 及最近一次修改提交时间 (updated_at)。
 *
 * @param fullPath 该文件的完整系统路径。
 * @param gitRoot 归属仓库的根路径缓存，提升查询寻址速度。
 * @param logger 记录状态的日志实例。
 * @returns 包含两个时间戳字符串的对象。若非纳入版本控制的文件则返回 undefined。
 */
async function getFileTimestampsFromGitAsync(
  fullPath: string,
  gitRoot: string | undefined,
  logger: GenInfoLogger,
): Promise<{ created_at?: string; updated_at?: string } | undefined> {
  if (!gitRoot) return undefined;

  const relativePath = path.relative(gitRoot, fullPath);
  const timestampToISO = (ts: number): string =>
    new Date(ts * 1000).toISOString();

  let gitCreatedAt: string | undefined;
  let gitUpdatedAt: string | undefined;

  logger.debug(`获取 Git 时间戳: ${relativePath}`);

  try {
    await execFileAsync('git', ['ls-files', '--error-unmatch', relativePath], {
      cwd: gitRoot,
      encoding: 'utf-8',
    });
  } catch {
    return undefined; // 文件未被 Git 追踪
  }

  try {
    const { stdout: createdOut } = await execFileAsync(
      'git',
      [
        'log',
        '--format=%ct',
        '--diff-filter=A',
        '--follow',
        '--',
        relativePath,
      ],
      { cwd: gitRoot, encoding: 'utf-8' },
    );

    if (createdOut.trim()) {
      const lines = createdOut.trim().split('\n');
      const ts = parseInt(lines[lines.length - 1], 10);
      if (!isNaN(ts)) gitCreatedAt = timestampToISO(ts);
    }

    const { stdout: updatedOut } = await execFileAsync(
      'git',
      ['log', '-1', '--format=%ct', '--follow', '--', relativePath],
      { cwd: gitRoot, encoding: 'utf-8' },
    );

    if (updatedOut.trim()) {
      const ts = parseInt(updatedOut.trim(), 10);
      if (!isNaN(ts)) gitUpdatedAt = timestampToISO(ts);
    }
  } catch (error) {
    logger.debug(`Git 记录获取失败 ${relativePath}: ${getErrorMessage(error)}`);
  }

  if (!gitCreatedAt && !gitUpdatedAt) return undefined;
  return { created_at: gitCreatedAt, updated_at: gitUpdatedAt };
}

/**
 * 采用流式数据传输对大型文件进行哈希值安全计算，杜绝单次读取大文件引发的 OOM。
 *
 * @param algorithm 使用的摘要算法（例如 'md5' 或 'sha256'）。
 * @param fullPath 需要读取并计算的本地物理文件路径。
 * @param logger 用于在计算发生错误时发出警告的日志记录器。
 * @returns 摘要计算完成后的十六进制哈希字符串，发生读取异常时返回 undefined。
 */
async function computeFileHashAsync(
  algorithm: string,
  fullPath: string,
  logger: GenInfoLogger,
): Promise<string | undefined> {
  return new Promise(resolve => {
    logger.debug(`计算哈希 (${algorithm}): ${fullPath}`);
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(fullPath);

    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', err => {
      logger.warn(`计算 ${algorithm} 失败 ${fullPath}: ${err.message}`);
      resolve(undefined);
    });
  });
}

/**
 * 检测特定的子字段是否在用户的数据配置中处于被锁定（防覆写）状态。
 *
 * @param hold 取自 JSON 数据中的 hold 属性，可以是布尔开关，或者是对象开关集。
 * @param field 当前想要探究锁状态的特定字段键名（如 'size', 'hash' 等）。
 * @returns 若该字段被明确保护则返回 true，否则 false。
 */
function isFieldLocked(
  hold: boolean | HoldInfo | undefined,
  field: keyof HoldInfo,
): boolean {
  if (hold === undefined) return false;
  if (typeof hold === 'boolean') return hold;
  return hold[field] === true;
}

// ────────────── 配置加载与核心逻辑 ──────────────

/**
 * 扫描传入的绝对目录路径，将未被忽略正则拦截的节点构建为内存字典。
 *
 * @param dirPath 进行内容探索和扫描的目标目录。
 * @param ignorePatterns 系统默认提供的需过滤的黑名单匹配规则正则集合。
 * @param ignorePathPatterns 用户通过参数或配置注入的路径拦截正则过滤集合。
 * @param logger 日志实例，用于统计和反馈。
 * @returns 以文件/目录名称作为键，初步生成的节点状态属性作为值的字典记录。
 */
async function scanDirectoryAsync(
  dirPath: string,
  ignorePatterns: RegExp[],
  ignorePathPatterns: RegExp[],
  logger: GenInfoLogger,
): Promise<Record<string, FileNode | DirectoryNode>> {
  const childNames = await fsp.readdir(dirPath);
  const childrenMap: Record<string, FileNode | DirectoryNode> = {};

  for (const name of childNames) {
    if (name === '._info.json') continue;

    if (ignorePatterns.some(p => p.test(name))) {
      logger.debug(`跳过扫描 (正则匹配): ${name}`);
      logger.stats.skipped++;
      continue;
    }

    if (ignorePathPatterns.length > 0) {
      const fullPath = path.join(dirPath, name);

      if (ignorePathPatterns.some(p => p.test(name) || p.test(fullPath))) {
        logger.debug(`跳过扫描 (路径正则): ${fullPath}`);
        logger.stats.skipped++;
        continue;
      }
    }

    const type = await resolveNodeTypeAsync(name, undefined, dirPath);

    if (type === 'folder') {
      childrenMap[name] = {
        type: 'folder',
        ...(isHiddenByDefault(name) && { hidden: true }),
      };
    } else if (type === 'file') {
      childrenMap[name] = {
        type: 'file',
        ...(isHiddenByDefault(name) && { hidden: true }),
      };
    }
  }

  return childrenMap;
}

/**
 * 执行文件类型节点从多个来源（新扫描和老配置）的深度混合和覆写合并，
 * 负责触发诸如尺寸计算和哈希散列等可能繁重的任务。
 *
 * @param name 被合并的文件节点全名。
 * @param existingNode 从存量配置中取回的老节点信息（如果有的话）。
 * @param dirPath 该节点隶属的父级目录位置。
 * @param options 执行时传递的命令行配置开关集合。
 * @param gitRoot 计算 Git 时间所需的相对仓库根目录基点。
 * @param logger 负责统计及日志警告的反馈器。
 * @returns 经过处理并融合各项数据最终得出的一致性文件节点对象。
 */
async function mergeFileNodeAsync(
  name: string,
  existingNode: FileNode | DirectoryNode | undefined,
  dirPath: string,
  options: GenerateOptions,
  gitRoot: string | undefined,
  logger: GenInfoLogger,
): Promise<FileNode> {
  const fullPath = path.join(dirPath, name);
  const oldNode =
    (await resolveNodeTypeAsync(name, existingNode, dirPath)) === 'file'
      ? (existingNode as FileNode)
      : undefined;

  let newSize: number | undefined;

  if (options.updateSize) {
    try {
      const stat = await fsp.stat(fullPath);
      newSize = stat.size;
    } catch {
      logger.debug(`读取文件大小失败: ${fullPath}`);
    }
  }

  const force = options.force;
  const newMd5 =
    options.computeHash && (force || !isFieldLocked(oldNode?.hold, 'hash'))
      ? await computeFileHashAsync('md5', fullPath, logger)
      : oldNode?.md5;

  const newSha256 =
    options.computeHash && (force || !isFieldLocked(oldNode?.hold, 'hash'))
      ? await computeFileHashAsync('sha256', fullPath, logger)
      : oldNode?.sha256;

  const gitTimestamps = options.useGitTime
    ? await getFileTimestampsFromGitAsync(fullPath, gitRoot, logger)
    : undefined;

  const determineCreatedAt = (): string | undefined => {
    if (force && gitTimestamps?.created_at) return gitTimestamps.created_at;
    if (isFieldLocked(oldNode?.hold, 'created_at') && oldNode?.created_at)
      return oldNode.created_at;

    if (gitTimestamps?.created_at && oldNode?.created_at) {
      return oldNode.created_at < gitTimestamps.created_at
        ? oldNode.created_at
        : gitTimestamps.created_at;
    }

    return gitTimestamps?.created_at || oldNode?.created_at;
  };

  return {
    type: 'file',
    description: oldNode?.description ?? getDefaultDescription(name, 'file'),
    ...(oldNode?.hidden !== undefined
      ? { hidden: oldNode.hidden }
      : isHiddenByDefault(name)
        ? { hidden: true }
        : {}),
    ...(oldNode?.hold && { hold: oldNode.hold }),
    ...(oldNode?.version && { version: oldNode.version }),
    ...(newSize !== undefined
      ? { size: newSize }
      : oldNode?.size !== undefined
        ? { size: oldNode.size }
        : {}),
    ...(newMd5 !== undefined ? { md5: newMd5 } : {}),
    ...(newSha256 !== undefined ? { sha256: newSha256 } : {}),
    ...(determineCreatedAt() ? { created_at: determineCreatedAt() } : {}),
    ...(gitTimestamps?.updated_at &&
    (force || !isFieldLocked(oldNode?.hold, 'updated_at'))
      ? { updated_at: gitTimestamps.updated_at }
      : oldNode?.updated_at
        ? { updated_at: oldNode.updated_at }
        : {}),
  };
}

/**
 * 重建给定的基础数据结构对象，以确保最终输出的 JSON 在键名排序上具有整齐、一致的美观度。
 *
 * @template T 受到保护的入参字典对象的数据类型。
 * @param obj 承载乱序原始键值的属性对象。
 * @param order 希望对象遵循的新强制字段顺序排列名单参考。
 * @returns 返回一个符合指定名单顺序、对多余键自动附加在后方的新对象。
 */
function reorderFields<T extends object>(
  obj: T,
  order: readonly string[],
): Partial<T> {
  const result: Record<string, unknown> = {};

  for (const key of order) {
    if (key in obj && (obj as Record<string, unknown>)[key] !== undefined) {
      result[key] = (obj as Record<string, unknown>)[key];
    }
  }

  for (const key of Object.keys(obj)) {
    if (
      !(key in result) &&
      (obj as Record<string, unknown>)[key] !== undefined
    ) {
      result[key] = (obj as Record<string, unknown>)[key];
    }
  }

  return result as Partial<T>;
}

/**
 * 包装并执行用户请求的过滤优化（精简冗杂数据）及结构美观化（排序格式化）逻辑。
 *
 * @param info 处于合并流水线尾端但未经洗涤加工的数据顶层对象。
 * @param options 从命令行注入的操作干预选项配置开关。
 * @returns 达到最终 JSON 序列化标准的合法且纯净的数据实体。
 */
function finalizeInfoData(info: InfoFile, options: GenerateOptions): InfoFile {
  let children = info.children;

  if (options.purify) {
    const purified: Record<string, FileNode | DirectoryNode> = {};

    for (const [name, node] of Object.entries(children)) {
      if (node.type === 'folder') {
        const {
          type,
          description,
          hidden,
          redirect,
          hold,
          created_at,
          updated_at,
        } = node;
        const mountSource = getNodeMountSource(node);
        purified[name] = {
          type,
          description,
          hidden,
          redirect,
          mount_source: mountSource,
          hold,
          created_at,
          updated_at,
        };
      } else {
        purified[name] = node;
      }
    }

    children = purified;
  }

  if (options.format) {
    const formattedSelf = reorderFields(info.self, [
      ...BASE_FIELD_ORDER,
      ...DIRECTORY_SPECIFIC_FIELD_ORDER,
    ]) as SelfInfo;
    const sortedKeys = Object.keys(children).sort((a, b) => {
      const orderA = children[a].type === 'folder' ? 0 : 1;
      const orderB = children[b].type === 'folder' ? 0 : 1;
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b, 'zh-Hans-CN', { sensitivity: 'base' });
    });

    const formattedChildren: Record<string, FileNode | DirectoryNode> = {};

    for (const key of sortedKeys) {
      const node = children[key];
      const fieldOrder =
        node.type === 'folder'
          ? [...BASE_FIELD_ORDER, ...DIRECTORY_SPECIFIC_FIELD_ORDER]
          : [...BASE_FIELD_ORDER, ...FILE_SPECIFIC_FIELD_ORDER];
      formattedChildren[key] = reorderFields(node, fieldOrder) as
        | FileNode
        | DirectoryNode;
    }

    return { self: formattedSelf, children: formattedChildren };
  }

  return { self: info.self, children };
}

/**
 * 最核心的过程引擎，驱动特定层级的单一节点生命周期循环：
 * 扫描 -> 映射整合 -> 计算补充 -> 老旧丢弃 -> 写出，并在启用的情况下深层递归执行。
 *
 * @param options 控制生成策略及逻辑分歧的设定容器。
 * @param logger 提供终端互动统计、排查提示的输出代理工具。
 */
async function generateInfoFileAsync(
  options: GenerateOptions,
  logger: GenInfoLogger,
): Promise<void> {
  const { dirPath, outputFile } = options;
  const currentLevelInfoFile = outputFile || path.join(dirPath, '._info.json');

  logger.info(`扫描解析目录: ${dirPath}`);

  const extraPatterns = options.extraIgnorePatterns.map(str => new RegExp(str));
  const allIgnorePatterns = DEFAULT_IGNORE_PATTERNS.concat(extraPatterns);
  const gitRoot = options.useGitTime
    ? await getGitRootAsync(dirPath, logger)
    : undefined;

  const existingInfo = await readInfoFileAsync(dirPath, logger);
  const scannedChildren = await scanDirectoryAsync(
    dirPath,
    DEFAULT_IGNORE_PATTERNS,
    extraPatterns,
    logger,
  );

  const mergedChildren: Record<string, FileNode | DirectoryNode> = {};
  const allNames = new Set([
    ...Object.keys(scannedChildren),
    ...Object.keys(existingInfo.children),
  ]);

  const mergePromises = Array.from(allNames).map(async name => {
    const scannedNode = scannedChildren[name];
    const existingNode = existingInfo.children[name];

    if (!scannedNode && isVirtualNode(existingNode)) {
      logger.stats.virtualNodes++;
      logger.debug(`合并保留虚拟节点: ${name}`);
      const type = existingNode?.type === 'folder' ? 'folder' : 'file';

      if (type === 'folder') {
        mergedChildren[name] = {
          ...(existingNode as VirtualDirectoryNode),
          type: 'folder',
          description:
            existingNode?.description ?? getDefaultDescription(name, 'folder'),
        };
      } else {
        mergedChildren[name] = {
          ...(existingNode as VirtualFileNode),
          type: 'file',
          description:
            existingNode?.description ?? getDefaultDescription(name, 'file'),
        };
      }

      return;
    }

    const resolvedType = await resolveNodeTypeAsync(
      name,
      existingNode,
      dirPath,
    );

    if (resolvedType === 'file') {
      logger.stats.processedFiles++;
      mergedChildren[name] = await mergeFileNodeAsync(
        name,
        existingNode,
        dirPath,
        options,
        gitRoot,
        logger,
      );
    } else if (resolvedType === 'folder') {
      logger.stats.processedFolders++;
      const oldDirNode = existingNode as DirectoryNode | undefined;
      const mountSource = oldDirNode ? getNodeMountSource(oldDirNode) : undefined;
      mergedChildren[name] = {
        type: 'folder',
        description:
          oldDirNode?.description ?? getDefaultDescription(name, 'folder'),
        ...(oldDirNode?.hidden !== undefined
          ? { hidden: oldDirNode.hidden }
          : isHiddenByDefault(name)
            ? { hidden: true }
            : {}),
        ...(oldDirNode?.hold && { hold: oldDirNode.hold }),
        ...(mountSource !== undefined ? { mount_source: mountSource } : {}),
        ...(oldDirNode?.created_at && { created_at: oldDirNode.created_at }),
        ...(oldDirNode?.updated_at && { updated_at: oldDirNode.updated_at }),
      };
    } else if (existingNode) {
      mergedChildren[name] = existingNode;
    } else if (scannedNode) {
      mergedChildren[name] = scannedNode;
    }
  });

  await Promise.all(mergePromises);

  let children = mergedChildren;

  if (options.clean) {
    const cleanedChildren: Record<string, FileNode | DirectoryNode> = {};
    const checkPromises = Object.entries(children).map(async ([name, node]) => {
      if (isVirtualNode(node)) {
        cleanedChildren[name] = node;
        return;
      }

      const physicallyExists = await hasPhysicalEntityAsync(name, dirPath);

      if (!physicallyExists) {
        logger.debug(`清理节点 (物理文件丢失): ${name}`);
        logger.stats.removed++;
        return;
      }

      if (options.cleanIgnored && allIgnorePatterns.some(p => p.test(name))) {
        logger.debug(`清理节点 (命中忽略规则): ${name}`);
        logger.stats.removed++;
        return;
      }

      cleanedChildren[name] = node;
    });
    await Promise.all(checkPromises);
    children = cleanedChildren;
  }

  const mergedSelf = {
    ...existingInfo.self,
    description:
      existingInfo.self.description ??
      getDefaultDescription(path.basename(dirPath), 'self'),
    ...(existingInfo.self.hidden === undefined &&
    isHiddenByDefault(path.basename(dirPath))
      ? { hidden: true }
      : {}),
  };

  const finalInfo = finalizeInfoData({ self: mergedSelf, children }, options);
  const jsonContent = JSON.stringify(finalInfo, null, 2);

  if (options.dryRun) {
    logger.warn(`[Dry Run] 预览生成，跳过写入: ${currentLevelInfoFile}`);
  } else {
    const outputDir = path.dirname(currentLevelInfoFile);
    await fsp.mkdir(outputDir, { recursive: true });
    await fsp.writeFile(currentLevelInfoFile, jsonContent, 'utf-8');
    logger.success(`成功生成或更新: ${currentLevelInfoFile}`);
  }

  if (options.recursive) {
    for (const [name, node] of Object.entries(scannedChildren)) {
      if (node.type === 'folder') {
        const subDirPath = path.join(dirPath, name);
        await generateInfoFileAsync(
          { ...options, dirPath: subDirPath, outputFile: undefined },
          logger,
        );
      }
    }
  }
}

// ────────────── 参数解析与主入口 ──────────────

/**
 * 处理用户自终端控制台打入的所有长短参选项并混合外置配置，以推导出工具的确切运作状态。
 *
 * @param argv `process.argv` 中去掉可执行环境部分后剥离出的纯命令行选项切片。
 * @returns 装载了所有解析、过滤、覆写与默认兜底后逻辑设定的纯配置对象。
 */
function parseArguments(argv: string[]): GenerateOptions {
  let configPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config') {
      const value = argv[++i];

      if (!value || value.startsWith('--')) {
        console.error('--config 需要提供 JSON 配置文件路径。');
        process.exit(1);
      }

      configPath = value;
      continue;
    }

    if (argv[i]?.startsWith('--config=')) {
      configPath = argv[i].slice('--config='.length);
      continue;
    }
  }

  let configSection: Record<string, unknown> | undefined;
  let configDir: string | undefined;

  if (configPath) {
    try {
      const config = loadJsonConfig(configPath);
      configSection = getConfigSection(config, 'generate_info');
      configDir = config.dir;
    } catch (error) {
      console.error(getErrorMessage(error));
      process.exit(1);
    }
  }

  const defaultOptions: GenerateOptions = {
    dirPath: process.cwd(),
    clean: getBoolean(configSection, 'clean_invalid') ?? true,
    cleanIgnored: getBoolean(configSection, 'clean_ignored') ?? true,
    purify: getBoolean(configSection, 'purify_folders') ?? true,
    format: getBoolean(configSection, 'format_output') ?? true,
    computeHash: getBoolean(configSection, 'calculate_hash') ?? true,
    useGitTime: getBoolean(configSection, 'use_git_history') ?? true,
    updateSize: getBoolean(configSection, 'update_size') ?? true,
    extraIgnorePatterns: getStringArray(configSection, 'ignore_patterns') ?? [],
    verbose: getBoolean(configSection, 'verbose') ?? false,
    sync: true,
    force: getBoolean(configSection, 'force_update') ?? false,
    dryRun: getBoolean(configSection, 'dry_run') ?? false,
    recursive: getBoolean(configSection, 'recursive') ?? true,
  };

  const options = { ...defaultOptions };
  const configRootDir = resolveConfigPath(
    getString(configSection, 'root_dir'),
    configDir,
  );

  const outputFilename = getString(configSection, 'output_filename');

  if (configRootDir) {
    options.dirPath = configRootDir;
  }

  if (outputFilename && outputFilename !== '._info.json') {
    options.outputFile = resolveConfigPath(outputFilename, configDir);
  }

  let i = 0;
  let consumedPositional = false;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg.startsWith('--config=')) {
      i++;
      continue;
    }

    switch (arg) {
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      case '--version':
      case '-v':
        console.log('generate-info.ts v1.0.0 (Modular & Extracted)');
        process.exit(0);
        break;
      case '--no-clean':
        options.clean = false;
        break;
      case '--no-purify':
        options.purify = false;
        break;
      case '--no-format':
        options.format = false;
        break;
      case '--no-hash':
        options.computeHash = false;
        break;
      case '--no-git':
        options.useGitTime = false;
        break;
      case '--no-size':
        options.updateSize = false;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--sync':
        options.sync = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--recursive':
        options.recursive = true;
        break;
      case '--no-recursive':
        options.recursive = false;
        break;
      case '--no-clean-ignored':
        options.cleanIgnored = false;
        break;
      case '--config':
        i++;
        break;
      case '--ignore':
        if (i + 1 < argv.length) options.extraIgnorePatterns.push(argv[++i]);
        break;
      case '--output':
        if (i + 1 < argv.length) options.outputFile = argv[++i];
        break;
      default:
        if (!arg.startsWith('-') && !consumedPositional) {
          options.dirPath = path.resolve(arg);
          consumedPositional = true;
        }

        break;
    }

    i++;
  }

  return options;
}

/**
 * 顶层的主环境启动入口封装，承担系统错误隔离墙，以及串联调度各职责方法的任务。
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArguments(args);
  const logger = new GenInfoLogger(options.verbose);

  if (args.length === 0) {
    logger.error('请指定目录或选项。使用 --help 查看帮助。');
    printHelp();
    process.exit(1);
  }

  try {
    const stats = await fsp.stat(options.dirPath);

    if (!stats.isDirectory()) {
      logger.error(`指定的路径不是一个有效的目录: "${options.dirPath}"`);
      process.exit(1);
    }
  } catch {
    logger.error(`指定的路径不存在: "${options.dirPath}"`);
    process.exit(1);
  }

  try {
    await generateInfoFileAsync(options, logger);
    logger.printSummary();
  } catch (error) {
    logger.error(`发生未捕获异常，脚本强制终止：${getErrorMessage(error)}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('致命执行错误:', err);
  process.exit(1);
});
