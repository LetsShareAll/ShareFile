const fs = require('fs')
const path = require('path')

/**
 * 生成索引文件的主函数
 */
function generateIndex() {
  const rootDir = process.cwd()
  console.log('当前工作目录:', rootDir)

  const templateDir = path.join(rootDir, 'assets/templates')
  console.log('模板目录:', templateDir)

  // 检查模板文件是否存在
  if (!fs.existsSync(path.join(templateDir, 'index-template.html'))) {
    console.error('错误: 找不到 index-template.html')
    return
  }

  if (
    !fs.existsSync(path.join(rootDir, 'assets/scripts/file-info-template.js'))
  ) {
    console.error('错误: 找不到 file-info-template.js')
    return
  }

  // 读取模板文件
  const indexTemplate = fs.readFileSync(
    path.join(templateDir, 'index-template.html'),
    'utf8'
  )

  const fileInfoTemplate = fs.readFileSync(
    path.join(rootDir, 'assets/scripts/file-info-template.js'),
    'utf8'
  )

  console.log('模板读取成功')

  // 读取隐藏文件配置
  const hiddenFiles = readHiddenFiles(rootDir)
  console.log('隐藏文件列表:', Array.from(hiddenFiles))

  // 从根目录开始遍历
  let generatedCount = 0
  let emptyDirs = [] // 存储空目录路径

  const result = traverseDirectory(
    rootDir,
    rootDir,
    hiddenFiles,
    indexTemplate,
    fileInfoTemplate,
    generatedCount,
    emptyDirs
  )

  console.log(`\n索引生成完成！共生成 ${result.generatedCount} 个目录的文件`)

  // 输出空目录统计信息
  if (result.emptyDirs.length > 0) {
    console.warn(
      `\n警告: 发现 ${result.emptyDirs.length} 个空目录且没有 .redirect 文件:`
    )
    result.emptyDirs.forEach((dir) => {
      const relativePath = path.relative(rootDir, dir)
      console.warn(`  - ${relativePath}`)
    })
    console.warn('\n建议: 为这些空目录添加内容或添加 .redirect 文件')
  } else {
    console.log('✓ 所有目录都有内容或重定向文件')
  }
}

/**
 * 读取隐藏文件配置
 */
function readHiddenFiles(rootDir) {
  const hiddenFilePath = path.join(rootDir, '.hidden')
  if (!fs.existsSync(hiddenFilePath)) {
    console.log('未找到 .hidden 文件')
    return new Set()
  }

  const content = fs.readFileSync(hiddenFilePath, 'utf8').trim()
  const hiddenSet = new Set(
    content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line)
  )
  console.log('从 .hidden 读取到', hiddenSet.size, '个隐藏项')
  return hiddenSet
}

/**
 * 递归遍历目录并生成文件
 */
function traverseDirectory(
  currentDir,
  rootDir,
  hiddenFiles,
  indexTemplate,
  fileInfoTemplate,
  generatedCount,
  emptyDirs
) {
  console.log('\n处理目录:', currentDir)

  // 检查是否应该跳过此目录
  const relativePath = path.relative(rootDir, currentDir)
  if (shouldSkipDirectory(currentDir, rootDir, hiddenFiles, relativePath)) {
    console.log('跳过目录:', currentDir)
    return { generatedCount, emptyDirs }
  }

  let items
  try {
    items = fs.readdirSync(currentDir)
  } catch (error) {
    console.error('无法读取目录:', currentDir, error.message)
    return { generatedCount, emptyDirs }
  }

  console.log('目录内容:', items)

  // 过滤隐藏文件和目录
  const visibleItems = items.filter((item) => {
    return !shouldSkipItem(currentDir, item, rootDir, hiddenFiles)
  })

  console.log('可见项目:', visibleItems)

  // 检查是否有重定向文件
  const hasRedirect = fs.existsSync(path.join(currentDir, '.redirect'))

  // 检查空目录警告条件
  if (visibleItems.length === 0 && !hasRedirect) {
    console.warn(`警告: 目录 ${currentDir} 为空且没有 .redirect 文件`)
    emptyDirs.push(currentDir)
  }

  // 生成 file-info.js
  const fileInfoGenerated = generateFileInfo(
    currentDir,
    rootDir,
    visibleItems,
    fileInfoTemplate
  )

  // 生成 index.html
  const indexGenerated = generateIndexHtml(currentDir, indexTemplate)

  if (fileInfoGenerated || indexGenerated) {
    generatedCount++
    console.log(`在 ${currentDir} 生成文件成功`)
  }

  // 递归处理子目录
  visibleItems.forEach((item) => {
    const fullPath = path.join(currentDir, item)
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        const result = traverseDirectory(
          fullPath,
          rootDir,
          hiddenFiles,
          indexTemplate,
          fileInfoTemplate,
          generatedCount,
          emptyDirs
        )
        generatedCount = result.generatedCount
        emptyDirs = result.emptyDirs
      }
    } catch (error) {
      console.error('无法访问:', fullPath, error.message)
    }
  })

  return { generatedCount, emptyDirs }
}

