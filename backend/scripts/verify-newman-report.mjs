import fs from "node:fs";
import path from "node:path";

const [
  reportPath = "reports/newman.json",
  inventoryPath = "postman/controller-route-inventory.json",
  collectionPath = "postman/My-Doctor-Professor.postman_collection.json",
] = process.argv.slice(2);

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const collection = JSON.parse(fs.readFileSync(collectionPath, "utf8"));
const executions = report.run?.executions ?? [];
const failures = report.run?.failures ?? [];
const countRequests = (items = []) =>
  items.reduce(
    (count, item) => count + (item.request ? 1 : 0) + countRequests(item.item),
    0,
  );
const expectedRequests = countRequests(collection.item);
const expectedRoutes = Number(inventory.count);

const rows = executions.map((execution) => {
  const request = execution.request;
  const response = execution.response;
  const method = request?.method ?? "UNKNOWN";
  const url = request?.url?.toString?.() ?? String(request?.url ?? "");
  return {
    name: execution.item?.name ?? "Unnamed request",
    method,
    url,
    status: response?.code ?? null,
    responseTime: response?.responseTime ?? null,
    transportError:
      execution.requestError?.message ?? (response ? null : "No HTTP response"),
  };
});

const transportFailures = rows.filter((row) => row.transportError);
const serverFailures = rows.filter(
  (row) => row.status !== null && row.status >= 500,
);
const businessRejections = rows.filter(
  (row) => row.status !== null && row.status >= 400 && row.status < 500,
);
const allowedBusinessRejections = new Map([
  ["POST /auth/email-verification/confirm", new Set([400])],
  ["POST /auth/password/reset", new Set([400])],
  ["DELETE /tests/attempts/:attemptId/notes/:questionId", new Set([409])],
  ["DELETE /tests/attempts/:attemptId/flags/:questionId", new Set([409])],
  ["DELETE /tests/:testId/questions/:questionId", new Set([409])],
  ["DELETE /tests/:testId", new Set([409])],
  ["DELETE /questions/options/:optionId", new Set([409])],
  ["DELETE /questions/:questionId", new Set([409])],
  ["DELETE /flashcards/cards/:cardId", new Set([409])],
  ["DELETE /flashcards/decks/:deckId", new Set([409])],
  ["DELETE /academic/resources/:resourceId", new Set([409])],
  ["DELETE /academic/topics/:topicId", new Set([409])],
  ["DELETE /academic/lectures/:lectureId", new Set([409])],
  ["DELETE /academic/weeks/:weekId", new Set([409])],
  ["DELETE /academic/courses/:courseId", new Set([409])],
  ["DELETE /academic/semesters/:semesterId", new Set([409])],
]);
const expectedBusinessRejections = businessRejections.filter((row) =>
  allowedBusinessRejections.get(row.name)?.has(row.status),
);
const unexpectedBusinessRejections = businessRejections.filter(
  (row) => !allowedBusinessRejections.get(row.name)?.has(row.status),
);
const slowResponses = rows.filter(
  (row) => row.responseTime !== null && row.responseTime >= 5000,
);
const statusCounts = rows.reduce((counts, row) => {
  const key = row.status === null ? "NO_RESPONSE" : String(row.status);
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});

const hardErrors = [];
if (!Number.isSafeInteger(expectedRequests) || expectedRequests <= 0)
  hardErrors.push("The inventory has no valid collection request count.");
if (!Number.isSafeInteger(expectedRoutes) || expectedRoutes <= 0)
  hardErrors.push("The inventory has no valid controller route count.");
if (rows.length !== expectedRequests)
  hardErrors.push(
    `Executed ${rows.length} requests; expected ${expectedRequests}.`,
  );
if (transportFailures.length)
  hardErrors.push(
    `${transportFailures.length} request(s) failed before receiving an HTTP response.`,
  );
if (serverFailures.length)
  hardErrors.push(`${serverFailures.length} request(s) returned HTTP 5xx.`);
if (unexpectedBusinessRejections.length)
  hardErrors.push(
    `${unexpectedBusinessRejections.length} request(s) returned an unexpected HTTP 4xx response.`,
  );
if (slowResponses.length)
  hardErrors.push(`${slowResponses.length} request(s) exceeded five seconds.`);
if (failures.length)
  hardErrors.push(
    `${failures.length} Newman assertion/runtime failure(s) were reported.`,
  );

const lines = [
  "# Backend HTTP API report",
  "",
  `- Controller routes in inventory: **${expectedRoutes}**`,
  `- Collection requests expected: **${expectedRequests}**`,
  `- Collection requests executed: **${rows.length}**`,
  `- Transport failures: **${transportFailures.length}**`,
  `- HTTP 5xx responses: **${serverFailures.length}**`,
  `- Expected HTTP 4xx negative tests: **${expectedBusinessRejections.length}**`,
  `- Unexpected HTTP 4xx responses: **${unexpectedBusinessRejections.length}**`,
  `- Responses taking at least five seconds: **${slowResponses.length}**`,
  `- Newman failures: **${failures.length}**`,
  "",
  "## Status distribution",
  "",
  "| Status | Requests |",
  "| --- | ---: |",
  ...Object.entries(statusCounts)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([status, count]) => `| ${status} | ${count} |`),
];

if (unexpectedBusinessRejections.length) {
  lines.push(
    "",
    "## HTTP 4xx responses requiring review",
    "",
    "| Request | Method | Status |",
    "| --- | --- | ---: |",
  );
  for (const row of unexpectedBusinessRejections)
    lines.push(
      `| ${row.name.replaceAll("|", "\\|")} | ${row.method} | ${row.status} |`,
    );
}

if (hardErrors.length) {
  lines.push(
    "",
    "## Blocking failures",
    "",
    ...hardErrors.map((error) => `- ${error}`),
  );
}

const summary = `${lines.join("\n")}\n`;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(path.join(path.dirname(reportPath), "summary.md"), summary);
if (process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
process.stdout.write(summary);

if (hardErrors.length) process.exitCode = 1;
