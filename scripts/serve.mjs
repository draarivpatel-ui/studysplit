import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const port = Number(portFlag !== -1 ? args[portFlag + 1] : process.env.PORT || 4930);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = normalize(join(root, pathname));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': types[extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`StudySplit serving at http://127.0.0.1:${server.address().port}/`);
});
