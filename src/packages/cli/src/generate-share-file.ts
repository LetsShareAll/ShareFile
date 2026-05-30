#!/usr/bin/env node

/**
 * @fileoverview 根据目录树中的 `._info.json` 生成 `share-file.json`。
 * 递归读取每个目录的元数据，构建统一的节点索引和路径映射，
 * 将重定向等信息扁平化，并输出到指定文件。
 */

import * as fsp from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { DirectoryNode, FileNode, MountSourceInfo } from '@share-file/types';
import {
  Logger,
  getErrorMessage,
  readInfoFileAsync,
} from '@share-file/types/logger';

import PluginRegistry from './utils/plugin-registry';
const __filename = fileURLToPath(import.meta.url);
const workspaceRoot = path.resolve(
  path.dirname(__filename),
  '..',
  '..',
  '..',
  '..',
);
const DEFAULT_CDN_BASE_URL =
  'https://cdn-file.lssa.fun/github.com/LetsShareAll/ShareFile/blob/file/public';

interface GenerateShareOptions {
  rootDir: string;
  outputPath: string;
  verbose: boolean;
  cdnBaseUrl: string;
}

// ────────────── 日志系统扩展 ──────────────

/**
 * 用于生成扁平化索引 `share-file` 的专属日志扩展类。
 * 继承自基础 Logger，提供构建索引时的特殊进度统计。
 */
class GenShareLogger extends Logger {
  /** 统计构建过程中遍历和生成的节点总数。 */
  public stats = {
    processedFolders: 0,
    mappedNodes: 0,
  };

  /**
   * 将当前构建任务的统计数据及耗时以高亮格式打印到终端输出。
   */
  printSummary(): void {
    console.log('\n\x1b[1m\x1b[36m=== 构建执行摘要 ===\x1b[0m');
    console.log(`⏱️  总计耗时: \x1b[33m${this.getElapsedSeconds()} s\x1b[0m`);
    console.log(`📁 遍历目录: \x1b[32m${this.stats.processedFolders}\x1b[0m`);
    console.log(`🔗 映射节点: \x1b[36m${this.stats.mappedNodes}\x1b[0m\n`);
  }
}

// ────────────── 输出结构类型定义 ──────────────

/** * 单个数据节点在 `share-file.json` 中被摊平呈现的数据接口。
 * 注意该结构已被扁平化处理，不再包含原有嵌套深度的 `redirect` 等对象。
 */
interface ShareNode {
  /** 节点在整个索引网中的唯一路径寻址 ID。 */
  id: string;
  /** 节点的名称（包含文件后缀名）。 */
  name: string;
  /** 节点类型，限定为 'file' 或 'folder'。 */
  type: 'file' | 'folder';
  /** 指向父级节点唯一 ID 的挂载引用。若是处于根路径下则为 null。 */
  parent: string | null;
  /** 声明该节点下从属拥有的全部直系子节点 ID 的数组集合。 */
  children: string[];
  /** 人类可读的节点业务含义解释或文件作用描述。 */
  description?: string;
  /** 在用户界面端是否被要求呈现隐藏状态的开关标识。 */
  hidden?: boolean;
  /** 当作为文件节点时的体积字节尺寸。 */
  size?: number;
  /** 文件的控制版本追踪编号。 */
  version?: string;
  /** 首次注册创建时间的 ISO 8601 标准字符串。 */
  created_at?: string;
  /** 最近一次属性或内容发生变更时间。 */
  updated_at?: string;
  /** 根据文件数据解包算出的 MD5 验证哈希。 */
  md5?: string;
  /** 更高位安全级别的 SHA256 加密散列凭证。 */
  sha256?: string;
  /** 被展平放置在主层的跨源虚拟重定向 URL 地址。 */
  redirect_url?: string | null;
  /** 该重定向连接被点击时触发交互的方式 (direct 或者是 confirm)。 */
  redirect_type?: string | null;
  /** 附带用于提醒的二次重定向确认交互文案。 */
  redirect_confirm_message?: string | null;
  /** 外部存储挂载源配置。仅目录节点可用。 */
  mountSource?: MountSourceInfo;
}

/** * `share-file.json` 被写出时所呈现的完整顶层容器对象。
 */
interface ShareFile {
  /** 全局起点的固定识别字 ID。 */
  rootId: string;
  /** 将类似于 `/assets/images` 这样的外部绝对路径快速路由到内部对应 Node ID 的字典。 */
  pathIndex: Record<string, string>;
  /** 扁平存放了所有的 ShareNode 节点配置实体的映射容器集合。 */
  nodes: Record<string, ShareNode>;
}

// ────────────── 辅助转换工具 ──────────────

/**
 * 剥离并截去 ISO 8601 时间字符串中自带的微小毫秒尾数（例如 `.000`）。
 * 以将输出统一格式化为 `YYYY-MM-DDTHH:mm:ssZ`，提高前端渲染的一致性。
 *
 * @param iso 完整的含毫秒后缀信息的原始 ISO 字符串。
 * @returns 截去了毫秒小数位后拼接恢复标准结尾符的干净时间串。
 */
