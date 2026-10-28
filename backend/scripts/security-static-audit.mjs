import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const scanRoots = ['src', 'scripts'];
const failures = [];
const REVIEW_MARKER = 'security-audit-reviewed:';
const PARAMETERIZED_SQL_REVIEW = 'parameterized-or-allowlisted-fragments';

// Review suppressions are deliberately narrow. A developer cannot silence a new
// sink merely by adding a marker: both the repository path and rule must be
// explicitly allowlisted here after security review.
const reviewedSinks = new Map([
  [
    'src/modules/questions/pdf-text-extraction.service.ts:shell/process execution',
    [
      'execFile uses no shell, fixed argument arrays, bounded time/buffer, and server-controlled binary paths.',
    ],
  ],
  [
    'src/modules/tests/student-studio.controller.ts:dynamic SQL interpolation',
    [
      'interpolated fragments are module constants/allowlisted predicate builders; actor/filter remain $1/$2 parameters.',
    ],
  ],
  ['src/modules/admin/admin.service.ts:dynamic SQL interpolation', [PARAMETERIZED_SQL_REVIEW]],
  ['src/modules/essay-cases/essay-cases.service.ts:dynamic SQL interpolation', [PARAMETERIZED_SQL_REVIEW]],
  ['src/modules/notifications/notifications.service.ts:dynamic SQL interpolation', [PARAMETERIZED_SQL_REVIEW]],
  ['src/modules/progress/progress.service.ts:dynamic SQL interpolation', [PARAMETERIZED_SQL_REVIEW]],
]);

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

function repoPath(path) {
  return relative(root, path).replace(/\\/g, '/');
}

function report(file, rule, match) {
  const line = file.text.slice(0, match.index).split(/\r?\n/).length;
  failures.push(`${repoPath(file.path)}:${line} [${rule}]`);
}

function hasApprovedSecurityReview(file, rule, match) {
  const key = `${repoPath(file.path)}:${rule}`;
  const approvedReasons = reviewedSinks.get(key);
  if (!approvedReasons?.length) return false;

  const start = Math.max(0, match.index - 320);
  const end = Math.min(file.text.length, match.index + 420);
  const nearby = file.text.slice(start, end);
  return approvedReasons.some((reason) => nearby.includes(`${REVIEW_MARKER} ${reason}`));
}

function inspect(path) {
  const file = { path, text: readFileSync(path, 'utf8') };
  const pathInRepo = repoPath(path);
  const rules = [
    ['dynamic SQL interpolation', /(?:\.query|\.execute)\s*\(\s*`[^`]*\$\{/g],
    ['runtime code evaluation', /\b(?:eval\s*\(|new\s+Function\s*\()/g],
    ['non-cryptographic randomness', /\bMath\.random\s*\(/g],
  ];
  if (pathInRepo.startsWith('src/')) {
    rules.push([
      'shell/process execution',
      /(?:node:)?child_process|\bexecFile?Sync?\s*\(|\bspawnSync?\s*\(/g,
    ]);
  }
  for (const [name, pattern] of rules) {
    for (const match of file.text.matchAll(pattern)) {
      if (
        ['dynamic SQL interpolation', 'shell/process execution'].includes(name)
        && hasApprovedSecurityReview(file, name, match)
      ) {
        continue;
      }
      report(file, name, match);
    }
  }
}

function compareSemver(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

function guardPatchedProductionDependencies() {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const locked = packageLock.packages ?? {};

  const requirements = [
    ['nodemailer', '10.2.1'],
    ['@nestjs/platform-express', '11.2.8'],
    ['multer', '2.5.0'],
    ['qs', '6.16.1'],
    ['body-parser', '2.4.0'],
  ];
  // Check the actually installed versions, not historical exact patch pins.
  // The npm production audit separately checks newly disclosed advisories.
  for (const [name, minimum] of requirements) {
    const installed = locked[`node_modules/${name}`]?.version;
    if (!installed || compareSemver(installed, minimum) < 0) {
      failures.push(`package-lock.json [${name} must resolve to ${minimum} or newer]`);
    }
  }
  if (packageJson.dependencies?.nodemailer !== '10.2.1') {
    failures.push('package.json [nodemailer must remain pinned to 10.2.1 or be deliberately upgraded]');
  }
  if (packageJson.dependencies?.['@nestjs/platform-express'] !== '^11.2.8') {
    failures.push('package.json [@nestjs/platform-express must keep the patched ^11.2.8 floor]');
  }
  if (packageJson.overrides?.qs !== '6.16.1' || packageJson.overrides?.multer !== '2.5.0') {
    failures.push('package.json [qs and multer overrides must preserve the patched floors]');
  }
}

function guardReviewedSinkRegistry() {
  for (const [key, reasons] of reviewedSinks) {
    const separator = key.lastIndexOf(':');
    const path = key.slice(0, separator);
    const rule = key.slice(separator + 1);
    const text = readFileSync(join(root, path), 'utf8');
    for (const reason of reasons) {
      if (!text.includes(`${REVIEW_MARKER} ${reason}`)) {
        failures.push(`${path} [missing approved ${rule} review marker: ${reason}]`);
      }
    }
  }
}

for (const directory of scanRoots) walk(join(root, directory));
guardPatchedProductionDependencies();
guardReviewedSinkRegistry();

if (failures.length) {
  console.error('Backend security static audit failed:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('Backend security static audit passed.');