/**
 * 检查是否应该跳过目录
 */
function shouldSkipDirectory(currentDir, rootDir, hiddenFiles, relativePath) {
  // 跳过 assets 目录（根据 .hidden 文件）
  if (relativePath === 'assets' || currentDir.includes('assets')) {
    return true
  }

  // 跳过 .github 目录
  if (relativePath.startsWith('.github')) {
    return true
  }

  // 跳过隐藏文件中的目录
  const dirName = path.basename(currentDir)
  if (hiddenFiles.has(dirName) || hiddenFiles.has(relativePath)) {
    return true
  }

  return false
}

/**
 * 检查是否应该跳过项目
 */
function shouldSkipItem(currentDir, item, rootDir, hiddenFiles) {
  const fullPath = path.join(currentDir, item)
  const relativePath = path.relative(rootDir, fullPath)

  // 跳过隐藏文件配置中的项目
  if (hiddenFiles.has(item) || hiddenFiles.has(relativePath)) {
    console.log('跳过隐藏项目:', item)
    return true
  }

  // 跳过以点开头的隐藏文件（除了 .redirect）
  if (item.startsWith('.') && item !== '.redirect') {
    console.log('跳过点文件:', item)
    return true
  }

  // 跳过生成的文件本身
  if (item === 'file-info.js' || item === 'index.html') {
    console.log('跳过生成的文件:', item)
    return true
  }

  // 跳过特定的系统文件
  const skipFiles = [
    '.gitignore',
    '.prettierrc',
    'LICENSE',
    'README.md',
    '.hidden'
  ]
  if (skipFiles.includes(item)) {
    console.log('跳过系统文件:', item)
    return true
  }

  return false
}

/**
 * 生成 file-info.js 文件
 */
function generateFileInfo(currentDir, rootDir, visibleItems, fileInfoTemplate) {
  const redirectInfo = readRedirectInfo(currentDir)
  const fileList = generateFileList(currentDir, rootDir, visibleItems)

  let fileInfoContent

  if (Object.keys(redirectInfo).length > 0) {
    // 有重定向信息
    fileInfoContent = `const redirectFileInfo = ${JSON.stringify(
      redirectInfo,
      null,
      2
    )}\n\nconst fileList = ${JSON.stringify(fileList, null, 2)}`
  } else {
    // 无重定向信息
    fileInfoContent = `const redirectFileInfo = {}\n\nconst fileList = ${JSON.stringify(
      fileList,
      null,
      2
    )}`
  }

  const fileInfoPath = path.join(currentDir, 'file-info.js')

  // 检查内容是否有变化，避免不必要的写入
  let shouldWrite = true
  if (fs.existsSync(fileInfoPath)) {
    const existingContent = fs.readFileSync(fileInfoPath, 'utf8')
    if (existingContent === fileInfoContent) {
      console.log('file-info.js 内容未变化，跳过写入')
      shouldWrite = false
    }
  }

  if (shouldWrite) {
    fs.writeFileSync(fileInfoPath, fileInfoContent, 'utf8')
    console.log('生成 file-info.js')
    return true
  }

  return false
}

