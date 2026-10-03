export const MIN_MCQ_OPTIONS = 4;
export const MAX_MCQ_OPTIONS = 5;
export const STANDARD_MCQ_OPTIONS = 5;

export function isSupportedMcqOptionCount(count: number): boolean {
  return Number.isInteger(count) && count >= MIN_MCQ_OPTIONS && count <= MAX_MCQ_OPTIONS;
}

export function sequentialMcqLabels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));
}

export function hasSequentialMcqLabels(labels: string[]): boolean {
  if (!isSupportedMcqOptionCount(labels.length)) return false;
  const normalized = labels.map((label) => label.trim().toUpperCase());
  return normalized.join(',') === sequentialMcqLabels(labels.length).join(',');
}
