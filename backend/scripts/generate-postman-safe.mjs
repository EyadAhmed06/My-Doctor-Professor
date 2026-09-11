import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const scriptsDirectory = path.join(process.cwd(), 'scripts');
const sourcePath = path.join(scriptsDirectory, 'generate-postman.mjs');
const runtimePath = path.join(scriptsDirectory, '.generate-postman-runtime.mjs');
const routeMarker = '\n\nconst routes = controllerFiles.flatMap(extractRoutes);';
// Git may check this file out with CRLF on Windows. Normalize before applying
// deterministic source patches so local and CI generation behave identically.
const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');
const extractorStart = source.indexOf('function extractRoutes(file) {');
const extractorEnd = source.indexOf(routeMarker, extractorStart);

if (extractorStart < 0 || extractorEnd < 0) {
  throw new Error('Unable to locate the route extractor in generate-postman.mjs');
}

const extractorReplacement = `function extractRoutes(file) {
  const source = fs.readFileSync(file, "utf8");
  const module = path
    .basename(file)
    .replace(".controller.ts", "")
    .replace(".controller", "");
  return extractRoutesFromSource(source, module);
}`;

function replaceRequired(value, marker, replacement, label) {
  if (!value.includes(marker)) {
    throw new Error(`Unable to patch ${label} in generate-postman.mjs`);
  }
  return value.replace(marker, replacement);
}

let runtimeSource = [
  'import { extractRoutesFromSource } from "./controller-route-extractor.mjs";',
  source.slice(0, extractorStart),
  extractorReplacement,
  source.slice(extractorEnd),
].join('\n');

runtimeSource = replaceRequired(
  runtimeSource,
  '  audit: "11 - Audit logs",\n};',
  '  audit: "11 - Audit logs",\n  workspace: "12 - Student workspace",\n  bundles: "13 - Bundles",\n};',
  'Postman folders',
);

runtimeSource = replaceRequired(
  runtimeSource,
  '  if (module === "academic") {',
  `  if (module === "bundles") {
    if (route.startsWith("catalog/bundles")) return null;
    if (route === "bundles/managed") return "instructorAccessToken";
    if (
      route === "bundles/mine" ||
      route === "bundles/enroll" ||
      route.endsWith("/enroll") ||
      (method === "GET" && route.startsWith("bundles/:bundleId"))
    ) return "studentAccessToken";
    return "instructorAccessToken";
  }
  if (module === "academic") {`,
  'Bundle authentication',
);

runtimeSource = replaceRequired(
  runtimeSource,
  '    resourceId: "resourceId",\n    questionId: "questionId",',
  '    resourceId: "resourceId",\n    bundleId: "bundleId",\n    studentId: "studentUserId",\n    questionId: "questionId",',
  'Bundle route variables',
);

runtimeSource = replaceRequired(
  runtimeSource,
  '  "POST drug-references": {',
  `  "POST bundles": {
    title: "Postman Bundle",
    slug: "postman-bundle-{{$timestamp}}",
    description: "Bundle created by the complete HTTP collection.",
    academic_year: 1,
    access_mode: "PUBLIC",
    is_free: true,
  },
  "PUT bundles/:bundleId": {
    title: "Postman Bundle Updated",
    description: "Updated by the complete HTTP collection.",
  },
  "PUT bundles/:bundleId/status": { status: "PUBLISHED" },
  "POST bundles/:bundleId/courses": { resource_id: "{{courseId}}" },
  "POST bundles/:bundleId/weeks": { resource_id: "{{weekId}}" },
  "POST bundles/:bundleId/tests": { resource_id: "{{testId}}" },
  "POST bundles/:bundleId/instructors": { instructor_id: "{{instructorId}}" },
  "POST bundles/:bundleId/enrollments": { student_id: "{{studentUserId}}" },
  "POST bundles/enroll": { code: "postman-code" },
  "POST drug-references": {`,
  'Bundle request bodies',
);

runtimeSource = replaceRequired(
  runtimeSource,
  '    "POST drug-references": "drugId",',
  '    "POST bundles": "bundleId",\n    "POST drug-references": "drugId",',
  'Bundle ID capture',
);

runtimeSource = replaceRequired(
  runtimeSource,
  'const queryMap = {',
  'const queryMap = {\n  "GET catalog/bundles": [["academic_year", "1"]],',
  'Bundle catalog query',
);

fs.writeFileSync(runtimePath, runtimeSource, 'utf8');
try {
  await import(`${pathToFileURL(runtimePath).href}?run=${Date.now()}`);
} finally {
  fs.rmSync(runtimePath, { force: true });
}
