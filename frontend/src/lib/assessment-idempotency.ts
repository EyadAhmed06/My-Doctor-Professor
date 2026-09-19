type PendingRequest = { intent: string; key: string };

function storageKey(scope: string) {
  return `mdp:assessment-idempotency:${scope}`;
}

export function getAssessmentIdempotencyKey(scope: string, intent: string): string {
  try {
    const raw = sessionStorage.getItem(storageKey(scope));
    if (raw) {
      const current = JSON.parse(raw) as PendingRequest;
      if (current.intent === intent && current.key) return current.key;
    }
  } catch { /* session storage is best-effort */ }

  const key = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    sessionStorage.setItem(storageKey(scope), JSON.stringify({ intent, key } satisfies PendingRequest));
  } catch { /* session storage is best-effort */ }
  return key;
}

export function clearAssessmentIdempotencyKey(scope: string, key: string): void {
  try {
    const raw = sessionStorage.getItem(storageKey(scope));
    if (!raw) return;
    const current = JSON.parse(raw) as PendingRequest;
    if (current.key === key) sessionStorage.removeItem(storageKey(scope));
  } catch { /* session storage is best-effort */ }
}
