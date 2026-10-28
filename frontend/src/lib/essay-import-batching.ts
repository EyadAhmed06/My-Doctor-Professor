/** Keep request payloads below the server's per-request import limit.
 * Batches are sequential so a failed request never hides earlier successes.
 */
export function splitEssayPublishBatches<T>(items: readonly T[], size = 100): T[][] {
  if (!Number.isSafeInteger(size) || size < 1 || size > 500) {
    throw new RangeError("Essay publication batch size must be between 1 and 500.");
  }
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}
