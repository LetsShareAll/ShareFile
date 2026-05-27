import esbuild from 'esbuild';
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const publicRoot = path.join(repoRoot, 'public');
const port = Number.parseInt(process.env.PORT || '4173', 10);
const host = process.env.HOST || '127.0.0.1';

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`Invalid PORT: ${process.env.PORT}`);
  process.exit(1);
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
]);

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

function sendFile(filePath, response) {
  const contentType =
    contentTypes.get(path.extname(filePath).toLowerCase()) ||
    'application/octet-stream';

  response.writeHead(200, { 'Content-Type': contentType });
  createReadStream(filePath).pipe(response);
}

const context = await esbuild.context({
  entryPoints: [path.join(__dirname, '../src/index.ts')],
  bundle: true,
  outfile: path.join(publicRoot, 'assets/scripts/index.js'),
  sourcemap: true,
  logLevel: 'info',
});

await context.watch();

const server = http.createServer((request, response) => {
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

  sendFile(filePath, response);
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