function removeMillisecondsFromISO(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, 'Z');
}

/**
 * 负责打散 `._info.json` 中带复杂层级关系的原型节点实体，
 * 摊平成为一维化可被极速检索利用的标准化 `ShareNode` 格式。
 *
 * @param id 节点被分配的全局唯一路径引用 ID。
 * @param name 节点所呈现的文件系统原本名称。
 * @param type 指定转换目标的类型。
 * @param parentId 上级所属节点的映射关系 ID。
 * @param child 原始被读入的数据承载体对象。
 * @returns 解构组装后崭新出厂的扁平化 ShareNode。
 */
function infoNodeToShareNode(
  id: string,
  name: string,
  type: 'file' | 'folder',
  parentId: string | null,
  child: FileNode | DirectoryNode,
): ShareNode {
  const base: ShareNode = {
    id,
    name,
    type,
    parent: parentId,
    children: [], // 子节点关联交由后续的遍历循环延迟执行回填
  };

  if (child.description) base.description = child.description;
  if (child.hidden !== undefined) base.hidden = child.hidden;
  if (child.created_at)
    base.created_at = removeMillisecondsFromISO(child.created_at);
  if (child.updated_at)
    base.updated_at = removeMillisecondsFromISO(child.updated_at);

  if (child.redirect) {
    base.redirect_url = child.redirect.url;
    base.redirect_type = child.redirect.type;
    base.redirect_confirm_message = child.redirect.confirm_message ?? null;
  } else {
    base.redirect_url = null;
    base.redirect_type = null;
    base.redirect_confirm_message = null;
  }

  if (type === 'file') {
    const file = child as FileNode;
    if (file.size !== undefined) base.size = file.size;
    if (file.version) base.version = file.version;
    if (file.md5) base.md5 = file.md5;
    if (file.sha256) base.sha256 = file.sha256;
  } else {
    const folder = child as DirectoryNode;

    if (folder.mountSource !== undefined) {
      base.mountSource = folder.mountSource;
    }
  }

  return base;
}

// ────────────── 核心生成逻辑 ──────────────

/**
 * 进行目录内容的树形遍历，自下而上读取各个分散的 `._info.json` 配置区块并融合成单个输出模型。
 *
 * @param dirPath 当前游历深度的物理目录绝对定位路径。
 * @param relativeId 作为 ID 使用的当前在体系内路由坐标（例如 root/assets）。
 * @param parentId 父级挂载坐标 ID 锚定。
 * @param dirName 该节点的短命名名称标示。
 * @param shareFile 提供向上传导累积添加数据的中心输出收集器容器。
 * @param logger 提供日志操作能力的实例。
 */
async function processDirectory(
  dirPath: string,
  relativeId: string,
  parentId: string | null,
  dirName: string,
  shareFile: ShareFile,
  logger: GenShareLogger,
): Promise<void> {
  logger.stats.processedFolders++;

  const info = await readInfoFileAsync(dirPath, logger);

  if (relativeId === 'root') {
    const rootNode: ShareNode = {
      id: 'root',
      name: '/',
      type: 'folder',
      parent: null,
      children: [],
    };
    if (info.self.description) rootNode.description = info.self.description;
    if (info.self.hidden !== undefined) rootNode.hidden = info.self.hidden;
    shareFile.nodes['root'] = rootNode;
    shareFile.pathIndex['/'] = 'root';
    logger.stats.mappedNodes++;
  }

  const childIds: string[] = [];

  for (const [name, child] of Object.entries(info.children)) {
    const childId = relativeId === 'root' ? name : `${relativeId}/${name}`;
    const childType = child.type === 'folder' ? 'folder' : 'file';

    const shareNode = infoNodeToShareNode(
      childId,
      name,
      childType,
      relativeId,
      child,
    );
    shareFile.nodes[childId] = shareNode;
    shareFile.pathIndex[`/${childId}`] = childId;

    childIds.push(childId);
    logger.stats.mappedNodes++;

    if (childType === 'folder') {
      const childDirPath = path.join(dirPath, name);

      try {
        const stat = await fsp.stat(childDirPath);

        if (stat.isDirectory()) {
          await processDirectory(
            childDirPath,
            childId,
            relativeId,
            name,
            shareFile,
            logger,
          );
        }
      } catch {
        logger.debug(`跳过虚拟目录深层遍历: ${childDirPath}`);
      }
    }
  }

  shareFile.nodes[relativeId].children = childIds;
}

/**
 * 将 ShareFile 转换为 CDN 版本，为符合条件的文件节点添加 CDN URL。
 *
 * @param shareFile 原始的 ShareFile 对象
 * @param cdnBaseUrl CDN 文件访问基础 URL
 * @returns 包含 CDN URL 的新 ShareFile 对象
 */
