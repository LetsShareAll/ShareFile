# ShareFile 文件源分支

这个分支是 ShareFile 主站使用的外部文件源。它负责保存可分享的文件、目录元数据和自动生成的文件索引；网站 UI、CLI 源码、构建配置和工具发布流程以 `main` 分支为准。

主站读取这里的索引后展示目录树，并按节点类型提供下载、预览或外部跳转。

## 分支内容

核心文件：

| 路径                                   | 用途                             | 维护方式                              |
| -------------------------------------- | -------------------------------- | ------------------------------------- |
| `documents/`                           | 文档、脚本、配置、样式等文本资源 | 手动放置文件，CI 更新元数据           |
| `music/`                               | 音频文件                         | 手动放置文件，CI 更新元数据           |
| `pictures/`                            | 图片、图标和 SVG 资源            | 手动放置文件，CI 更新元数据           |
| `softwares/`                           | 应用、工具包、游戏、系统相关资源 | 手动放置文件或虚拟节点，CI 更新元数据 |
| `videos/`                              | 视频文件和视频分类目录           | 手动放置文件，CI 更新元数据           |
| `others/`                              | 字体等不适合归入其他分类的资源   | 手动放置文件，CI 更新元数据           |
| `._info.json`                          | 当前目录的元数据                 | 可手动补充说明；自动字段由 CI 更新    |
| `share-file.json`                      | 前端使用的文件树索引             | CI 自动生成                           |
| `share-file.cdn.json`                  | 带 CDN 下载地址的文件树索引      | CI 自动生成                           |
| `.github/workflows/generate-index.yml` | `file` 分支索引生成工作流        | 手动维护                              |

目录可以只包含 `._info.json`，用于声明空分类、虚拟目录或外部跳转节点。不要把 `node_modules/`、`dist/`、`__pycache__/`、`*.pyc` 等本地构建产物当成文件源内容提交。

## 更新流程

常规更新：

1. 切换到 `file` 分支。
2. 把真实文件放入合适分类目录，例如 `documents/`、`pictures/` 或 `softwares/`。
3. 如需更清晰的展示名称、说明、版本、跳转或字段锁定，编辑对应目录的 `._info.json`。
4. 提交并推送到 `file` 分支。

推送后，`.github/workflows/generate-index.yml` 会自动运行：

1. 签出 `file` 分支。
2. 从 `origin/main` 取得 `generate-info-linux` 和 `generate-share-file-linux`。
3. 执行 `generate-info-linux . --recursive`，递归更新目录元数据。
4. 执行 `generate-share-file-linux . ./share-file.json --cdn-url "https://cdn-file.lssa.fun"`，生成 `share-file.json` 和 `share-file.cdn.json`。
5. 如果产生变更，将结果提交回 `file` 分支。

修改 `README.md` 或 `.github/**` 不会触发自动生成。需要手动重跑时，可以在 GitHub Actions 中使用 `workflow_dispatch`。

## 元数据文件

每个目录都可以包含一个 `._info.json`：

```json
{
  "self": {
    "description": "当前目录说明"
  },
  "children": {
    "example.pdf": {
      "type": "file",
      "description": "示例文档",
      "version": "1.0.0"
    },
    "tools": {
      "type": "folder",
      "description": "工具目录"
    }
  }
}
```

`self` 描述当前目录本身；`children` 描述当前目录下的文件、子目录或虚拟节点。字段统一使用 `snake_case`。

常用字段：

| 字段          | 位置            | 说明                                                  |
| ------------- | --------------- | ----------------------------------------------------- |
| `type`        | 子节点          | 节点类型，通常是 `file` 或 `folder`；虚拟节点必须填写 |
| `description` | `self` / 子节点 | 前端展示说明                                          |
| `hidden`      | `self` / 子节点 | 是否在前端标记为隐藏                                  |
| `version`     | 文件节点        | 文件版本                                              |
| `size`        | 文件节点        | 文件大小，通常由生成工具更新                          |
| `md5`         | 文件节点        | MD5，通常由生成工具更新                               |
| `sha256`      | 文件节点        | SHA256，通常由生成工具更新                            |
| `created_at`  | `self` / 子节点 | 创建时间                                              |
| `updated_at`  | `self` / 子节点 | 更新时间                                              |
| `redirect`    | 子节点          | 外部链接或跳转配置                                    |
| `hold`        | 子节点          | 锁定自动字段，避免被生成工具覆盖                      |

生成工具会保留人工维护的说明、版本、跳转和锁定配置，并更新文件大小、哈希和时间等自动字段。

## 虚拟节点与跳转

物理文件不存在时，也可以在 `._info.json` 里声明虚拟文件或虚拟目录。虚拟节点必须显式写出 `type`。

```json
{
  "children": {
    "Python.tar.gz": {
      "type": "file",
      "description": "源代码压缩包",
      "redirect": {
        "url": "https://github.com/LetsShareAll/file/releases/download/applications/Python.tar.gz",
        "type": "direct"
      }
    },
    "Clash for Windows": {
      "type": "folder",
      "description": "文件夹",
      "redirect": {
        "url": "https://www.123pan.com/s/example.html",
        "type": "confirm",
        "confirm_message": "即将离开本站，是否继续？"
      }
    }
  }
}
```

`redirect.type` 支持：

| 值        | 行为                   |
| --------- | ---------------------- |
| `direct`  | 直接跳转               |
| `confirm` | 先显示确认信息，再跳转 |

真实文件节点会在 `share-file.cdn.json` 中获得 CDN 下载地址。带 `redirect` 的节点使用外部跳转，不会再生成本地下载地址。

## 锁定自动字段

如果某些自动字段需要手动维护，可以使用 `hold`。

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

只锁定哈希：

```json
{
  "children": {
    "manual.pdf": {
      "type": "file",
      "description": "大小和时间允许自动更新，哈希保持手动值",
      "hold": {
        "hash": true
      }
    }
  }
}
```

可锁定字段：

| 字段         | 作用                       |
| ------------ | -------------------------- |
| `size`       | 保留手写文件大小           |
| `hash`       | 保留手写 `md5` 和 `sha256` |
| `created_at` | 保留手写创建时间           |
| `updated_at` | 保留手写更新时间           |

## 索引文件

`share-file.json` 和 `share-file.cdn.json` 是前端消费的扁平化索引，包含：

- `root_id`：根节点 ID。
- `path_index`：路径到节点 ID 的映射。
- `nodes`：每个文件、目录、虚拟节点的详细信息。
- `children`：目录节点的子节点列表。
- `redirect_url`、`redirect_type`、`redirect_confirm_message`：由 `redirect` 扁平化得到的跳转字段。
- `url`：仅在 CDN 索引中为真实文件节点生成的下载地址。

不要手动编辑这两个文件。需要改变展示效果时，修改真实文件或对应目录的 `._info.json`，再让 CI 重新生成。

## 维护约定

- 分类目录优先使用 `documents/`、`music/`、`pictures/`、`softwares/`、`videos/`、`others/`。
- 新增目录时建议同时维护该目录的 `._info.json`，至少写清楚 `self.description`。
- 外部网盘、GitHub Release 或其他站点资源优先建成带 `redirect` 的虚拟节点。
- 大文件可以直接放在分类目录中；如果文件不适合进仓库，用虚拟节点指向外部地址。
- 只改元数据也需要提交到 `file` 分支，CI 才会重新生成索引。
- `main` 分支负责开发，`file` 分支负责内容；不要在 `file` 分支上维护应用源码。

## 许可证

本项目使用 GPL-3.0 license。详见 `LICENSE`。
