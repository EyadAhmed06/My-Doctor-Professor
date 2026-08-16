"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { FiAlertTriangle, FiAward, FiCheck, FiInfo, FiX } from "react-icons/fi";
import { useAuth } from "./auth-provider";

export type ToastTone = "success" | "error" | "warning" | "info";
export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
};
export type ConfirmInput = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};
export type AchievementInput = {
  id: string;
  title: string;
  description: string;
  points?: number;
};
export type UnlockedAchievement = AchievementInput & { unlockedAt: string };

type Toast = ToastInput & { id: string; tone: ToastTone };
type Confirmation = ConfirmInput & { resolve: (accepted: boolean) => void };
type UxContextValue = {
  notify(input: ToastInput): string;
  dismiss(id: string): void;
  startNavigation(): void;
  confirm(input: ConfirmInput): Promise<boolean>;
  celebrate(input: AchievementInput): boolean;
  achievements: UnlockedAchievement[];
};

const UxContext = createContext<UxContextValue | null>(null);
const REQUEST_START = "mdp:request-start";
const REQUEST_END = "mdp:request-end";
const ACHIEVEMENT_KEY_PREFIX = "mdp_unlocked_achievements_v2";

function readAchievements(storageKey: string): UnlockedAchievement[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is UnlockedAchievement => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<UnlockedAchievement>;
      return typeof candidate.id === "string" && typeof candidate.title === "string" && typeof candidate.description === "string" && typeof candidate.unlockedAt === "string";
    });
  } catch {
    return [];
  }
}

function confirmationCopy(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("log out") || normalized.includes("logout")) return {
    title: "Log out?",
    description: "Your current session on this device will end. Unsaved form changes may be lost.",
    confirmLabel: "Log out",
  };
  if (normalized.includes("reset")) return {
    title: "Start the reset workflow?",
    description: "This can revoke active sessions and send recovery instructions to the affected account.",
    confirmLabel: "Continue reset",
  };
  return {
    title: "Confirm destructive action",
    description: `${label || "This action"} may permanently remove data or access and cannot always be reversed.`,
    confirmLabel: normalized.includes("remove") ? "Remove" : "Delete",
  };
}

