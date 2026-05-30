/**
 * @fileoverview 前后端数据契约层 - 纯 TypeScript 类型定义
 * 编译后会被完全擦除，零运行时开销
 */

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
 * 外部存储挂载源配置，用于从其他仓库或存储服务加载 share-file.json。
 */
export interface MountSourceInfo {
  /** 存储提供商类型，当前支持 'github'，未来可扩展 'onedrive' 等。 */
  readonly provider: 'github';
  /** 仓库标识，格式为 'owner/repo'。 */
  readonly repository: string;
  /** 分支名称，可选，默认尝试 'main' 后回退到 'master'。 */
  readonly branch?: string;
  /** 外部仓库的子路径，可选，默认为根目录 '/'。用于只挂载外部仓库的某个子目录。 */
  readonly subPath?: string;
  /** 访问索引文件时使用的 CDN 或访问方式。可选值：'jsdelivr' | 'raw' | 自定义 CDN URL。 */
  readonly accessCdn?: string;
  /** 是否优先加载外部仓库的 share-file.cdn.json 文件。默认 false，加载 share-file.json。 */
  readonly useCdnIndex?: boolean;
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
export interface DirectoryNodeBaseInfo extends BaseInfo {
  /** 外部存储挂载源配置。仅当此目录节点作为外部存储挂载点时存在。 */
  readonly mountSource?: MountSourceInfo;
}

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

/** 当前 `._info.json` 所在目录自身的描述信息。 */
export type SelfInfo = BaseInfo;

/**
 * `._info.json` 文件的顶层序列化数据结构。
 */
export interface InfoFile {
  /** 当前目录自身的配置属性。 */
  readonly self: SelfInfo;
  /** 当前目录下所有子节点（文件及子目录）的键值对映射。 */
  readonly children: Record<string, FileNode | DirectoryNode>;
}

/** 当前目录节点自身。 */
export type NodeSelf = PhysicalFileNode | PhysicalDirectoryNode;

/** 当前目录节点自身（包含虚拟节点）。 */
export type NodeSelfWithVirtual =
  | NodeSelf
  | VirtualFileNode
  | VirtualDirectoryNode;

/** 合法的任意类型的文件节点。 */
export type FileNode = PhysicalFileNode | VirtualFileNode;
/** 合法的任意类型的目录节点。 */
export type DirectoryNode = PhysicalDirectoryNode | VirtualDirectoryNode;

/**
 * 前端 share-file.json 中的节点数据结构（扁平化后）。
 */
export interface ShareNode {
  /** 节点在整个索引中的唯一路径 ID。 */
  readonly id: string;
  /** 节点的名称（包含文件后缀名）。 */
  readonly name: string;
  /** 节点类型，限定为 'file' 或 'folder'。 */
  readonly type: 'file' | 'folder';
  /** 指向父级节点唯一 ID 的引用。若是根路径则为 null。 */
  readonly parent: string | null;
  /** 该节点下所有直系子节点 ID 的数组集合。 */
  readonly children: string[];
  /** 人类可读的节点描述。 */
  readonly description?: string;
  /** 是否在用户界面端呈现隐藏状态。 */
  readonly hidden?: boolean;
  /** 文件节点的体积字节尺寸。 */
  readonly size?: number;
  /** 文件的版本号。 */
  readonly version?: string;
  /** 首次创建时间的 ISO 8601 标准字符串。 */
  readonly created_at?: string;
  /** 最近一次变更时间。 */
  readonly updated_at?: string;
  /** 文件的 MD5 验证哈希。 */
  readonly md5?: string;
  /** 文件的 SHA256 加密散列。 */
  readonly sha256?: string;
  /** 扁平化后的重定向 URL 地址。 */
  readonly redirect_url?: string | null;
  /** 重定向触发方式 (direct 或 confirm)。 */
  readonly redirect_type?: string | null;
  /** 重定向确认交互文案。 */
  readonly redirect_confirm_message?: string | null;
  /** 文件访问 URL。 */
  readonly url?: string;
  /** 节点来源标识：'local' 表示本地节点，'external' 表示来自外部挂载源。 */
  readonly source?: 'local' | 'external';
  /** 如果是外部节点，标识其所属的挂载点路径。 */
  readonly mount_point?: string;
  /** 外部存储挂载源配置。仅目录节点可用。 */
  readonly mountSource?: MountSourceInfo;
}

/**
 * 前端加载的完整 share-file.json 数据结构。
 */
export interface ShareFile {
  /** 根节点的 ID。 */
  readonly rootId: string;
  /** 路径到节点 ID 的映射索引。 */
  readonly pathIndex: Record<string, string>;
  /** 所有节点的 ID 到节点数据的映射。 */
  readonly nodes: Record<string, ShareNode>;
  /** 挂载点元数据，记录每个挂载点的外部源信息。 */
  readonly mountPoints?: Record<
    string,
    {
      readonly repository: string;
      readonly branch: string;
      readonly provider: string;
    }
  >;
}

/**
 * 外部源缓存数据结构，用于 localStorage 缓存。
 */
export interface ExternalSourceCache {
  /** 外部的 share-file.json 数据。 */
  readonly data: ShareFile;
  /** ISO 8601 缓存时间。 */
  readonly cachedAt: string;
  /** ISO 8601 过期时间。 */
  readonly expiresAt: string;
  /** 本地挂载点路径。 */
  readonly mountPoint: string;
  /** 外部源信息。 */
  readonly source: {
    readonly provider: string;
    readonly repository: string;
    readonly branch: string;
    readonly subPath?: string;
  };
}
