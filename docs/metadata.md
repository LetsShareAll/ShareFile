# 元数据说明

本文档说明 `._info.json`、`share-file.json`、字段锁定、虚拟节点、重定向和外部挂载配置。

## `._info.json`

每个目录可以包含一个 `._info.json`。它描述当前目录自身和直接子节点。

```json
{
  "self": {
    "description": "当前目录"
  },
  "children": {
    "example.pdf": {
      "type": "file",
      "description": "示例文档",
      "version": "1.0.0"
    },
    "documents": {
      "type": "folder",
      "description": "文档目录"
    }
  }
}
```

`self` 描述当前目录。`children` 只描述当前目录的直接子节点，不递归嵌套。

## 常用字段

| 字段           | 可用位置        | 说明                   |
| -------------- | --------------- | ---------------------- |
| `description`  | `self` / 子节点 | 展示说明               |
| `hidden`       | `self` / 子节点 | 是否以隐藏状态展示     |
| `type`         | 子节点          | `file` 或 `folder`     |
| `version`      | 文件节点        | 文件版本               |
| `size`         | 文件节点        | 字节大小，由生成器维护 |
| `md5`          | 文件节点        | MD5，由生成器维护      |
| `sha256`       | 文件节点        | SHA256，由生成器维护   |
| `created_at`   | `self` / 子节点 | ISO 8601 创建时间      |
| `updated_at`   | `self` / 子节点 | ISO 8601 更新时间      |
| `hold`         | 子节点          | 阻止自动字段被覆盖     |
| `redirect`     | 虚拟节点        | 跳转配置               |
| `mount_source` | 目录节点        | 外部索引挂载源         |

## 字段锁定

锁定全部自动字段：

```json
{
  "children": {
    "release.zip": {
      "type": "file",
      "description": "手动维护的发布包",
      "size": 1048576,
      "md5": "d41d8cd98f00b204e9800998ecf8427e",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "hold": true
    }
  }
}
```

只锁定部分字段：

```json
{
  "children": {
    "release.zip": {
      "type": "file",
      "hold": {
        "hash": true,
        "created_at": true
      }
    }
  }
}
```

可锁定字段：

| 字段         | 作用                 |
| ------------ | -------------------- |
| `size`       | 不更新文件大小       |
| `hash`       | 不更新 MD5 和 SHA256 |
| `created_at` | 不更新创建时间       |
| `updated_at` | 不更新时间           |

`--force` 会忽略 `hold`，强制更新自动字段。

## 虚拟节点

物理磁盘上不存在，但需要在前端显示的节点称为虚拟节点。虚拟节点必须声明 `type`，通常也会声明 `redirect`。

虚拟文件：

```json
{
  "children": {
    "project-homepage": {
      "type": "file",
      "description": "项目主页",
      "redirect": {
        "url": "https://github.com/LetsShareAll/ShareFile",
        "type": "direct"
      }
    }
  }
}
```

虚拟目录：

```json
{
  "children": {
    "external-docs": {
      "type": "folder",
      "description": "外部文档",
      "redirect": {
        "url": "https://example.com/docs",
        "type": "confirm",
        "confirm_message": "即将打开外部文档"
      }
    }
  }
}
```

## 重定向

`redirect.type` 支持：

| 值        | 行为               |
| --------- | ------------------ |
| `direct`  | 直接跳转           |
| `confirm` | 跳转前显示确认提示 |

`confirm_message` 只在 `type: "confirm"` 时有意义。

## 外部挂载

`mount_source` 用于把外部索引挂载到当前目录。

```json
{
  "self": {
    "description": "共享文件",
    "mount_source": {
      "provider": "github",
      "repository": "LetsShareAll/ShareFile",
      "branch": "file",
      "sub_path": "/",
      "access_cdn": "jsdelivr",
      "use_cdn_index": true
    }
  },
  "children": {}
}
```

字段说明：

| 字段            | 说明                                          |
| --------------- | --------------------------------------------- |
| `provider`      | 当前支持 `github`                             |
| `repository`    | `owner/repo`                                  |
| `branch`        | 分支名，省略时会尝试 `main` 并回退到 `master` |
| `sub_path`      | 只挂载外部索引中的某个子路径                  |
| `access_cdn`    | `jsdelivr`、`raw` 或自定义 CDN 基础 URL       |
| `use_cdn_index` | 是否加载外部的 `share-file.cdn.json`          |

## `share-file.json`

`share-file.json` 是前端消费的扁平化索引。它包含：

```json
{
  "root_id": "/",
  "path_index": {
    "/": "/",
    "/example.pdf": "/example.pdf"
  },
  "nodes": {
    "/": {
      "id": "/",
      "name": "",
      "type": "folder",
      "parent": null,
      "children": ["/example.pdf"]
    }
  }
}
```

前端不递归读取目录中的 `._info.json`，只加载 `share-file.json` 或 `share-file.cdn.json`。

## 规范化

项目当前使用 snake_case 字段，例如：

```text
mount_source
sub_path
access_cdn
use_cdn_index
root_id
path_index
```

新增字段时应优先沿用 snake_case，并同步更新：

- `src/packages/types/src/schema.ts`
- `src/packages/types/src/json-normalize.ts`
- `src/packages/cli/src/generate-info.ts`
- `src/packages/cli/src/generate-share-file.ts`
- `src/packages/ui/src/*`
- `src/packages/python-tools/*`
