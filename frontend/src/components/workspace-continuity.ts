"use client";

import { useEffect } from "react";

export type RecentWorkspacePage = {
  href: string;
  label: string;
  visitedAt: number;
};

const RECENT_KEY = "mdp-recent-workspace-pages";
const SCROLL_PREFIX = "mdp-scroll:";

export function readRecentWorkspacePages(): RecentWorkspacePage[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as RecentWorkspacePage[];
    return Array.isArray(value)
      ? value.filter((item) => item && typeof item.href === "string" && typeof item.label === "string")
      : [];
  } catch {
    return [];
  }
}

export function recordRecentWorkspacePage(page: Omit<RecentWorkspacePage, "visitedAt">) {
  try {
    const next = [
      { ...page, visitedAt: Date.now() },
      ...readRecentWorkspacePages().filter((item) => item.href !== page.href),
    ].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("mdp:recent-pages-changed"));
  } catch {
    // Browsing continuity should never block navigation when storage is unavailable.
  }
}

export function useWorkspaceContinuity(pathname: string, label: string, href = pathname) {
  useEffect(() => {
    recordRecentWorkspacePage({ href, label });
  }, [href, label]);

  useEffect(() => {
    const key = `${SCROLL_PREFIX}${pathname}`;
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    let saveTimer = 0;

    try {
      const stored = Number(sessionStorage.getItem(key));
      if (Number.isFinite(stored) && stored > 0) {
        const frame = window.requestAnimationFrame(() => window.scrollTo({ top: stored, behavior: "auto" }));
        return () => {
          window.cancelAnimationFrame(frame);
          sessionStorage.setItem(key, String(window.scrollY));
          history.scrollRestoration = previousRestoration;
        };
      }
    } catch {
      // Ignore unavailable session storage.
    }

    const save = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        try {
          sessionStorage.setItem(key, String(window.scrollY));
        } catch {
          // Ignore unavailable session storage.
        }
      }, 120);
    };

    window.addEventListener("scroll", save, { passive: true });
    return () => {
      window.clearTimeout(saveTimer);
      window.removeEventListener("scroll", save);
      try {
        sessionStorage.setItem(key, String(window.scrollY));
      } catch {
        // Ignore unavailable session storage.
      }
      history.scrollRestoration = previousRestoration;
    };
  }, [pathname]);
}
