import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const standalone = resolve(root, '.next', 'standalone');
const staticSource = resolve(root, '.next', 'static');
const staticTarget = resolve(standalone, '.next', 'static');
const publicSource = resolve(root, 'public');
const publicTarget = resolve(standalone, 'public');

if (!existsSync(resolve(standalone, 'server.js'))) {
  throw new Error('Missing .next/standalone/server.js. Run npm run build before Playwright.');
}

mkdirSync(resolve(standalone, '.next'), { recursive: true });
cpSync(staticSource, staticTarget, { recursive: true, force: true });
if (existsSync(publicSource)) cpSync(publicSource, publicTarget, { recursive: true, force: true });

process.env.PORT = process.env.PLAYWRIGHT_PORT || process.env.PORT || '3001';
process.env.HOSTNAME = process.env.PLAYWRIGHT_HOST || '127.0.0.1';
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
await import(pathToFileURL(resolve(standalone, 'server.js')).href);
