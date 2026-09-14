import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const scanRoots = ['src', 'scripts'];
const failures = [];
const REVIEW_MARKER = 'security-audit-reviewed:';

function walk(path) {
  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!['node_modules', 'dist', 'coverage'].includes(entry)) walk(full);
      continue;
    }
    if (['.ts', '.js', '.mjs', '.cjs'].includes(extname(full))) inspect(full);
  }
}

function report(file, rule, match) {
  const line = file.text.slice(0, match.index).split(/\r?\n/).length;
  failures.push(`${relative(root, file.path)}:${line} [${rule}]`);
}

function hasNearbySecurityReview(file, match) {
  const start = Math.max(0, match.index - 260);
  const end = Math.min(file.text.length, match.index + 360);
  return file.text.slice(start, end).includes(REVIEW_MARKER);
}

function inspect(path) {
  const file = { path, text: readFileSync(path, 'utf8') };
  const repoPath = relative(root, path).replace(/\\/g, '/');
  const rules = [
    ['dynamic SQL interpolation', /(?:\.query|\.execute)\s*\(\s*`[^`]*\$\{/g],
    ['runtime code evaluation', /\b(?:eval\s*\(|new\s+Function\s*\()/g],
    ['non-cryptographic randomness', /\bMath\.random\s*\(/g],
  ];
  if (repoPath.startsWith('src/')) {
    rules.push([
      'shell/process execution',
      /(?:node:)?child_process|\bexecFile?Sync?\s*\(|\bspawnSync?\s*\(/g,
    ]);
  }
  for (const [name, pattern] of rules) {
    for (const match of file.text.matchAll(pattern)) {
      if (
        ['dynamic SQL interpolation', 'shell/process execution'].includes(name)
        && hasNearbySecurityReview(file, match)
      ) {
        continue;
      }
      report(file, name, match);
    }
  }
}

function guardPatchedProductionDependencies() {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const expected = {
    nodemailer: '9.1.1',
    multer: '2.3.0',
    qs: '6.16.0',
  };
  if (packageJson.dependencies?.nodemailer !== expected.nodemailer) {
    failures.push(`package.json [nodemailer must stay pinned to patched ${expected.nodemailer}]`);
  }
  if (packageJson.overrides?.multer !== expected.multer) {
    failures.push(`package.json [multer override must stay pinned to patched ${expected.multer}]`);
  }
  if (packageJson.overrides?.qs !== expected.qs) {
    failures.push(`package.json [qs override must stay pinned to patched ${expected.qs}]`);
  }
}

for (const directory of scanRoots) walk(join(root, directory));
guardPatchedProductionDependencies();

if (failures.length) {
  console.error('Backend security static audit failed:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('Backend security static audit passed.');
