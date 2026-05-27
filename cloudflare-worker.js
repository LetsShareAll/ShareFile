/**
 * Cloudflare Worker - GitHub CDN 代理
 * 用于代理 GitHub 仓库文件
 *
 * 部署方式：
 * 1. 登录 Cloudflare Dashboard (https://dash.cloudflare.com)
 * 2. 进入 Workers & Pages
 * 3. 创建新 Worker
 * 4. 复制此代码并部署
 * 5. 绑定自定义域名（可选）
 */

// 配置区域
const GITHUB_USER = 'LetsShareAll';
const GITHUB_REPO = 'ShareFile';
const GITHUB_BRANCH = 'file'; // 或 'file'，根据你的主分支

// GitHub Raw 文件 URL 模板
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}`;

// 允许的文件扩展名（安全考虑）
const ALLOWED_EXTENSIONS = [
  // 文档
  '.md',
  '.txt',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  '.rtf',
  // 图片
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.tif',
  '.avif',
  // 视频
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  '.flv',
  '.wmv',
  '.m4v',
  '.mpg',
  '.mpeg',
  // 音频
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.flac',
  '.aac',
  '.wma',
  '.opus',
  // 压缩包
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz',
  '.bz2',
  '.xz',
  '.tgz',
  '.tbz2',
  // 代码与脚本
  '.js',
  '.css',
  '.html',
  '.json',
  '.xml',
  '.yaml',
  '.yml',
  '.sh',
  '.bash',
  '.ps1',
  '.bat',
  '.cmd',
  '.py',
  '.rb',
  '.php',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.go',
  '.rs',
  '.ts',
  '.tsx',
  '.jsx',
  '.vue',
  '.sql',
  // 配置文件
  '.ini',
  '.conf',
  '.cfg',
  '.toml',
  '.env',
  '.properties',
  '.reg',
  // 字体
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  // 可执行文件
  '.exe',
  '.msi',
  '.dmg',
  '.pkg',
  '.deb',
  '.rpm',
  '.appimage',
  '.apk',
  // 数据文件
  '.csv',
  '.tsv',
  '.dat',
  '.db',
  '.sqlite',
  '.sqlite3',
  // 列表文件
  '.list',
  '.m3u',
  '.m3u8',
  '.pls',
  // 其他
  '.iso',
  '.img',
  '.bin',
  '.log',
  '.bak',
  '.tmp',
];

// MIME 类型映射
const MIME_TYPES = {
  // HTML/CSS/JS
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  // 文档
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.rtf': 'application/rtf',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  // 图片
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.avif': 'image/avif',
  // 视频
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv',
  '.m4v': 'video/x-m4v',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  // 音频
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.wma': 'audio/x-ms-wma',
  '.opus': 'audio/opus',
  '.m3u': 'audio/x-mpegurl',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.pls': 'audio/x-scpls',
  // 压缩包
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.bz2': 'application/x-bzip2',
  '.xz': 'application/x-xz',
  '.tgz': 'application/gzip',
  '.tbz2': 'application/x-bzip2',
  // 字体
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  // 脚本
  '.sh': 'application/x-sh',
  '.bash': 'application/x-sh',
  '.ps1': 'application/x-powershell',
  '.bat': 'application/x-bat',
  '.cmd': 'application/x-bat',
  '.py': 'text/x-python; charset=utf-8',
  '.rb': 'text/x-ruby; charset=utf-8',
  '.php': 'text/x-php; charset=utf-8',
  '.java': 'text/x-java; charset=utf-8',
  '.c': 'text/x-c; charset=utf-8',
  '.cpp': 'text/x-c++; charset=utf-8',
  '.h': 'text/x-c; charset=utf-8',
  '.hpp': 'text/x-c++; charset=utf-8',
  '.go': 'text/x-go; charset=utf-8',
  '.rs': 'text/x-rust; charset=utf-8',
  '.ts': 'text/typescript; charset=utf-8',
  '.tsx': 'text/typescript; charset=utf-8',
  '.jsx': 'text/jsx; charset=utf-8',
  '.vue': 'text/x-vue; charset=utf-8',
  '.sql': 'application/sql; charset=utf-8',
  // 配置文件
  '.ini': 'text/plain; charset=utf-8',
  '.conf': 'text/plain; charset=utf-8',
  '.cfg': 'text/plain; charset=utf-8',
  '.toml': 'text/plain; charset=utf-8',
  '.env': 'text/plain; charset=utf-8',
  '.properties': 'text/plain; charset=utf-8',
  '.reg': 'text/plain; charset=utf-8',
  '.list': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  // 可执行文件
  '.exe': 'application/vnd.microsoft.portable-executable',
  '.msi': 'application/x-msi',
  '.dmg': 'application/x-apple-diskimage',
  '.pkg': 'application/x-newton-compatible-pkg',
  '.deb': 'application/vnd.debian.binary-package',
  '.rpm': 'application/x-rpm',
  '.appimage': 'application/x-executable',
  '.apk': 'application/vnd.android.package-archive',
  // 数据文件
  '.dat': 'application/octet-stream',
  '.db': 'application/x-sqlite3',
  '.sqlite': 'application/x-sqlite3',
  '.sqlite3': 'application/x-sqlite3',
  // 其他
  '.iso': 'application/x-iso9660-image',
  '.img': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.bak': 'application/octet-stream',
  '.tmp': 'application/octet-stream',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 健康检查端点
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'GitHub CDN Proxy',
          repo: `${GITHUB_USER}/${GITHUB_REPO}`,
          branch: GITHUB_BRANCH,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }

    // 获取请求路径
    const pathname = url.pathname;

    // 检查文件扩展名
    const ext = pathname.substring(pathname.lastIndexOf('.')).toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return new Response('File type not allowed', {
        status: 403,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // 构建 GitHub Raw URL
    const githubUrl = `${GITHUB_RAW_BASE}${pathname}`;

    // 尝试从缓存获取
    const cache = caches.default;
    let response = await cache.match(request);

    if (response) {
      // 缓存命中
      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-Cache-Status', 'HIT');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    // 缓存未命中，从 GitHub 获取
    try {
      response = await fetch(githubUrl, {
        cf: {
          // Cloudflare 特定选项
          cacheTtl: 3600, // 缓存 1 小时（可根据需要调整：300=5分钟, 1800=30分钟, 86400=1天）
          cacheEverything: true,
        },
      });

      if (!response.ok) {
        return new Response(`File not found: ${pathname}`, {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      // 构建新响应头
      const headers = new Headers(response.headers);

      // 设置 MIME 类型
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
      headers.set('Content-Type', mimeType);

      // 设置缓存策略
      headers.set('Cache-Control', 'public, max-age=3600'); // 浏览器缓存 1 小时
      headers.set('X-Cache-Status', 'MISS');

      // CORS 支持
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      headers.set('Access-Control-Max-Age', '86400');

      // 其他头部
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-GitHub-Repo', `${GITHUB_USER}/${GITHUB_REPO}`);

      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
      });

      // 存入缓存
      ctx.waitUntil(cache.put(request, newResponse.clone()));

      return newResponse;
    } catch (error) {
      return new Response(`Error fetching file: ${error.message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  },
};
