import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const findings = [];
const forbidden = [
  ["dangerouslySetInnerHTML", /dangerouslySetInnerHTML/g],
  ["dynamic code execution", /\b(?:eval|Function)\s*\(/g],
  ["javascript URL", /javascript\s*:/gi],
  ["document.write", /document\.write\s*\(/g],
];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if ([".ts", ".tsx", ".js", ".jsx"].includes(extname(entry.name))) {
      const source = await readFile(path, "utf8");
      for (const [label, pattern] of forbidden) {
        if (pattern.test(source)) findings.push(`${relative(root, path)}: ${label}`);
        pattern.lastIndex = 0;
      }
      for (const match of source.matchAll(/target=["']_blank["']/g)) {
        const surrounding = source.slice(match.index, match.index + 240);
        if (!/rel=["'][^"']*noopener/.test(surrounding)) {
          findings.push(`${relative(root, path)}: target=_blank without rel=noopener`);
        }
      }
    }
  }
}
await walk(root);
if (findings.length) {
  console.error("Browser security audit failed:\n" + findings.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log("Browser security static audit passed.");
