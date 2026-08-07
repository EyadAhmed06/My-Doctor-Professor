"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectedAssessmentSession } from "./connected-assessment-session";
import { ProductShell } from "./product-shell";

const STORAGE_KEY = "mdp:active-assessment-session";

type SessionRef = {
  attemptId: string;
  testId: string;
  source: string;
};

export function AssessmentSessionEntry({
  attemptId,
  testId,
  source = "assessments",
}: {
  attemptId?: string;
  testId?: string;
  source?: string;
}) {
  const router = useRouter();
  const [session, setSession] = useState<SessionRef | null>(() =>
    attemptId && testId ? { attemptId, testId, source } : null,
  );
  const [restoring, setRestoring] = useState(!(attemptId && testId));

  useEffect(() => {
    if (attemptId && testId) {
      const next = { attemptId, testId, source };
      setSession(next);
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* best-effort */ }
      setRestoring(false);
      router.replace("/mock-exam/session", { scroll: false });
      return;
    }

    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const stored = raw ? JSON.parse(raw) as Partial<SessionRef> : null;
      if (stored?.attemptId && stored.testId) {
        setSession({
          attemptId: stored.attemptId,
          testId: stored.testId,
          source: stored.source || "assessments",
        });
      }
    } catch {
      setSession(null);
    } finally {
      setRestoring(false);
    }
  }, [attemptId, router, source, testId]);

  if (restoring) {
    return <ProductShell><div className="product-auth-loading">Restoring assessment session…</div></ProductShell>;
  }
  if (!session) {
    return <ProductShell><div className="product-auth-loading">No active assessment session was found. Start an assessment from your bundle workspace.</div></ProductShell>;
  }
  return <ConnectedAssessmentSession attemptId={session.attemptId} testId={session.testId} source={session.source} />;
}
