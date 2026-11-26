import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, 'assets', 'screenshots');
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(outDir, { recursive: true });

if (!existsSync(chrome)) {
  console.error(`Chrome not found at ${chrome}`);
  process.exit(2);
}

const server = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs'), '--port', '0'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverOut = '';
const port = await new Promise((resolvePort, reject) => {
  const timer = setTimeout(() => reject(new Error('server did not print its port')), 8000);
  server.stdout.on('data', (chunk) => {
    serverOut += chunk.toString();
    const match = serverOut.match(/127\.0\.0\.1:(\d+)/);
    if (match) {
      clearTimeout(timer);
      resolvePort(Number(match[1]));
    }
  });
  server.stderr.on('data', (chunk) => { serverOut += chunk.toString(); });
  server.on('exit', () => reject(new Error(`server exited: ${serverOut}`)));
});

const shots = [
  ['home', 'home.png', '/?demo=1'],
  ['on-device', 'on-device.png', '/?demo=1&sample=1&autorun=1&force=on-device&probe=available'],
  ['cloud fallback', 'cloud-fallback.png', '/?demo=1&sample=1&autorun=1&force=cloud&probe=absent']
];

async function capture(name, file, path) {
  const profile = mkdtempSync(join(tmpdir(), 'studysplit-shot-'));
  const target = join(outDir, file);
  const url = `http://127.0.0.1:${port}${path}`;
  const args = [
    '--headless=new',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    '--hide-scrollbars',
    '--window-size=1440,900',
    '--force-device-scale-factor=1',
    '--force-color-profile=srgb',
    '--virtual-time-budget=5000',
    `--screenshot=${target}`,
    url
  ];
  const code = await new Promise((resolveRun) => {
    const child = spawn(chrome, args, { stdio: 'ignore' });
    child.on('exit', resolveRun);
  });
  rmSync(profile, { recursive: true, force: true });
  if (code !== 0 || !existsSync(target)) throw new Error(`${name} screenshot failed with exit ${code}`);
  console.log(`${name}: ${target}`);
}

try {
  for (const shot of shots) await capture(...shot);
} finally {
  server.kill('SIGTERM');
}
