/**
 * @fileoverview 提供 `generate-info` 和 `generate-share-file` 共享的基础类型定义、
 * 日志系统和通用工具函数。
 */

import * as fsp from 'fs/promises';
import * as path from 'path';

// ────────────── 公共类型定义 ──────────────

/**
 * 节点的重定向配置，用于将某个虚拟节点映射到外部 URL 或本地其他路径。
 */
export interface RedirectInfo {
  /** 重定向的目标 URL 或本地绝对/相对路径。 */
  readonly url: string;
  /** 跳转方式：直接跳转 (`direct`) 或 请求用户确认后跳转 (`confirm`)。 */
  readonly type: 'direct' | 'confirm';
  /** 当 type 为 `confirm` 时，展示给用户的二次确认提示信息。 */
  readonly confirm_message?: string;
}

/**
 * 锁定字段配置，用于防止自动生成脚本覆盖用户手动指定的元数据。
 */
export interface HoldInfo {
  /** 是否锁定文件大小，阻止根据物理文件重新计算。 */
  readonly size?: boolean;
  /** 是否锁定 MD5 与 SHA256 哈希值，阻止重新散列计算。 */
  readonly hash?: boolean;
  /** 是否锁定首次创建时间，阻止从 Git 获取。 */
  readonly created_at?: boolean;
  /** 是否锁定最后更新时间，阻止从 Git 获取。 */
  readonly updated_at?: boolean;
}

/**
 * 文件与目录节点共享的基础元数据字段。
 */
export interface BaseInfo {
  /** 人类可读的描述文本，通常用于在 UI 界面上展示文件摘要。 */
  readonly description?: string;
  /** 是否在前端目录树或文件列表中默认隐藏此节点。 */
  readonly hidden?: boolean;
  /** 虚拟节点的重定向配置。物理节点不应包含此字段。 */
  readonly redirect?: RedirectInfo;
  /** 字段更新锁定配置。若为 true 则锁定全部自动字段；若为对象则进行细粒度控制。 */
  readonly hold?: boolean | HoldInfo;
  /** 节点的首次创建时间，严格遵循 ISO 8601 格式。 */
  readonly created_at?: string;
  /** 节点的最后一次修改时间，严格遵循 ISO 8601 格式。 */
  readonly updated_at?: string;
}

/**
 * 文件类型节点特有的元数据字段。
 */
export interface FileNodeBaseInfo extends BaseInfo {
  /** 文件的版本号字符串。 */
  readonly version?: string;
  /** 文件的实际大小（以字节为单位）。 */
  readonly size?: number;
  /** 文件的 MD5 哈希校验值。 */
  readonly md5?: string;
  /** 文件的 SHA256 哈希校验值。 */
  readonly sha256?: string;
}

/**
 * 目录类型节点的基础信息接口（保留以便未来对目录节点进行字段扩展）。
 */
export interface DirectoryNodeBaseInfo extends BaseInfo {}

/**
 * 物理存在于磁盘上的文件节点。
 */
export interface PhysicalFileNode extends FileNodeBaseInfo {
  /** 物理文件不存在重定向。 */
  readonly redirect?: undefined;
  /** 节点类型标识。 */
  readonly type?: 'file';
}

/**
 * 物理存在于磁盘上的目录节点。
 */
export interface PhysicalDirectoryNode extends DirectoryNodeBaseInfo {
  /** 物理目录不存在重定向。 */
  readonly redirect?: undefined;
  /** 节点类型标识。 */
  readonly type?: 'folder';
}

/**
 * 物理不存在，仅在配置中定义的虚拟文件节点。
 */
export interface VirtualFileNode extends FileNodeBaseInfo {
  /** 虚拟节点强制要求包含重定向配置。 */
  readonly redirect: RedirectInfo;
  /** 节点类型标识。 */
  readonly type: 'file';
}

/**
 * 物理不存在，仅在配置中定义的虚拟目录节点。
 */
export interface VirtualDirectoryNode extends DirectoryNodeBaseInfo {
  /** 虚拟节点强制要求包含重定向配置。 */
  readonly redirect: RedirectInfo;
  /** 节点类型标识。 */
  readonly type: 'folder';
}

/** 合法的任意类型的文件节点。 */
export type FileNode = PhysicalFileNode | VirtualFileNode;
/** 合法的任意类型的目录节点。 */
export type DirectoryNode = PhysicalDirectoryNode | VirtualDirectoryNode;

/** 当前 `._info.json` 所在目录自身的描述信息。 */
export interface SelfInfo extends BaseInfo {}

/**
 * `._info.json` 文件的顶层序列化数据结构。
 */
