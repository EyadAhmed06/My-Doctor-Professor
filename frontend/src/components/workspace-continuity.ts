"use client";

import { useEffect } from "react";

export type RecentWorkspacePage = { href:string; label:string; visitedAt:number };
const RECENT_KEY = "mdp-recent-workspace-pages";
const SCROLL_PREFIX = "mdp-scroll:";

export function readRecentWorkspacePages(): RecentWorkspacePage[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as RecentWorkspacePage[];
    return Array.isArray(value) ? value.filter((item) => item && typeof item.href === "string" && typeof item.label === "string") : [];
  } catch { return []; }
}

export function recordRecentWorkspacePage(page: Omit<RecentWorkspacePage, "visitedAt">) {
  try {
    const next = [{ ...page, visitedAt: Date.now() }, ...readRecentWorkspacePages().filter((item) => item.href !== page.href)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("mdp:recent-pages-changed"));
  } catch { /* Browsing continuity must not block navigation. */ }
}

export function signalContinuityChange(){window.dispatchEvent(new Event("mdp:continuity-changed"));}

export function useWorkspaceContinuity(pathname: string, label: string) {
  useEffect(() => {
    const sync=()=>recordRecentWorkspacePage({href:`${window.location.pathname}${window.location.search}`,label});
    sync();
    window.addEventListener("popstate",sync);
    window.addEventListener("mdp:continuity-changed",sync);
    return()=>{window.removeEventListener("popstate",sync);window.removeEventListener("mdp:continuity-changed",sync);};
  }, [label, pathname]);

  useEffect(() => {
    const key = `${SCROLL_PREFIX}${pathname}`;
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    let saveTimer = 0;
    try {
      const stored = Number(sessionStorage.getItem(key));
      if (Number.isFinite(stored) && stored > 0) window.requestAnimationFrame(() => window.scrollTo({ top: stored, behavior: "auto" }));
    } catch { /* Ignore unavailable session storage. */ }
    const save = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => { try { sessionStorage.setItem(key, String(window.scrollY)); } catch {} }, 120);
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      window.clearTimeout(saveTimer);window.removeEventListener("scroll", save);
      try { sessionStorage.setItem(key, String(window.scrollY)); } catch {}
      history.scrollRestoration = previousRestoration;
    };
  }, [pathname]);
}
