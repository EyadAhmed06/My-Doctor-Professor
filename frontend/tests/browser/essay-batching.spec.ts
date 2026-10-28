import { expect, test } from "@playwright/test";
import { splitEssayPublishBatches } from "../../src/lib/essay-import-batching";

test("large essay publishing splits 2,000 questions into bounded 100-item requests without losing order", () => {
  const questions = Array.from({ length: 2000 }, (_, i) => ({ candidate_id: `q-${i}` }));
  const batches = splitEssayPublishBatches(questions);
  expect(batches).toHaveLength(20);
  expect(batches.every(batch => batch.length === 100)).toBe(true);
  expect(batches.flat()).toEqual(questions);
});

test("partial final batch and empty inputs are handled without duplication", () => {
  const questions = Array.from({ length: 501 }, (_, i) => i);
  const batches = splitEssayPublishBatches(questions);
  expect(batches.map(batch => batch.length)).toEqual([100,100,100,100,100,1]);
  expect(batches.flat()).toEqual(questions);
  expect(splitEssayPublishBatches([])).toEqual([]);
});

test("invalid batch sizes cannot exceed backend publication limit", () => {
  for (const size of [0, -1, 501, 1.2, Number.NaN]) {
    expect(() => splitEssayPublishBatches([1], size)).toThrow(RangeError);
  }
});
