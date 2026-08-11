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

function courseMcqCount(course: BundleContent["courses"][number]) {
  return course.weeks.reduce(
    (weekTotal, week) => weekTotal + week.lectures.reduce(
      (lectureTotal, lecture) => lectureTotal + finiteCount(lecture.mcq_count),
      0,
    ),
    0,
  );
}

/**
 * A lecture practice quiz cannot mix lectures from different courses. Hide the
 * 40-MCQ entry point until the server confirms that at least one single course
 * in this bundle has a usable pool of 40 active question-bank MCQs.
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
        .then((content) => !content.bundle.read_only && content.courses.some((course) => courseMcqCount(course) >= REQUIRED_MCQS))
        .catch(() => false);
      cache.current.set(bundleId, pending);
      return pending;
    }

    function inspect() {
      const links = document.querySelectorAll<HTMLAnchorElement>('a[href^="/rounds?bundle="],a[href*="/rounds?bundle="]');
      links.forEach((link) => {
        const url = new URL(link.href, window.location.origin);
        const bundleId = url.searchParams.get("bundle");
        if (!bundleId || (link.dataset.quizAvailability === "ready" && link.dataset.quizBundle === bundleId)) return;
        link.hidden = true;
        link.setAttribute("aria-hidden", "true");
        link.tabIndex = -1;
        link.dataset.quizAvailability = "checking";
        link.dataset.quizBundle = bundleId;
        void readiness(bundleId).then((ready) => {
          if (disposed || !link.isConnected || link.dataset.quizBundle !== bundleId) return;
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
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [request]);

  return null;
}
