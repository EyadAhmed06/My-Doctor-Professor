"use client";

import { useEffect, useState } from "react";
import { AssessmentReview } from "./assessment-review";
import { ConnectedAssessmentSession } from "./connected-assessment-session";
import { useAuth } from "./auth-provider";
import { ProductShell } from "./product-shell";

const STORAGE_KEY = "mdp:active-assessment-session";

type SessionRef = {
  attemptId: string;
  testId: string;
  source: string;
};

type AttemptState = {
  attempt: { status: string };
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
  const { request } = useAuth();
  const [session, setSession] = useState<SessionRef | null>(() =>
    attemptId && testId ? { attemptId, testId, source } : null,
  );
  const [restoring, setRestoring] = useState(!(attemptId && testId));
  const [checkingAttempt, setCheckingAttempt] = useState(false);
  const [closedAttempt, setClosedAttempt] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    if (attemptId && testId) {
      const next = { attemptId, testId, source };
      setSession(next);
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* best-effort */ }
      setRestoring(false);
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
  }, [attemptId, source, testId]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setCheckingAttempt(true);
    setCheckError(null);
    void request<AttemptState>(`/tests/attempts/${session.attemptId}/workspace-state`)
      .then((state) => {
        if (!active) return;
        setClosedAttempt(state.attempt.status !== "IN_PROGRESS");
      })
      .catch((cause) => {
        if (!active) return;
        setCheckError(cause instanceof Error ? cause.message : "Unable to restore assessment state.");
      })
      .finally(() => { if (active) setCheckingAttempt(false); });
    return () => { active = false; };
  }, [request, session]);

  if (restoring || checkingAttempt) {
    return <ProductShell><div className="product-auth-loading">Restoring assessment session…</div></ProductShell>;
  }
  if (!session) {
    return <ProductShell><div className="product-auth-loading">No active assessment session was found. Start an assessment from your bundle workspace.</div></ProductShell>;
  }
  if (checkError) {
    return <ProductShell><div className="product-auth-loading">{checkError} <button className="pp-button" type="button" onClick={() => window.location.reload()}>Retry</button></div></ProductShell>;
  }
  if (closedAttempt) {
    return <AssessmentReview attemptId={session.attemptId} source={session.source} />;
  }
  return <ConnectedAssessmentSession attemptId={session.attemptId} testId={session.testId} source={session.source} />;
}
