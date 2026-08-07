"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

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
    if (window.google) render();
    const handleResize = () => render();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [render]);

  if (!clientId) {
    return <button className="google-button" disabled title="Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Google sign-in"><b>G</b> Continue with Google</button>;
  }

  return <div className={`google-signin-shell ${disabled ? "disabled" : ""}`} aria-busy={!ready && !disabled}>
    <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={render} />
    <div ref={containerRef} className="google-signin-render" />
    {!ready && !disabled && <span className="google-signin-loading">Loading Google sign-in…</span>}
  </div>;
}
