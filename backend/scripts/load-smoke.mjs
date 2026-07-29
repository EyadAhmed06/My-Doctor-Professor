const baseUrl = process.env.LOAD_TEST_BASE_URL ?? 'http://127.0.0.1:3000';
const requests = Number(process.env.LOAD_TEST_REQUESTS ?? 1000);
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY ?? 25);
const maximumP95 = Number(process.env.LOAD_TEST_MAX_P95_MS ?? 500);

if (![requests, concurrency, maximumP95].every(Number.isFinite)) {
  throw new Error('Load-test settings must be numeric');
}

const latencies = [];
let failures = 0;
let next = 0;

async function worker() {
  while (true) {
    const index = next++;
    if (index >= requests) return;
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}/api/v1/health/ready`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) failures++;
      await response.arrayBuffer();
    } catch {
      failures++;
    } finally {
      latencies.push(performance.now() - started);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
latencies.sort((a, b) => a - b);
const p95 = latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)] ?? Infinity;
const errorRate = failures / requests;
console.log(JSON.stringify({ requests, concurrency, failures, errorRate, p95Ms: p95 }, null, 2));

if (failures > 0 || p95 > maximumP95) process.exitCode = 1;
