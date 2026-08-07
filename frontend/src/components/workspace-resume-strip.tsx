"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FiArrowRight, FiClock, FiX } from "react-icons/fi";
import { useUx } from "./ux-provider";
import { readRecentWorkspacePages, type RecentWorkspacePage } from "./workspace-continuity";

const excluded = ["/dashboard", "/settings", "/notifications"];

export function WorkspaceResumeStrip() {
  const pathname = usePathname();
  const router = useRouter();
  const { startNavigation } = useUx();
  const [recent, setRecent] = useState<RecentWorkspacePage[]>([]);
  const [dismissedHref, setDismissedHref] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => setRecent(readRecentWorkspacePages());
    sync();
    window.addEventListener("mdp:recent-pages-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("mdp:recent-pages-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const target = useMemo(() => recent.find((item) => {
    const targetPath = item.href.split("?")[0].split("#")[0];
    return targetPath !== pathname && !excluded.includes(targetPath);
  }) || null, [pathname, recent]);

  if (!target || dismissedHref === target.href || now === null) return null;

  const ageMinutes = Math.max(1, Math.round((now - target.visitedAt) / 60000));
  const age = ageMinutes < 60 ? `${ageMinutes}m ago` : ageMinutes < 1440 ? `${Math.round(ageMinutes / 60)}h ago` : `${Math.round(ageMinutes / 1440)}d ago`;

  return <section className="workspace-resume-strip" aria-label="Resume recent work">
    <span className="workspace-resume-icon"><FiClock /></span>
    <div>
      <small>RESUME WHERE YOU LEFT OFF</small>
      <b>{target.label}</b>
      <span>Last opened {age}</span>
    </div>
    <button className="workspace-resume-action" type="button" onClick={() => {
      startNavigation();
      router.push(target.href);
    }}>Resume <FiArrowRight /></button>
    <button className="workspace-resume-dismiss" type="button" aria-label="Dismiss resume suggestion" onClick={() => setDismissedHref(target.href)}><FiX /></button>
  </section>;
}