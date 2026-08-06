import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const scriptsDirectory = path.join(process.cwd(), 'scripts');
const sourcePath = path.join(scriptsDirectory, 'generate-postman.mjs');
const runtimePath = path.join(scriptsDirectory, '.generate-postman-runtime.mjs');
const marker = '\n\nconst routes = controllerFiles.flatMap(extractRoutes);';
const source = fs.readFileSync(sourcePath, 'utf8');
const start = source.indexOf('function extractRoutes(file) {');
const end = source.indexOf(marker, start);

if (start < 0 || end < 0) {
  throw new Error('Unable to locate the route extractor in generate-postman.mjs');
}

const replacement = `function extractRoutes(file) {
  const source = fs.readFileSync(file, "utf8");
  const module = path
    .basename(file)
    .replace(".controller.ts", "")
    .replace(".controller", "");
  return extractRoutesFromSource(source, module);
}`;

const runtimeSource = [
  'import { extractRoutesFromSource } from "./controller-route-extractor.mjs";',
  source.slice(0, start),
  replacement,
  source.slice(end),
].join('\n');

fs.writeFileSync(runtimePath, runtimeSource, 'utf8');
try {
  await import(`${pathToFileURL(runtimePath).href}?run=${Date.now()}`);
} finally {
  fs.rmSync(runtimePath, { force: true });
}
