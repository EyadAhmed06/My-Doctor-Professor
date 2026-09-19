#!/usr/bin/env node
/**
 * Measure the anatomy viewer in a real browser. Numbers in the write-up come from here.
 *
 *   node anatomy/measure.mjs --url http://localhost:3100/anatomy/skull
 *
 * Run it against a production build (`next build && next start`), never `next dev` - dev
 * mode ships unminified modules and a HMR runtime, so its timings say nothing useful.
 *
 * Honesty note: "mobile" here is a throttled Chromium emulating a phone viewport, not a
 * physical handset. It throttles CPU (4x) and network, and it renders at a phone's
 * resolution and pixel ratio - but it still draws on this machine's desktop GPU. Real phone
 * GPUs and thermal throttling are NOT modelled, so mobile frame rates here are an optimistic
 * upper bound, not a prediction. Confirm on a real handset before trusting them.
 */

import { chromium } from "playwright";
import { statSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
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

// Chromium's own "Fast 3G" preset, as used by DevTools.
const FAST_3G = { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 562.5 };
const SLOW_4G = { offline: false, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8, latency: 170 };

const PROFILES = [
  { name: "Desktop, no throttling", viewport: { width: 1280, height: 900 }, dsf: 1, cpu: 1, network: null, mobile: false },
  { name: "Desktop, Fast 3G", viewport: { width: 1280, height: 900 }, dsf: 1, cpu: 1, network: FAST_3G, mobile: false },
  { name: "Mobile portrait, Slow 4G + 4x CPU", viewport: { width: 390, height: 844 }, dsf: 3, cpu: 4, network: SLOW_4G, mobile: true },
];

async function measureProfile(browser, url, profile, bypassCSP = false) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.dsf,
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    // --bypass-csp models "what if script-src allowed 'wasm-unsafe-eval'", so the Meshopt
    // variant can be measured without editing the real security header to find out.
    bypassCSP,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Performance.enable");
  if (profile.network) await cdp.send("Network.emulateNetworkConditions", { ...profile.network, connectionType: "cellular4g" });
  if (profile.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });

  // Measured from CDP rather than the Content-Length header: Next serves the .glb with
  // gzip/brotli, so the header reports the *uncompressed* length and understates nothing
  // while overstating the wire cost. encodedDataLength is the bytes that actually crossed.
  let transferred = 0;
  let glbBytes = 0;
  const glbRequests = new Set();
  cdp.on("Network.responseReceived", (event) => {
    if (event.response.url.endsWith(".glb")) glbRequests.add(event.requestId);
  });
  cdp.on("Network.loadingFinished", (event) => {
    transferred += event.encodedDataLength || 0;
    if (glbRequests.has(event.requestId)) glbBytes = event.encodedDataLength || 0;
  });

  const started = Date.now();
  await page.goto(`${url}?debug=1`, { waitUntil: "commit" });

  // "Interactive" = the render loop has produced a frame containing real geometry. Waiting
  // for load or networkidle would report a blank canvas as ready.
  await page.waitForFunction(() => {
    const stats = document.querySelectorAll(".anatomy-viewer__stats dd");
    if (stats.length < 3) return false;
    const triangles = Number((stats[2].textContent || "0").replace(/,/g, ""));
    const fps = Number(stats[0].textContent || "0");
    return triangles > 0 && fps > 0;
  }, null, { timeout: 180000 });
  const interactiveMs = Date.now() - started;

  const readStats = () => page.evaluate(() => {
    const dd = document.querySelectorAll(".anatomy-viewer__stats dd");
    return {
      fps: Number(dd[0]?.textContent || 0),
      drawCalls: Number(dd[1]?.textContent || 0),
      triangles: Number((dd[2]?.textContent || "0").replace(/,/g, "")),
      heapMb: Number((dd[3]?.textContent || "0").replace(/[^\d.]/g, "")),
    };
  });

  // Orbit for 6 seconds and sample. A single reading catches a warm-up frame and flatters
  // the result, so take the median of the samples and the worst frame seen.
  // Draw calls and triangle count are read from the settled scene, not mid-drag: they do not
  // change while orbiting (verified), and an instantaneous read during a fast synthetic spin
  // can catch a frame between render passes and report a nonsense 3 draw calls.
  const baseline = await readStats();

  const box = await page.locator(".anatomy-viewer__stage").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();

  const samples = [];
  let peakHeap = 0;
  const orbitUntil = Date.now() + 8000;
  let angle = 0;
  let lastSample = 0;
  while (Date.now() < orbitUntil) {
    angle += 0.35;
    await page.mouse.move(cx + Math.cos(angle) * (box.width * 0.3), cy + Math.sin(angle) * (box.height * 0.2));
    // Sampling costs a CDP round-trip, which itself steals frame time. The frame meter only
    // publishes twice a second anyway, so read at roughly that rate instead of every move.
    if (Date.now() - lastSample < 400) continue;
    lastSample = Date.now();
    const stats = await readStats();
    if (stats.fps > 0) samples.push(stats);
    if (stats.heapMb > peakHeap) peakHeap = stats.heapMb;
  }
  await page.mouse.up();

  const metrics = await cdp.send("Performance.getMetrics");
  const heapMetric = metrics.metrics.find((m) => m.name === "JSHeapUsedSize");
  const cdpHeapMb = heapMetric ? heapMetric.value / 1048576 : 0;

  const fpsValues = samples.map((s) => s.fps).sort((a, b) => a - b);
  const median = fpsValues.length ? fpsValues[Math.floor(fpsValues.length / 2)] : 0;
  const last = { drawCalls: baseline.drawCalls, triangles: baseline.triangles };

  await context.close();

  return {
    profile: profile.name,
    interactiveMs,
    glbBytes,
    transferred,
    fpsMedian: median,
    fpsMin: fpsValues[0] ?? 0,
    fpsMax: fpsValues.at(-1) ?? 0,
    samples: fpsValues.length,
    drawCalls: last.drawCalls,
    triangles: last.triangles,
    peakHeapMb: Math.max(peakHeap, cdpHeapMb),
  };
}