/**
 * 读取重定向信息
 */
function readRedirectInfo(currentDir) {
  const redirectPath = path.join(currentDir, '.redirect')

  if (!fs.existsSync(redirectPath)) {
    return {}
  }

  console.log('找到 .redirect 文件:', redirectPath)

  const content = fs.readFileSync(redirectPath, 'utf8').trim()
  const lines = content.split('\n')
  const redirectInfo = {}

  lines.forEach((line) => {
    const [key, ...valueParts] = line.split(':')
    if (key && valueParts.length > 0) {
      const value = valueParts.join(':').trim()
      redirectInfo[key.trim()] = value
    }
  })

  console.log('重定向信息:', redirectInfo)
  return redirectInfo
}

/**
 * 生成文件列表
 */
function generateFileList(currentDir, rootDir, visibleItems) {
  const fileList = []

  visibleItems.forEach((item) => {
    const fullPath = path.join(currentDir, item)

    try {
      const stat = fs.statSync(fullPath)
      const relativePath = path.relative(rootDir, fullPath)

      const fileInfo = {
        iconClass: getIconClass(item, stat),
        name: item,
        type: stat.isDirectory() ? getFolderType(item) : getFileType(item),
        version: '-',
        date: formatDate(stat.mtime),
        description: getDescription(item, stat, relativePath)
      }

      fileList.push(fileInfo)
    } catch (error) {
      console.error('无法获取文件信息:', fullPath, error.message)
    }
  })

  // 排序：文件夹在前，文件在后，按名称排序
  fileList.sort((a, b) => {
    if (a.type === '文件夹' && b.type !== '文件夹') return -1
    if (a.type !== '文件夹' && b.type === '文件夹') return 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })

  return fileList
}

/**
 * 获取图标类名
 */
function getIconClass(item, stat) {
  // 检查是否是特殊文件夹（名称中包含文件扩展名）
  const specialFolderInfo = getSpecialFolderInfo(item)
  if (stat.isDirectory() && specialFolderInfo.isSpecial) {
    return specialFolderInfo.iconClass
  }

  if (stat.isDirectory()) {
    return 'icon-directory'
  }

  // 对于文件，使用扩展名获取图标
  const ext = path.extname(item).toLowerCase()
  const iconClass = getIconClassByExtension(ext)

  return iconClass || 'icon-file'
}

/**
 * 获取特殊文件夹信息
 */
function getSpecialFolderInfo(folderName) {
  // 常见文件扩展名列表
  const extensions = [
    '.tar.gz',
    '.tar.bz2',
    '.tar.xz', // 压缩文件扩展名
    '.exe',
    '.msi',
    '.app',
    '.dmg', // 可执行文件扩展名
    '.zip',
    '.rar',
    '.7z',
    '.gz',
    '.bz2', // 压缩文件
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx', // 文档
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.bmp',
    '.webp',
    '.svg', // 图片
    '.mp3',
    '.wav',
    '.flac',
    '.aac',
    '.ogg', // 音频
    '.mp4',
    '.avi',
    '.mkv',
    '.mov',
    '.wmv', // 视频
    '.js',
    '.css',
    '.html',
    '.htm',
    '.php',
    '.py',
    '.java', // 代码
    '.ttf',
    '.otf',
    '.woff',
    '.woff2' // 字体
  ]

  for (const ext of extensions) {
    if (folderName.toLowerCase().endsWith(ext)) {
      const iconClass = getIconClassByExtension(ext)
      return {
        isSpecial: true,
        iconClass: iconClass,
        extension: ext
      }
    }
  }

  return { isSpecial: false }
}

/**
 * 根据扩展名获取图标类
 */