export interface InfoFile {
  /** 当前目录自身的配置属性。 */
  readonly self: SelfInfo;
  /** 当前目录下所有子节点（文件及子目录）的键值对映射。 */
  readonly children: Record<string, FileNode | DirectoryNode>;
}

// ────────────── 日志系统与工具函数 ──────────────

/**
 * 轻量级终端日志记录器基类。
 * 提供带时间戳和 ANSI 颜色的分级输出能力，子类可扩展具体的业务统计逻辑。
 */
export class Logger {
  /** 标识是否在终端输出较低优先级的调试信息。 */
  protected readonly verbose: boolean;
  /** 记录器实例化的时间戳，用于计算总耗时。 */
  protected readonly startTime: number;

  /**
   * 初始化日志记录器。
   *
   * @param verbose 是否启用详细的调试级别输出。
   */
  constructor(verbose: boolean) {
    this.verbose = verbose;
    this.startTime = Date.now();
  }

  /**
   * 获取自实例创建以来经过的秒数。
   *
   * @returns 保留两位小数的秒数字符串。
   */
  protected getElapsedSeconds(): string {
    return ((Date.now() - this.startTime) / 1000).toFixed(2);
  }

  /**
   * 生成当前时间的 HH:MM:SS 格式字符串。
   *
   * @returns 格式化后的时间字符串。
   */
  private formatTime(): string {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
  }

  /**
   * 构造带有时间戳和颜色代码的日志前缀。
   *
   * @param level 日志等级标签（如 INFO, ERR!）。
   * @param colorCode ANSI 颜色控制代码。
   * @returns 拼接完成的日志前缀字符串。
   */
  private formatPrefix(level: string, colorCode: string): string {
    return `\x1b[90m[${this.formatTime()}]\x1b[0m ${colorCode}${level}\x1b[0m`;
  }

  /**
   * 输出标准的普通信息日志（青色标签）。
   *
   * @param msg 需要输出的信息文本。
   */
  info(msg: string): void {
    console.log(`${this.formatPrefix('INFO', '\x1b[36m')} ${msg}`);
  }

  /**
   * 输出表示操作成功的日志（绿色标签）。
   *
   * @param msg 需要输出的信息文本。
   */
  success(msg: string): void {
    console.log(`${this.formatPrefix('DONE', '\x1b[32m')} ${msg}`);
  }

  /**
   * 输出警告级别的日志（黄色标签）。
   *
   * @param msg 需要输出的警告文本。
   */
  warn(msg: string): void {
    console.warn(`${this.formatPrefix('WARN', '\x1b[33m')} ${msg}`);
  }

  /**
   * 输出错误级别的日志（红色标签与红色文本）。
   *
   * @param msg 需要输出的错误文本。
   */
  error(msg: string): void {
    console.error(
      `${this.formatPrefix('ERR!', '\x1b[31m')} \x1b[31m${msg}\x1b[0m`,
    );
  }

  /**
   * 输出调试级别的日志（灰色标签与灰色文本）。
   * 仅在类的 `verbose` 属性为 true 时实际向终端输出。
   *
   * @param msg 需要输出的调试文本。
   */
  debug(msg: string): void {
    if (this.verbose) {
      console.log(
        `${this.formatPrefix('DBUG', '\x1b[90m')} \x1b[90m${msg}\x1b[0m`,
      );
    }
  }
}

/**
 * 将捕获的未知异常对象安全地转换为字符串消息，避免打印出 `[object Object]`。
 *
 * @param error 捕获到的异常或抛出的未知类型变量。
 * @returns 提取的错误描述字符串。
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 异步尝试读取目录下已有的 `._info.json` 文件内容。
 * 若文件不存在、无法读取或 JSON 结构不符合规范，则静默返回标准的空结构模板。
 *
 * @param dirPath 目标目录的绝对或相对路径。
 * @param logger 可选的日志实例，用于在读取失败或不存在时输出调试信息。
 * @returns 验证通过的 InfoFile 对象或空模板结构。
 */
export async function readInfoFileAsync(
  dirPath: string,
  logger?: Logger,
): Promise<InfoFile> {
  const infoFilePath = path.join(dirPath, '._info.json');

  try {
    await fsp.access(infoFilePath);
  } catch {
    logger?.debug(`目标目录无存量 ._info.json，将创建或视为空配置。`);
    return { self: {}, children: {} };
  }

  try {
    const rawContent = await fsp.readFile(infoFilePath, 'utf-8');
    const parsed = JSON.parse(rawContent);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      !('self' in parsed) ||
      !('children' in parsed)
    ) {
      throw new Error('JSON 数据结构不符合要求');
    }

    return parsed as InfoFile;
  } catch (error) {
    logger?.warn(
      `读取存量配置 ${infoFilePath} 失败。错误：${getErrorMessage(error)}`,
    );
    return { self: {}, children: {} };
  }
}
