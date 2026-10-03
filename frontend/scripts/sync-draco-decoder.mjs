#!/usr/bin/env node
/**
 * Copy three.js's Draco decoder into public/draco/.
 *
 * The anatomy models are Draco-compressed, so the browser needs a decoder. drei fetches one
 * from gstatic by default, which our connect-src does not allow - and pinning a CDN copy
 * would also let decoder and loader drift apart across a three.js upgrade. Copying from the
 * installed three package instead means the two are always the same version.
 *
 * Runs from `prebuild`, so a `next build` cannot ship a stale or missing decoder. The files
 * are committed as well, so a build with no node_modules still has them.
 */

import { copyFileSync, mkdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Resolve three's install directory without assuming a node_modules layout, so this keeps
 * working under pnpm/yarn or a hoisted monorepo install.
 *
 * `require.resolve("three/package.json")` is not usable: three declares an "exports" map that
 * does not expose package.json, so resolving it throws ERR_PACKAGE_PATH_NOT_EXPORTED. Resolve
 * the main entry point instead and walk up to the directory that owns it.
 */
function resolveThreeRoot() {
  let dir = dirname(require.resolve("three"));
  for (let depth = 0; depth < 5; depth += 1) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "examples"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("Could not locate the installed three package directory");
}

const threeRoot = resolveThreeRoot();
const source = join(threeRoot, "examples", "jsm", "libs", "draco", "gltf");
const destination = join(HERE, "..", "public", "draco");

const FILES = ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"];

if (!existsSync(source)) {
  console.error(`Draco decoder not found at ${source} - is "three" installed?`);
  process.exit(1);
}

mkdirSync(destination, { recursive: true });
let copied = 0;
for (const file of FILES) {
  const from = join(source, file);
  if (!existsSync(from)) {
    console.error(`Missing ${file} in ${source}`);
    process.exit(1);
  }
  copyFileSync(from, join(destination, file));
  copied += statSync(from).size;
}

const version = JSON.parse(readFileSync(join(threeRoot, "package.json"), "utf8")).version;
console.log(`Draco decoder synced from three@${version} (${FILES.length} files, ${(copied / 1024).toFixed(0)} KB)`);
