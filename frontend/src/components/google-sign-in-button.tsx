"use client";

import Script from "next/script";
import { apiRequest } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "./locale-provider";

type GoogleCredentialResponse = { credential: string; select_by?: string };
type GoogleAccounts = {
  id: {
    initialize(options: {
      client_id: string;
      callback(response: GoogleCredentialResponse): void;
      auto_select?: boolean;
      cancel_on_tap_outside?: boolean;
    }): void;
    renderButton(
      element: HTMLElement,
      options: {
        type: "standard";
        theme: "outline";
        size: "large";
        text: "continue_with";
        shape: "rectangular";
        width: number;
      },
    ): void;
  };
};

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

export function GoogleSignInButton({
  onCredential,
  disabled = false,
}: {
  onCredential: (credential: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const { locale } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep one runtime source of truth. A client ID baked into the frontend image
  // can remain stale after the backend OAuth credentials have been rotated.
  const [clientId, setClientId] = useState<string | null>(null);
  const [configResolved, setConfigResolved] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const render = useCallback(() => {
    if (!clientId || disabled || !containerRef.current || !window.google) return;
    containerRef.current.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) void onCredential(response.credential);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    const width = Math.max(240, Math.min(420, Math.floor(containerRef.current.getBoundingClientRect().width || 360)));
    window.google.accounts.id.renderButton(containerRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      width,
    });
    setReady(true);
  }, [clientId, disabled, onCredential]);

  useEffect(() => {
    let active = true;
    void apiRequest<{ enabled: boolean; client_id: string | null }>("/auth/google/config")
      .then((configuration) => {
        if (!active) return;
        setClientId(configuration.enabled ? configuration.client_id : null);
        setError(configuration.enabled ? null : "Google authentication is not configured.");
      })
      .catch(() => {
        if (active) setError("Unable to load Google authentication.");
      })
      .finally(() => {
        if (active) setConfigResolved(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (window.google) render();
    const handleResize = () => render();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [render]);

  if (!configResolved) {
    return <button className="google-button" disabled aria-busy="true"><b>G</b> {locale === "ar" ? "جارٍ تحميل Google…" : "Loading Google…"}</button>;
  }

  if (!clientId) {
    return <button className="google-button" disabled title={error || "Google authentication is unavailable"}><b>G</b> {locale === "ar" ? "Google غير متاح" : "Google unavailable"}</button>;
  }

  return <div className={`google-signin-shell ${disabled ? "disabled" : ""}`} aria-busy={!ready && !disabled}>
    <Script src={`https://accounts.google.com/gsi/client?hl=${locale}`} strategy="afterInteractive" onLoad={() => { setError(null); render(); }} onError={() => setError("Google sign-in could not be loaded. Check your connection and allowed domains.")} />
    <div ref={containerRef} className="google-signin-render" />
    {error ? <span className="google-signin-loading" role="alert">{error}</span> : !ready && !disabled && <span className="google-signin-loading">{locale === "ar" ? "جارٍ تحميل تسجيل الدخول عبر Google…" : "Loading Google sign-in…"}</span>}
  </div>;
}