function transformToCdnVersion(
  shareFile: ShareFile,
  cdnBaseUrl: string,
): ShareFile {
  const cdnNodes: Record<string, ShareNode> = {};

  for (const [nodeId, node] of Object.entries(shareFile.nodes)) {
    // 复制节点
    const cdnNode = { ...node };

    // 只为 type='file' 且没有 redirect_url 的节点添加 url 字段
    if (node.type === 'file' && !node.redirect_url) {
      (cdnNode as ShareNode & { url: string }).url = `${cdnBaseUrl}/${nodeId}`;
    }

    cdnNodes[nodeId] = cdnNode;
  }

  return {
    rootId: shareFile.rootId,
    pathIndex: { ...shareFile.pathIndex },
    nodes: cdnNodes,
  };
}

function printHelp(): void {
  console.log(`
用法: pnpm --filter @share-file/cli run generate-share-file -- [目录] [输出文件] [选项]

生成 share-file.json，并同步生成 share-file.cdn.json。

选项:
  --cdn-url <url>     设置 CDN 文件访问基础 URL
  --verbose           输出详细调试日志
  --help, -h          显示此帮助信息

环境变量:
  SHARE_FILE_CDN_URL  未传 --cdn-url 时使用的 CDN 文件访问基础 URL
`);
}

function normalizeCdnBaseUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    console.error('CDN URL 不能为空。');
    process.exit(1);
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      console.error(`CDN URL 必须使用 http 或 https: ${trimmed}`);
      process.exit(1);
    }
  } catch {
    console.error(`CDN URL 不是合法 URL: ${trimmed}`);
    process.exit(1);
  }

  return trimmed.replace(/\/+$/, '');
}

function parseArguments(args: string[]): GenerateShareOptions {
  const positional: string[] = [];
  let verbose = false;
  let cdnBaseUrl = process.env.SHARE_FILE_CDN_URL || DEFAULT_CDN_BASE_URL;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--verbose') {
      verbose = true;
      continue;
    }

    if (arg === '--cdn-url') {
      const value = args[++i];

      if (!value || value.startsWith('--')) {
        console.error('--cdn-url 需要提供 URL。');
        process.exit(1);
      }

      cdnBaseUrl = value;
      continue;
    }

    if (arg.startsWith('--cdn-url=')) {
      cdnBaseUrl = arg.slice('--cdn-url='.length);
      continue;
    }

    if (arg.startsWith('--')) {
      console.error(`未知选项: ${arg}`);
      printHelp();
      process.exit(1);
    }

    positional.push(arg);
  }

  if (positional.length > 2) {
    console.error(`位置参数过多: ${positional.slice(2).join(' ')}`);
    printHelp();
    process.exit(1);
  }

  const rootDir = positional[0] ? path.resolve(positional[0]) : process.cwd();
  const defaultOutput = path.join(
    workspaceRoot,
    'public',
    'assets',
    'data',
    'share-file.json',
  );
  const outputPath = positional[1]
    ? path.resolve(positional[1])
    : defaultOutput;

  return {
    rootDir,
    outputPath,
    verbose,
    cdnBaseUrl: normalizeCdnBaseUrl(cdnBaseUrl),
  };
}

/**
 * 构建索引系统 CLI 调用的唯一主入口，承担对控制台初始入参的接收以及触发驱动整个流水线工作。
 */
async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const { rootDir, outputPath, verbose, cdnBaseUrl } = options;
  const logger = new GenShareLogger(verbose);

  // 初始化插件注册表并加载可选的运行时 plugins 目录
  const registry = new PluginRegistry(logger);
  const pluginsDir = path.join(path.dirname(__filename), 'plugins', 'runtime');
  await registry.loadFromDir(pluginsDir, { logger });
  await registry.runHook('init');

  logger.info(`开始生成全局分享索引，根节点: ${rootDir}`);

  // 通知插件即将开始扫描
  await registry.runHook('beforeScan', rootDir);

  const shareFile: ShareFile = {
    rootId: 'root',
    pathIndex: {},
    nodes: {},
  };

  try {
    await processDirectory(rootDir, 'root', null, '/', shareFile, logger);

    const outputDir = path.dirname(outputPath);
    await fsp.mkdir(outputDir, { recursive: true });

    // 生成原始版本 share-file.json
    const json = JSON.stringify(shareFile, null, 2);
    await fsp.writeFile(outputPath, json, 'utf-8');
    logger.success(`成功生成或覆盖: ${outputPath}`);

    // 生成 CDN 版本 share-file.cdn.json
    const cdnShareFile = transformToCdnVersion(shareFile, cdnBaseUrl);
    const cdnOutputPath = outputPath.replace('.json', '.cdn.json');
    const cdnJson = JSON.stringify(cdnShareFile, null, 2);
    await fsp.writeFile(cdnOutputPath, cdnJson, 'utf-8');
    logger.success(`成功生成或覆盖: ${cdnOutputPath}`);

    // 构建完成后触发插件回调（只为原始版本触发）
    await registry.runHook('afterBuild', outputPath, shareFile);

    logger.printSummary();
  } catch (error) {
    logger.error(`生成严重失败: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}

// 当模块为主入口触发时（非引用导入时）自动启动程序并执行兜底崩溃拦截。
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)
) {
  main().catch(err => {
    console.error('不可恢复的致命错误:', err);
    process.exit(1);
  });
}
