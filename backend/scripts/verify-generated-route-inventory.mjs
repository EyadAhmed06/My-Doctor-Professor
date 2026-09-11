import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { extractRoutesFromSource } from './controller-route-extractor.mjs';

const root = process.cwd();
const modules = path.join(root, 'src', 'modules');
const files = [];
for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = path.join(modules, entry.name);
  for (const file of fs.readdirSync(directory)) {
    if (file.endsWith('.controller.ts')) files.push(path.join(directory, file));
  }
}
files.push(path.join(root, 'src', 'app.controller.ts'));

const expected = files
  .flatMap((file) => {
    const module = path
      .basename(file)
      .replace('.controller.ts', '')
      .replace('.controller', '');
    return extractRoutesFromSource(fs.readFileSync(file, 'utf8'), module);
  })
  .map(({ method, route }) => `${method} ${route || '/'}`)
  .sort();

const inventory = JSON.parse(
  fs.readFileSync(path.join(root, 'postman', 'controller-route-inventory.json'), 'utf8'),
);
const actual = [...inventory.routes].sort();

assert.equal(inventory.count, actual.length);
assert.equal(new Set(actual).size, actual.length);
assert.deepEqual(actual, expected);

for (const required of [
  'GET catalog/bundles',
  'GET bundles/mine',
  'GET bundles/managed',
  'GET bundles/:bundleId',
  'GET bundles/:bundleId/content',
  'POST bundles',
  'POST bundles/:bundleId/enroll',
  'DELETE bundles/:bundleId/enrollments/:studentId',
]) {
  assert(actual.includes(required), `Missing generated route: ${required}`);
}

assert(
  !actual.some((route) => /^[A-Z]+ catalog\/bundles\//.test(route)),
  'Protected Bundle routes must not inherit the public catalog prefix',
);

console.log(`Generated route inventory verified ${actual.length} unique routes.`);
