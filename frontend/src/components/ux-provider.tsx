"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FiAlertTriangle, FiCheck, FiInfo, FiX } from "react-icons/fi";

export type ToastTone = "success" | "error" | "warning" | "info";
export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
};

type Toast = ToastInput & { id: string; tone: ToastTone };
type UxContextValue = {
  notify(input: ToastInput): string;
  dismiss(id: string): void;
  startNavigation(): void;
};

const UxContext = createContext<UxContextValue | null>(null);
const REQUEST_START = "mdp:request-start";
const REQUEST_END = "mdp:request-end";

export function UxProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [routeBusy, setRouteBusy] = useState(false);
  const timers = useRef(new Map<string, number>());
  const offlineToast = useRef<string | null>(null);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (input: ToastInput) => {
      const id = crypto.randomUUID();
      const toast: Toast = { ...input, id, tone: input.tone ?? "info" };
      setToasts((current) => [...current, toast].slice(-4));
      const duration = input.duration === undefined ? 5000 : input.duration;
      if (duration > 0) {
        const timer = window.setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  const startNavigation = useCallback(() => setRouteBusy(true), []);

  useEffect(() => {
    const start = () => setRequestCount((count) => count + 1);
    const end = () => setRequestCount((count) => Math.max(0, count - 1));
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
      if (destination.origin === window.location.origin && destination.pathname !== window.location.pathname) startNavigation();
    };
    document.addEventListener("click", captureInternalNavigation, true);
    return () => document.removeEventListener("click", captureInternalNavigation, true);
  }, [startNavigation]);

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

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const value = useMemo(() => ({ notify, dismiss, startNavigation }), [dismiss, notify, startNavigation]);
  const busy = requestCount > 0 || routeBusy;

  return (
    <UxContext.Provider value={value}>
      <div className="global-progress" data-active={busy} aria-hidden="true"><i /></div>
      {children}
      <section className="toast-viewport" aria-label="Application messages" aria-live="polite" aria-relevant="additions removals">
        {toasts.map((toast) => {
          const Icon = toast.tone === "success" ? FiCheck : toast.tone === "warning" || toast.tone === "error" ? FiAlertTriangle : FiInfo;
          return (
            <article className="app-toast" data-tone={toast.tone} key={toast.id} role={toast.tone === "error" ? "alert" : "status"}>
              <Icon />
              <div><strong>{toast.title}</strong>{toast.description && <p>{toast.description}</p>}</div>
              {toast.actionLabel && toast.onAction && (
                <button type="button" className="toast-action" onClick={() => void Promise.resolve(toast.onAction?.()).finally(() => dismiss(toast.id))}>
                  {toast.actionLabel}
                </button>
              )}
              <button type="button" className="toast-dismiss" aria-label="Dismiss message" onClick={() => dismiss(toast.id)}><FiX /></button>
            </article>
          );
        })}
      </section>
    </UxContext.Provider>
  );
}

export function useUx() {
  const value = useContext(UxContext);
  if (!value) throw new Error("useUx must be used inside UxProvider");
  return value;
}
