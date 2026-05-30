# ShareFile file 分支

这个分支只负责存放分享文件和文件索引。网站 UI、CLI 源码、构建配置和 GitHub Pages 部署逻辑在 `main` 分支维护。

`file` 分支的内容会被主站作为外部文件源加载。这里的核心产物是：

- `share-file.json`：文件树索引。
- `share-file.cdn.json`：带 CDN 下载地址的文件树索引。
- `._info.json`：当前目录的元数据。
- 各子目录中的 `._info.json`：对应目录下文件和子目录的元数据。

## 目录用途

```text
.
├── documents/        文档类文件
├── music/            音频文件
├── others/           其他类型文件
├── pictures/         图片文件
├── softwares/        软件、工具、压缩包等
├── videos/           视频文件
├── ._info.json       根目录元数据
├── share-file.json   自动生成的索引
└── share-file.cdn.json
```

实际分类可以按需要调整。新增目录后，建议同步维护对应目录的 `._info.json`，让前端展示更清晰。

## 更新文件

常规流程：

1. 切到 `file` 分支。
2. 把文件放入合适的目录，例如 `documents/` 或 `softwares/`。
3. 如需展示说明、版本号、隐藏状态或重定向，编辑对应目录的 `._info.json`。
4. 提交并推送到 `file` 分支。

推送后，`.github/workflows/generate-index.yml` 会自动：

1. 从 `main` 分支取索引生成工具。
2. 递归更新各目录的 `._info.json`。
3. 生成 `share-file.json` 和 `share-file.cdn.json`。
4. 将生成结果提交回 `file` 分支。

README 和 `.github/**` 的变更不会触发索引生成。

## 元数据格式

每个目录可以包含一个 `._info.json`：

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

常用字段：

| 字段 | 位置 | 说明 |
| --- | --- | --- |
| `description` | `self` / 子节点 | 展示说明 |
| `hidden` | `self` / 子节点 | 是否在前端标记为隐藏 |
| `type` | 子节点 | `file` 或 `folder`，虚拟节点必须填写 |
| `version` | 文件节点 | 文件版本 |
| `size` | 文件节点 | 文件大小，通常由工具自动更新 |
| `md5` | 文件节点 | MD5，通常由工具自动更新 |
| `sha256` | 文件节点 | SHA256，通常由工具自动更新 |
| `created_at` | `self` / 子节点 | 创建时间 |
| `updated_at` | `self` / 子节点 | 更新时间 |
| `redirect` | 子节点 | 外部链接或跳转配置 |
| `hold` | 子节点 | 锁定自动生成字段，避免被覆盖 |

JSON 字段统一使用 `snake_case`。

## 锁定字段

如果某些字段需要手动维护，可以使用 `hold`。

锁定全部自动字段：

```json
{
  "release.zip": {
    "description": "手动维护的发布包",
    "size": 1048576,
    "md5": "d41d8cd98f00b204e9800998ecf8427e",
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "hold": true
  }
}
```

只锁定哈希：

```json
{
  "manual.pdf": {
    "description": "大小和时间允许自动更新，哈希保持手动值",
    "hold": {
      "hash": true
    }
  }
}
```

可锁定字段：

- `size`
- `hash`
- `created_at`
- `updated_at`

## 虚拟节点与重定向

物理文件不存在时，也可以用 `._info.json` 定义虚拟文件或虚拟目录。虚拟节点必须显式声明 `type`。

```json
{
  "children": {
    "latest-release": {
      "type": "file",
      "description": "跳转到最新发布包",
      "redirect": {
        "url": "https://example.com/releases/latest",
        "type": "confirm",
        "confirm_message": "即将打开外部页面，是否继续？"
      }
    }
  }
}
```

`redirect.type` 支持：

- `direct`：直接跳转。
- `confirm`：先确认，再跳转。

## 注意事项

- 不要手动编辑 `share-file.json` 和 `share-file.cdn.json`，它们由 CI 生成。
- `public/` 是 CI 临时取工具时使用的目录，工作流结束前会清理，不属于 file 分支的文件存储结构。
- 大文件应直接放在分类目录中，不需要放入 `public/`。
- 如果只是修改 README，不会触发索引生成。
- 如果修改了元数据但没有文件内容变更，仍然需要提交到 `file` 分支，CI 才会重新生成索引。

## 许可证

本项目使用 GPL-3.0 license。详见 `LICENSE`。