function getIconClassByExtension(ext) {
  const iconMap = {
    '.tar.gz': 'icon-archive',
    '.tar.bz2': 'icon-archive',
    '.tar.xz': 'icon-archive',
    '.exe': 'icon-executable',
    '.msi': 'icon-executable',
    '.app': 'icon-executable',
    '.dmg': 'icon-executable',
    '.zip': 'icon-archive',
    '.rar': 'icon-archive',
    '.7z': 'icon-archive',
    '.gz': 'icon-archive',
    '.bz2': 'icon-archive',
    '.pdf': 'icon-document',
    '.doc': 'icon-document',
    '.docx': 'icon-document',
    '.xls': 'icon-document',
    '.xlsx': 'icon-document',
    '.jpg': 'icon-image',
    '.jpeg': 'icon-image',
    '.png': 'icon-image',
    '.gif': 'icon-image',
    '.bmp': 'icon-image',
    '.webp': 'icon-image',
    '.svg': 'icon-image',
    '.flac': 'icon-music',
    '.mp3': 'icon-music',
    '.wav': 'icon-music',
    '.aac': 'icon-music',
    '.ogg': 'icon-music',
    '.mp4': 'icon-video',
    '.avi': 'icon-video',
    '.mkv': 'icon-video',
    '.mov': 'icon-video',
    '.wmv': 'icon-video',
    '.js': 'icon-script',
    '.css': 'icon-style',
    '.html': 'icon-html',
    '.htm': 'icon-html',
    '.php': 'icon-script',
    '.py': 'icon-script',
    '.java': 'icon-script',
    '.ttf': 'icon-font',
    '.otf': 'icon-font',
    '.woff': 'icon-font',
    '.woff2': 'icon-font',
    '.ps1': 'icon-script',
    '.sh': 'icon-script',
    '.reg': 'icon-config',
    '.ini': 'icon-config',
    '.list': 'icon-list'
  }

  return iconMap[ext] || 'icon-file'
}

/**
 * 获取文件夹类型（处理特殊文件夹）
 */
function getFolderType(folderName) {
  const specialFolderInfo = getSpecialFolderInfo(folderName)
  if (specialFolderInfo.isSpecial) {
    // 特殊文件夹直接显示文件类型，不加"文件夹"后缀
    return getFileTypeByExtension(specialFolderInfo.extension)
  }
  return '文件夹'
}

/**
 * 获取文件类型描述
 */
function getFileType(item) {
  const ext = path.extname(item).toLowerCase()
  return getFileTypeByExtension(ext)
}

/**
 * 根据扩展名获取文件类型
 */
function getFileTypeByExtension(ext) {
  const typeMap = {
    '.js': 'JavaScript 文件',
    '.css': '样式表文件',
    '.html': '网页文件',
    '.png': '图片文件',
    '.jpg': '图片文件',
    '.jpeg': '图片文件',
    '.webp': '图片文件',
    '.svg': '矢量图文件',
    '.flac': '音频文件',
    '.mp3': '音频文件',
    '.wav': '音频文件',
    '.mp4': '视频文件',
    '.avi': '视频文件',
    '.mkv': '视频文件',
    '.exe': '可执行文件',
    '.zip': '压缩文件',
    '.tar.gz': '压缩文件',
    '.rar': '压缩文件',
    '.ttf': '字体文件',
    '.otf': '字体文件',
    '.woff': '字体文件',
    '.woff2': '字体文件',
    '.ps1': 'PowerShell 脚本',
    '.sh': 'Shell 脚本',
    '.reg': '注册表文件',
    '.ini': '配置文件',
    '.list': '列表文件',
    '.pdf': 'PDF 文档',
    '.doc': 'Word 文档',
    '.docx': 'Word 文档',
    '.xls': 'Excel 表格',
    '.xlsx': 'Excel 表格',
    '.msi': '安装程序',
    '.app': '应用程序',
    '.dmg': '磁盘映像',
    '.7z': '压缩文件',
    '.gz': '压缩文件',
    '.bz2': '压缩文件',
    '.gif': '图片文件',
    '.bmp': '图片文件',
    '.aac': '音频文件',
    '.ogg': '音频文件',
    '.mov': '视频文件',
    '.wmv': '视频文件',
    '.htm': '网页文件',
    '.php': 'PHP 脚本',
    '.py': 'Python 脚本',
    '.java': 'Java 文件'
  }

  return typeMap[ext] || '文件'
}

/**
 * 获取文件描述
 */