/**
 * Navigate in and out repeatedly. Browsers cap simultaneous WebGL contexts at around 16, so
 * if the viewer leaks its context on unmount, a later cycle stops rendering and Chromium
 * logs "Too many active WebGL contexts". Both are caught here: a leak shows up either as a
 * console warning or as a cycle that never reaches a non-zero triangle count.
 */
async function measureLeak(browser, url, cycles = 12, bypassCSP = false) {
  // Must inherit the same CSP treatment as the profiles, or a Meshopt asset silently fails
  // to decode here and the resulting timeout looks like a context leak when it is not.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP });
  const page = await context.newPage();
  const warnings = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/webgl|context/i.test(text)) warnings.push(text);
  });

  const heaps = [];
  let completed = 0;
  try {
    for (let i = 0; i < cycles; i += 1) {
      await page.goto(`${url}?debug=1`, { waitUntil: "commit" });
      await page.waitForFunction(() => {
        const dd = document.querySelectorAll(".anatomy-viewer__stats dd");
        return dd.length >= 3 && Number((dd[2].textContent || "0").replace(/,/g, "")) > 0;
      }, null, { timeout: 60000 });
      const heap = await page.evaluate(() => {
        const m = performance.memory;
        return m ? m.usedJSHeapSize / 1048576 : 0;
      });
      heaps.push(Math.round(heap));
      completed += 1;
      // Leaving to a blank page is what forces unmount, and therefore the cleanup path.
      await page.goto("about:blank");
    }
  } catch (error) {
    await context.close();
    return { cycles, completed, survived: false, warnings, heaps, error: error.message.split("\n")[0] };
  }

  await context.close();
  return { cycles, completed, survived: true, warnings, heaps };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = String(args.url || "http://localhost:3100/anatomy/skull");
  // Derive the asset from the URL rather than hardcoding one region, or every run reports
  // the skull's size no matter what was actually measured.
  const regionSlug = url.replace(/[?#].*$/, "").split("/").filter(Boolean).pop();
  const glbPath = resolve(HERE, "..", "..", "frontend", "public", "anatomy", `${regionSlug}.glb`);

  console.log(`\nMeasuring ${url}`);
  if (existsSync(glbPath)) console.log(`On-disk .glb (${regionSlug}): ${(statSync(glbPath).size / 1048576).toFixed(2)} MB`);

  // Headless Chromium defaults to SwiftShader, a *software* rasteriser. Measuring frame
  // rates on it produces numbers that look catastrophic and mean nothing about real
  // hardware, so force real GPU-backed ANGLE and record which renderer actually ran.
  const browser = await chromium.launch({
    args: ["--use-angle=default", "--enable-gpu", "--ignore-gpu-blocklist"],
  });

  const probe = await browser.newPage();
  await probe.goto("about:blank");
  const renderer = await probe.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown";
  });
  await probe.close();
  console.log(`Renderer: ${renderer}`);
  if (args["bypass-csp"]) console.log("CSP bypassed: modelling script-src with 'wasm-unsafe-eval' present.");
  if (/swiftshader|software/i.test(renderer)) {
    console.log("WARNING: software rasteriser - frame rates below are NOT representative.");
  }

  // --only lets a very large region be measured on the profiles where a result is actually
  // obtainable; a 57 MB asset on Fast 3G takes longer than any sane wait.
  const only = args.only ? String(args.only).toLowerCase() : null;
  const profiles = only ? PROFILES.filter((p) => p.name.toLowerCase().includes(only)) : PROFILES;

  const results = [];
  for (const profile of profiles) {
    process.stdout.write(`\n-> ${profile.name} ... `);
    try {
      const result = await measureProfile(browser, url, profile, Boolean(args["bypass-csp"]));
      results.push(result);
      process.stdout.write("done");
    } catch (error) {
      process.stdout.write(`FAILED: ${error.message.split("\n")[0]}`);
      results.push({ profile: profile.name, failed: error.message.split("\n")[0] });
    }
  }

  process.stdout.write("\n-> navigation leak check ... ");
  const leak = await measureLeak(browser, url, 12, Boolean(args["bypass-csp"])).catch((e) => ({ cycles: 0, completed: 0, survived: false, warnings: [], heaps: [], error: e.message }));
  process.stdout.write(leak.survived
    ? `survived ${leak.completed}/${leak.cycles} mount+unmount cycles`
    : `FAILED after ${leak.completed}/${leak.cycles} cycles: ${leak.error}`);
  if (leak.heaps?.length) process.stdout.write(`\n   JS heap per cycle (MB): ${leak.heaps.join(", ")}`);
  if (leak.warnings?.length) {
    process.stdout.write(`\n   WebGL/context console messages (${leak.warnings.length}):`);
    for (const w of [...new Set(leak.warnings)].slice(0, 5)) process.stdout.write(`\n     ${w}`);
  } else {
    process.stdout.write("\n   no WebGL context warnings logged");
  }

  await browser.close();

  console.log("\n\n=== Results ===\n");
  for (const r of results) {
    if (r.failed) { console.log(`${r.profile}\n  FAILED: ${r.failed}\n`); continue; }
    console.log(r.profile);
    console.log(`  time to first interactive render   ${(r.interactiveMs / 1000).toFixed(2)} s`);
    console.log(`  .glb over the wire (compressed)    ${(r.glbBytes / 1048576).toFixed(2)} MB`);
    console.log(`  total page transfer                ${(r.transferred / 1048576).toFixed(2)} MB`);
    console.log(`  frame rate while orbiting          median ${r.fpsMedian}  (min ${r.fpsMin}, max ${r.fpsMax}, n=${r.samples})`);
    console.log(`  draw calls / triangles             ${r.drawCalls} / ${r.triangles.toLocaleString()}`);
    console.log(`  peak JS heap                       ${r.peakHeapMb.toFixed(0)} MB`);
    console.log("");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
