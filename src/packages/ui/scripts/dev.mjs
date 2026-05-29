import esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfig } from './esbuild.config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const publicRoot = path.join(repoRoot, 'public');
const port = Number.parseInt(process.env.PORT || '4173', 10);
const host = process.env.HOST || '127.0.0.1';
const devEventsPath = '/__share-file/dev-events';

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`Invalid PORT: ${process.env.PORT}`);
  process.exit(1);
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.aac', 'audio/aac'],
  ['.flac', 'audio/flac'],
  ['.m4a', 'audio/mp4'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.wav', 'audio/wav'],
  ['.avi', 'video/x-msvideo'],
  ['.flv', 'video/x-flv'],
  ['.mkv', 'video/x-matroska'],
  ['.mov', 'video/quicktime'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
]);

const liveReloadClient = `
<script type="module">
  const source = new EventSource('${devEventsPath}');
  source.addEventListener('reload', event => {
    const data = event.data ? JSON.parse(event.data) : {};
    console.info('[share-file dev] reload:', data.reason || 'change');
    window.location.reload();
  });
</script>`;

const devClients = new Set();
let generateRunning = false;

function resolvePublicPath(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.normalize(path.join(publicRoot, relativePath));

  if (filePath !== publicRoot && !filePath.startsWith(publicRoot + path.sep)) {
    return null;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    return path.join(filePath, 'index.html');
  }

  return filePath;
}

function sendDevEvent(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastDevEvent(event, data) {
  const payload = { ...data, at: new Date().toISOString() };

  for (const response of devClients) {
    sendDevEvent(response, event, payload);
  }
}

function handleDevEvents(request, response) {
  response.writeHead(200, {
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream; charset=utf-8',
    'X-Accel-Buffering': 'no',
  });
  response.write('retry: 1000\n\n');
  sendDevEvent(response, 'connected', { ok: true });

  devClients.add(response);
  request.on('close', () => {
    devClients.delete(response);
  });
}

function createReloadPlugin() {
  let isInitialBuild = true;

  return {
    name: 'share-file-dev-reload',
    setup(build) {
      build.onEnd(result => {
        if (isInitialBuild) {
          isInitialBuild = false;
          return;
        }

        if (result.errors.length === 0) {
          broadcastDevEvent('reload', { reason: 'UI source rebuilt' });
        }
      });
    },
  };
}

function runPnpm(args) {
  const command = process.env.npm_execpath ? process.execPath : 'pnpm';
  const commandArgs = process.env.npm_execpath
    ? [process.env.npm_execpath, ...args]
    : args;

  return new Promise(resolve => {
    let child;

    try {
      child = spawn(command, commandArgs, {
        cwd: repoRoot,
        shell: !process.env.npm_execpath && process.platform === 'win32',
        stdio: 'inherit',
      });
    } catch (error) {
      console.error(`Failed to start ${command}:`, error);
      resolve(1);
      return;
    }

    child.on('error', error => {
      console.error(`Failed to start ${command}:`, error);
      resolve(1);
    });
    child.on('close', code => resolve(code ?? 1));
  });
}

async function runShareFileGenerate(reason) {
  if (generateRunning) {
    return 0;
  }

  generateRunning = true;
  console.log(`Generating share-file indexes (${reason})...`);
  const code = await runPnpm([
    '--filter',
    '@share-file/cli',
    'run',
    'generate',
  ]);
  generateRunning = false;

  if (code === 0) {
    console.log('share-file indexes generated');
  } else {
    console.error(`share-file generation failed with exit code ${code}`);
  }

  return code;
}

async function sendHtmlWithLiveReload(filePath, response) {
  const html = await readFile(filePath, 'utf-8');
  const body = html.includes('</body>')
    ? html.replace('</body>', `${liveReloadClient}\n  </body>`)
    : `${html}\n${liveReloadClient}`;
  const bodyBuffer = Buffer.from(body);

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Length': bodyBuffer.byteLength,
    'Content-Type': 'text/html; charset=utf-8',
  });
  response.end(bodyBuffer);
}

async function sendFile(filePath, request, response) {
  const contentType =
    contentTypes.get(path.extname(filePath).toLowerCase()) ||
    'application/octet-stream';
  const fileSize = statSync(filePath).size;
  const range = request.headers.range;

  if (!range && path.extname(filePath).toLowerCase() === '.html') {
    await sendHtmlWithLiveReload(filePath, response);
    return;
  }

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);

    if (!match) {
      response.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end('Range Not Satisfiable');
      return;
    }

    const [, rawStart, rawEnd] = match;
    let start = rawStart ? Number.parseInt(rawStart, 10) : 0;
    let end = rawEnd ? Number.parseInt(rawEnd, 10) : fileSize - 1;

    if (!rawStart && rawEnd) {
      const suffixLength = Number.parseInt(rawEnd, 10);
      start = Math.max(fileSize - suffixLength, 0);
      end = fileSize - 1;
    }

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end >= fileSize ||
      start > end
    ) {
      response.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end('Range Not Satisfiable');
      return;
    }

    response.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Type': contentType,
    });
    createReadStream(filePath, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Length': fileSize,
    'Content-Type': contentType,
  });
  createReadStream(filePath).pipe(response);
}

const initialGenerateCode = await runShareFileGenerate('startup');

if (initialGenerateCode !== 0) {
  process.exit(initialGenerateCode);
}

const config = createConfig({ dev: true });
config.plugins = [...(config.plugins || []), createReloadPlugin()];

const context = await esbuild.context(config);

await context.watch();

const server = http.createServer(async (request, response) => {
  const requestPath = new URL(request.url || '/', `http://${host}:${port}`)
    .pathname;

  if (requestPath === devEventsPath) {
    handleDevEvents(request, response);
    return;
  }

  const filePath = resolvePublicPath(request.url || '/');

  if (!filePath) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    const notFoundPath = path.join(publicRoot, '404.html');

    if (existsSync(notFoundPath)) {
      response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      createReadStream(notFoundPath).pipe(response);
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  try {
    await sendFile(filePath, request, response);
  } catch (error) {
    console.error('Failed to serve file:', error);

    if (!response.headersSent) {
      response.writeHead(500, {
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end('Internal Server Error');
      return;
    }

    response.destroy();
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use. Run with PORT=xxxx pnpm dev to choose another port.`,
    );
    process.exit(1);
  }

  throw error;
});

server.listen(port, host, () => {
  console.log(`Watching UI sources and serving ${publicRoot}`);
  console.log(`Local: http://${host}:${port}/`);
});

async function shutdown() {
  server.close();
  await context.dispose();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
