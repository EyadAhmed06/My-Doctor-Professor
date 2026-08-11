"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "./auth-provider";

type BundleContent = {
  bundle: { id: string; read_only?: boolean };
  courses: Array<{
    weeks: Array<{
      lectures: Array<{ mcq_count?: number | string | null }>;
    }>;
  }>;
};

const REQUIRED_MCQS = 40;

function finiteCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * The bundle curriculum historically exposed a 40-MCQ builder even when the
 * selected bundle had no usable MCQ pool. Keep that entry point hidden until
 * the server confirms that at least 40 active question-bank MCQs actually
 * exist. This also prevents the extra dead-end page from flashing while the
 * availability check is in flight.
 */
export function BundleQuizAvailabilityGuard() {
  const { request } = useAuth();
  const cache = useRef(new Map<string, Promise<boolean>>());

  useEffect(() => {
    let disposed = false;

    function readiness(bundleId: string) {
      const existing = cache.current.get(bundleId);
      if (existing) return existing;
      const pending = request<BundleContent>(`/bundles/${bundleId}/content`)
        .then((content) => {
          if (content.bundle.read_only) return false;
          const total = content.courses.reduce((courseTotal, course) => courseTotal + course.weeks.reduce(
            (weekTotal, week) => weekTotal + week.lectures.reduce((lectureTotal, lecture) => lectureTotal + finiteCount(lecture.mcq_count), 0),
            0,
          ), 0);
          return total >= REQUIRED_MCQS;
        })
        .catch(() => false);
      cache.current.set(bundleId, pending);
      return pending;
    }

    function inspect() {
      const links = document.querySelectorAll<HTMLAnchorElement>('a[href^="/rounds?bundle="],a[href*="/rounds?bundle="]');
      links.forEach((link) => {
        const url = new URL(link.href, window.location.origin);
        const bundleId = url.searchParams.get("bundle");
        if (!bundleId || link.dataset.quizAvailability === "ready") return;
        link.hidden = true;
        link.setAttribute("aria-hidden", "true");
        link.tabIndex = -1;
        link.dataset.quizAvailability = "checking";
        void readiness(bundleId).then((ready) => {
          if (disposed || !link.isConnected) return;
          link.dataset.quizAvailability = ready ? "ready" : "unavailable";
          link.hidden = !ready;
          if (ready) {
            link.removeAttribute("aria-hidden");
            link.removeAttribute("tabindex");
          }
        });
      });
    }

    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [request]);

  return null;
}