export function UxProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const achievementStorageKey = `${ACHIEVEMENT_KEY_PREFIX}:${user?.id || "anonymous"}`;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [routeBusy, setRouteBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [activeAchievement, setActiveAchievement] = useState<UnlockedAchievement | null>(null);
  const [achievements, setAchievements] = useState<UnlockedAchievement[]>([]);
  const timers = useRef(new Map<string, number>());
  const achievementTimer = useRef<number | null>(null);
  const confirmationRef = useRef<Confirmation | null>(null);
  const unlockedIds = useRef(new Set<string>());
  const approvedDangerClick = useRef(false);
  const offlineToast = useRef<string | null>(null);
  const confirmationButton = useRef<HTMLButtonElement>(null);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const notify = useCallback((input: ToastInput) => {
    const id = crypto.randomUUID();
    const toast: Toast = { ...input, id, tone: input.tone ?? "info" };
    setToasts(current => [...current, toast].slice(-4));
    const duration = input.duration === undefined ? 5000 : input.duration;
    if (duration > 0) {
      const timer = window.setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  const startNavigation = useCallback(() => {
    setRouteBusy(true);
    window.setTimeout(() => window.dispatchEvent(new Event("mdp:continuity-changed")), 0);
  }, []);

  const finishConfirmation = useCallback((accepted: boolean) => {
    const current = confirmationRef.current;
    confirmationRef.current = null;
    setConfirmation(null);
    current?.resolve(accepted);
  }, []);

  const confirm = useCallback((input: ConfirmInput) => new Promise<boolean>(resolve => {
    if (confirmationRef.current) confirmationRef.current.resolve(false);
    const next: Confirmation = { ...input, resolve };
    confirmationRef.current = next;
    setConfirmation(next);
  }), []);

  const celebrate = useCallback((input: AchievementInput) => {
    if (!user) return false;
    const stored = readAchievements(achievementStorageKey);
    if (unlockedIds.current.has(input.id) || stored.some(item => item.id === input.id)) {
      unlockedIds.current.add(input.id);
      return false;
    }
    unlockedIds.current.add(input.id);
    const unlocked: UnlockedAchievement = { ...input, unlockedAt: new Date().toISOString() };
    setAchievements(current => {
      const existing = current.length ? current : stored;
      const next = [unlocked, ...existing.filter(item => item.id !== unlocked.id)].slice(0, 100);
      localStorage.setItem(achievementStorageKey, JSON.stringify(next));
      return next;
    });
    setActiveAchievement(unlocked);
    if (achievementTimer.current) window.clearTimeout(achievementTimer.current);
    achievementTimer.current = window.setTimeout(() => setActiveAchievement(null), 5200);
    notify({
      title: input.title,
      description: input.points ? `${input.description} +${input.points} XP` : input.description,
      tone: "success",
      duration: 4500,
    });
    return true;
  }, [achievementStorageKey, notify, user]);

  useEffect(() => {
    const stored = user ? readAchievements(achievementStorageKey) : [];
    setAchievements(stored);
    setActiveAchievement(null);
    unlockedIds.current = new Set(stored.map(item => item.id));
  }, [achievementStorageKey, user]);

  useEffect(() => {
    const start = () => setRequestCount(count => count + 1);
    const end = () => setRequestCount(count => Math.max(0, count - 1));
    window.addEventListener(REQUEST_START, start);
    window.addEventListener(REQUEST_END, end);
    return () => {
      window.removeEventListener(REQUEST_START, start);
      window.removeEventListener(REQUEST_END, end);
    };
  }, []);

  useEffect(() => {
    const captureInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin === window.location.origin && destination.href !== window.location.href) startNavigation();
    };
    document.addEventListener("click", captureInternalNavigation, true);
    return () => document.removeEventListener("click", captureInternalNavigation, true);
  }, [startNavigation]);

  useEffect(() => {
    const originalConfirm = window.confirm.bind(window);
    window.confirm = (message?: string) => approvedDangerClick.current ? true : originalConfirm(message);
    const captureDangerousAction = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("button.danger,button[title*='delete' i],button[title*='remove' i],button[title*='reset' i],button[aria-label*='delete' i],button[aria-label*='remove' i],button[aria-label*='reset' i]")
        : null;
      if (!target || target.disabled || target.dataset.phase5Confirmed === "true" || target.closest(".phase5-confirm")) return;
      const label = (target.getAttribute("title") || target.getAttribute("aria-label") || target.textContent || "This action").replace(/\s+/g, " ").trim();
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const copy = confirmationCopy(label);
      void confirm({ ...copy, cancelLabel: "Cancel", tone: "danger" }).then(accepted => {
        if (!accepted || !target.isConnected) return;
        target.dataset.phase5Confirmed = "true";
        approvedDangerClick.current = true;
        try {
          target.click();
        } finally {
          approvedDangerClick.current = false;
          delete target.dataset.phase5Confirmed;
        }
      });
    };
    document.addEventListener("click", captureDangerousAction, true);
    return () => {
      document.removeEventListener("click", captureDangerousAction, true);
      window.confirm = originalConfirm;
    };
  }, [confirm]);

  useEffect(() => {
    if (!routeBusy) return;
    const timer = window.setTimeout(() => setRouteBusy(false), 320);
    return () => window.clearTimeout(timer);
  }, [pathname, routeBusy]);

  useEffect(() => {
    const goOffline = () => {
      if (offlineToast.current) return;
      offlineToast.current = notify({
        title: "Connection lost",
        description: "Changes that support local recovery will remain on this device.",
        tone: "warning",
        duration: 0,
      });
    };
    const goOnline = () => {
      if (offlineToast.current) dismiss(offlineToast.current);
      offlineToast.current = null;
      notify({ title: "Back online", description: "Requests can sync again.", tone: "success", duration: 3000 });
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    if (!navigator.onLine) window.setTimeout(goOffline, 0);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [dismiss, notify]);

  useEffect(() => {
    const receiveAchievement = (event: Event) => {
      const detail = (event as CustomEvent<AchievementInput>).detail;
      if (detail?.id && detail.title && detail.description) celebrate(detail);
    };
    window.addEventListener("mdp:achievement", receiveAchievement);
    return () => window.removeEventListener("mdp:achievement", receiveAchievement);
  }, [celebrate]);

  useEffect(() => {
    if (!confirmation) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => confirmationButton.current?.focus());
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishConfirmation(false);
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", escape);
      previous?.focus();
    };
  }, [confirmation, finishConfirmation]);

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const timer of activeTimers.values()) window.clearTimeout(timer);
      activeTimers.clear();
      if (achievementTimer.current) window.clearTimeout(achievementTimer.current);
      confirmationRef.current?.resolve(false);
    };
  }, []);

  const value = useMemo(() => ({ notify, dismiss, startNavigation, confirm, celebrate, achievements }), [achievements, celebrate, confirm, dismiss, notify, startNavigation]);
  const busy = requestCount > 0 || routeBusy;

  return <UxContext.Provider value={value}>
    <div className="global-progress" data-active={busy} aria-hidden="true"><i /></div>
    {children}
    <section className="toast-viewport" aria-label="Application messages" aria-live="polite" aria-relevant="additions removals">
      {toasts.map(toast => {
        const Icon = toast.tone === "success" ? FiCheck : toast.tone === "warning" || toast.tone === "error" ? FiAlertTriangle : FiInfo;
        return <article className="app-toast" data-tone={toast.tone} key={toast.id} role={toast.tone === "error" ? "alert" : "status"}>
          <Icon />
          <div><strong>{toast.title}</strong>{toast.description && <p>{toast.description}</p>}</div>
          {toast.actionLabel && toast.onAction && <button type="button" className="toast-action" onClick={() => void Promise.resolve(toast.onAction?.()).finally(() => dismiss(toast.id))}>{toast.actionLabel}</button>}
          <button type="button" className="toast-dismiss" aria-label="Dismiss message" onClick={() => dismiss(toast.id)}><FiX /></button>
        </article>;
      })}
    </section>
    {confirmation && <div className="phase5-confirm-backdrop" role="presentation" onMouseDown={() => finishConfirmation(false)}>
      <section className="phase5-confirm" role="alertdialog" aria-modal="true" aria-labelledby="phase5-confirm-title" aria-describedby="phase5-confirm-description" onMouseDown={event => event.stopPropagation()}>
        <span className={confirmation.tone === "danger" ? "danger" : "default"}><FiAlertTriangle /></span>
        <h2 id="phase5-confirm-title">{confirmation.title}</h2>
        <p id="phase5-confirm-description">{confirmation.description}</p>
        <footer>
          <button type="button" className="phase5-secondary" onClick={() => finishConfirmation(false)}>{confirmation.cancelLabel || "Cancel"}</button>
          <button ref={confirmationButton} type="button" className={confirmation.tone === "danger" ? "phase5-danger" : "phase5-primary"} onClick={() => finishConfirmation(true)}>{confirmation.confirmLabel || "Continue"}</button>
        </footer>
      </section>
    </div>}
    {activeAchievement && <section className="phase5-achievement" role="status" aria-live="polite">
      <div className="phase5-achievement-rays" aria-hidden="true" />
      <button type="button" aria-label="Dismiss achievement" onClick={() => setActiveAchievement(null)}><FiX /></button>
      <span><FiAward /></span>
      <small>ACHIEVEMENT UNLOCKED</small>
      <h2>{activeAchievement.title}</h2>
      <p>{activeAchievement.description}</p>
      {activeAchievement.points && <b>+{activeAchievement.points} XP</b>}
    </section>}
  </UxContext.Provider>;
}

export function useUx() {
  const value = useContext(UxContext);
  if (!value) throw new Error("useUx must be used inside UxProvider");
  return value;
}