function getDescription(item, stat, relativePath) {
  // 检查是否是特殊文件夹
  const specialFolderInfo = getSpecialFolderInfo(item)
  if (stat.isDirectory() && specialFolderInfo.isSpecial) {
    return getDescriptionByExtension(specialFolderInfo.extension)
  }

  if (stat.isDirectory()) {
    const dirDescriptions = {
      assets: '资源文件',
      documents: '文档',
      music: '音乐',
      pictures: '图片',
      softwares: '软件',
      videos: '视频',
      others: '其他',
      scripts: '脚本',
      styles: '样式',
      templates: '模板',
      proxy: '代理配置',
      config: '配置文件',
      ruleset: '规则集',
      chain: '代理链',
      font: '字体文件',
      movie: '电影',
      series: '剧集',
      cartoon: '动画',
      television: '电视剧',
      application: '应用程序',
      game: '游戏',
      system: '系统',
      android: '安卓',
      windows: 'Windows',
      linux: 'Linux',
      apple: '苹果',
      nintendo: '任天堂',
      sony: '索尼',
      java: 'Java',
      switch: 'Switch',
      wiiu: 'Wii U',
      playstation3: 'PlayStation 3',
      code: '代码',
      network: '网络工具',
      remote: '远程工具',
      tool: '工具'
    }

    return dirDescriptions[item] || '文件夹'
  }

  const ext = path.extname(item).toLowerCase()
  return getDescriptionByExtension(ext)
}

/**
 * 根据扩展名获取描述
 */
function getDescriptionByExtension(ext) {
  const descMap = {
    '.js': 'JavaScript 脚本',
    '.css': '样式表',
    '.html': '网页',
    '.png': '图片',
    '.jpg': '图片',
    '.webp': '图片',
    '.svg': '矢量图形',
    '.flac': '无损音频',
    '.mp4': '视频',
    '.exe': '应用程序',
    '.zip': '压缩包',
    '.tar.gz': '压缩包',
    '.ttf': '字体',
    '.ps1': 'PowerShell 脚本',
    '.sh': 'Shell 脚本',
    '.reg': '注册表配置',
    '.ini': '配置文件',
    '.list': '规则列表',
    '.pdf': 'PDF 文档',
    '.doc': 'Word 文档',
    '.docx': 'Word 文档',
    '.xls': 'Excel 表格',
    '.xlsx': 'Excel 表格',
    '.msi': '安装程序',
    '.app': '应用程序',
    '.dmg': '磁盘映像',
    '.rar': '压缩包',
    '.7z': '压缩包',
    '.gz': '压缩包',
    '.bz2': '压缩包',
    '.jpeg': '图片',
    '.gif': '动态图片',
    '.bmp': '位图',
    '.mp3': '音频',
    '.wav': '音频',
    '.aac': '音频',
    '.ogg': '音频',
    '.avi': '视频',
    '.mkv': '视频',
    '.mov': '视频',
    '.wmv': '视频',
    '.htm': '网页',
    '.php': 'PHP 脚本',
    '.py': 'Python 脚本',
    '.java': 'Java 文件',
    '.otf': '字体',
    '.woff': '网页字体',
    '.woff2': '网页字体'
  }

  return descMap[ext] || '文件'
}

/**
 * 格式化日期
 */
function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

/**
 * 生成 index.html 文件
 */
function generateIndexHtml(currentDir, indexTemplate) {
  const indexPath = path.join(currentDir, 'index.html')

  // 检查内容是否有变化，避免不必要的写入
  let shouldWrite = true
  if (fs.existsSync(indexPath)) {
    const existingContent = fs.readFileSync(indexPath, 'utf8')
    if (existingContent === indexTemplate) {
      console.log('index.html 内容未变化，跳过写入')
      shouldWrite = false
    }
  }

  if (shouldWrite) {
    fs.writeFileSync(indexPath, indexTemplate, 'utf8')
    console.log('生成 index.html')
    return true
  }

  return false
}

// 执行生成
if (require.main === module) {
  console.log('开始生成索引文件...')
  generateIndex()
}

module.exports = { generateIndex }
