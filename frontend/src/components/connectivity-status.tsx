"use client";

import { useEffect, useRef, useState } from "react";
import { FiCloudOff, FiRefreshCw, FiWifi } from "react-icons/fi";
import "./connectivity-status.css";

export function ConnectivityStatus() {
  const [online, setOnline] = useState(true);
  const [reconnected, setReconnected] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    const apply = () => {
      const next = navigator.onLine;
      setOnline((current) => {
        if (initialized.current && !current && next) setReconnected(true);
        return next;
      });
      initialized.current = true;
    };
    apply();
    window.addEventListener("online", apply);
    window.addEventListener("offline", apply);
    return () => {
      window.removeEventListener("online", apply);
      window.removeEventListener("offline", apply);
    };
  }, []);

  useEffect(() => {
    if (!reconnected) return;
    const timer = window.setTimeout(() => setReconnected(false), 3500);
    return () => window.clearTimeout(timer);
  }, [reconnected]);

  if (!online) return <aside className="connectivity-banner offline" role="status" aria-live="polite"><FiCloudOff /><div><b>You are offline</b><span>Saved screens remain visible. Network actions will resume after the connection returns.</span></div><button type="button" onClick={() => globalThis.location.reload()}><FiRefreshCw /> Retry</button></aside>;
  if (reconnected) return <aside className="connectivity-banner online" role="status" aria-live="polite"><FiWifi /><div><b>Connection restored</b><span>Server-backed actions are available again.</span></div></aside>;
  return null;
}