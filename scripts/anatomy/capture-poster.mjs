#!/usr/bin/env node
/**
 * Render the still image the non-WebGL fallback shows.
 *
 *   node anatomy/capture-poster.mjs --url http://localhost:3100/anatomy/skull --region skull
 *
 * Generated from the same .glb the 3D viewer loads, so the fallback can never drift into
 * showing a different model from the interactive one. Needs the production server running.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { args[key] = true; continue; }
    args[key] = next; i += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = String(args.url || "http://localhost:3100/anatomy/skull");
  const region = String(args.region || "skull");
  const out = resolve(HERE, "..", "..", "frontend", "public", "anatomy", `${region}-fallback.png`);
  mkdirSync(dirname(out), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });
  await page.goto(`${url}?debug=1`);
  await page.waitForFunction(() => {
    const dd = document.querySelectorAll(".anatomy-viewer__stats dd");
    return dd.length >= 3 && Number((dd[2].textContent || "0").replace(/,/g, "")) > 0;
  }, null, { timeout: 300000 });
  // Let a few frames land so the capture is not of a half-lit first frame.
  await page.waitForTimeout(1500);

  // Hide the debug overlay and the hint bar - neither belongs in a static poster.
  await page.addStyleTag({ content: ".anatomy-viewer__stats, .anatomy-viewer__readout { display: none !important; }" });
  // A clipped page screenshot rather than locator.screenshot: the latter waits for web fonts
  // to settle and times out on a page that is continuously rendering a canvas.
  const box = await page.locator(".anatomy-viewer__stage").boundingBox();
  await page.screenshot({ path: out, clip: box, timeout: 30000 });
  await browser.close();
  console.log(`Wrote ${out}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
