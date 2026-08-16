"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "./auth-provider";

type BundleContent = {
  bundle: { id: string; read_only?: boolean };
  courses: Array<{
    id: string;
    weeks: Array<{
      lectures: Array<{ id: string; mcq_count?: number | string | null }>;
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

function resolvedLaunchUrl(source: URL, content: BundleContent) {
  if (content.bundle.read_only) return null;
  const url = new URL(source.toString());
  const courseId = url.searchParams.get("course");
  const lectureId = url.searchParams.get("lecture");

  if (lectureId) {
    const lecture = content.courses.flatMap((course) => course.weeks).flatMap((week) => week.lectures).find((item) => item.id === lectureId);
    return finiteCount(lecture?.mcq_count) >= REQUIRED_MCQS ? url : null;
  }

  if (courseId) {
    const course = content.courses.find((item) => item.id === courseId);
    return course && courseMcqCount(course) >= REQUIRED_MCQS ? url : null;
  }

  const eligibleCourse = content.courses.find((course) => courseMcqCount(course) >= REQUIRED_MCQS);
  if (!eligibleCourse) return null;
  url.searchParams.set("course", eligibleCourse.id);
  return url;
}

/**
 * The fixed curriculum practice flow needs forty eligible active question-bank
 * MCQs and it cannot mix courses. Hide every /rounds bundle entry point until
 * the URL's scope can satisfy that invariant. Bundle-level links are tightened
 * to the first eligible course so the student never lands on an empty course.
 */
export function BundleQuizAvailabilityGuard() {
  const { request } = useAuth();
  const cache = useRef(new Map<string, Promise<BundleContent | null>>());

  useEffect(() => {
    let disposed = false;

    function contentFor(bundleId: string) {
      const existing = cache.current.get(bundleId);
      if (existing) return existing;
      const pending = request<BundleContent>(`/bundles/${bundleId}/content`).catch(() => null);
      cache.current.set(bundleId, pending);
      return pending;
    }

    function inspect() {
      const links = document.querySelectorAll<HTMLAnchorElement>('a[href^="/rounds?bundle="],a[href*="/rounds?bundle="]');
      links.forEach((link) => {
        const url = new URL(link.href, window.location.origin);
        const bundleId = url.searchParams.get("bundle");
        const scopeKey = `${bundleId || ""}:${url.searchParams.get("course") || ""}:${url.searchParams.get("lecture") || ""}`;
        if (!bundleId || (link.dataset.quizAvailability === "ready" && link.dataset.quizScope === scopeKey)) return;

        link.hidden = true;
        link.setAttribute("aria-hidden", "true");
        link.tabIndex = -1;
        link.dataset.quizAvailability = "checking";
        link.dataset.quizScope = scopeKey;

        void contentFor(bundleId).then((content) => {
          if (disposed || !link.isConnected || link.dataset.quizScope !== scopeKey) return;
          const resolved = content ? resolvedLaunchUrl(url, content) : null;
          if (!resolved) {
            link.dataset.quizAvailability = "unavailable";
            link.hidden = true;
            return;
          }

          const href = `${resolved.pathname}${resolved.search}${resolved.hash}`;
          const resolvedScope = `${bundleId}:${resolved.searchParams.get("course") || ""}:${resolved.searchParams.get("lecture") || ""}`;
          if (link.getAttribute("href") !== href) link.setAttribute("href", href);
          link.dataset.quizScope = resolvedScope;
          link.dataset.quizAvailability = "ready";
          link.hidden = false;
          link.removeAttribute("aria-hidden");
          link.removeAttribute("tabindex");
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
