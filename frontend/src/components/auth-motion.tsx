"use client";

import { useEffect, useMemo, useState } from "react";
import "./auth-motion.css";

export type AuthMotionVariant = "login" | "register" | "verify" | "forgot" | "reset";

const copy: Record<AuthMotionVariant, { eyebrow: string; slides: string[] }> = {
  login: {
    eyebrow: "WELCOME BACK",
    slides: ["Restore your learning workspace", "Resume your clinical reasoning", "Continue exactly where you stopped"],
  },
  register: {
    eyebrow: "BUILD YOUR WORKSPACE",
    slides: ["Create your learning identity", "Connect courses, questions, and review", "Start building clinical momentum"],
  },
  verify: {
    eyebrow: "VERIFY YOUR ACCOUNT",
    slides: ["Confirm your identity securely", "Protect access to your progress", "Unlock the rest of your workspace"],
  },
  forgot: {
    eyebrow: "ACCOUNT RECOVERY",
    slides: ["Recover access securely", "Protect your active sessions", "Return to learning without losing progress"],
  },
  reset: {
    eyebrow: "SECURE YOUR ACCOUNT",
    slides: ["Create a stronger password", "Invalidate old access safely", "Return with a clean session"],
  },
};

export function AuthMotion({ variant }: { variant: AuthMotionVariant }) {
  const configuration = copy[variant];
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [slide, setSlide] = useState(0);
  const dots = useMemo(() => configuration.slides.map((_, index) => index), [configuration.slides]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-auth-motion-root]");
    if (!root) {
      setVisible(false);
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      root.classList.add("auth-motion-entered");
      setVisible(false);
      return () => root.classList.remove("auth-motion-entered");
    }

    root.classList.add("auth-motion-ready");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const startedAt = performance.now();
    let released = false;
    let leaveTimer = 0;
    let finishTimer = 0;
    let fallbackTimer = 0;

    const slideTimer = window.setInterval(() => {
      setSlide((current) => (current + 1) % configuration.slides.length);
    }, 520);

    const release = () => {
      if (released) return;
      released = true;
      const minimumVisibleMs = 1450;
      const remaining = Math.max(0, minimumVisibleMs - (performance.now() - startedAt));
      leaveTimer = window.setTimeout(() => {
        setLeaving(true);
        document.body.style.overflow = previousOverflow;
        finishTimer = window.setTimeout(() => {
          setVisible(false);
          window.requestAnimationFrame(() => root.classList.add("auth-motion-entered"));
        }, 560);
      }, remaining);
    };

    if (document.readyState === "complete") release();
    else window.addEventListener("load", release, { once: true });
    fallbackTimer = window.setTimeout(release, 2800);

    return () => {
      window.removeEventListener("load", release);
      window.clearInterval(slideTimer);
      window.clearTimeout(leaveTimer);
      window.clearTimeout(finishTimer);
      window.clearTimeout(fallbackTimer);
      document.body.style.overflow = previousOverflow;
      root.classList.remove("auth-motion-ready", "auth-motion-entered");
    };
  }, [configuration.slides.length]);

  if (!visible) return null;

  return <div className={`auth-first-load auth-first-load-${variant}${leaving ? " is-leaving" : ""}`} aria-hidden="true">
    <div className="auth-first-load-glow" />
    <div className="auth-first-load-mark"><span className="auth-first-load-pulse" /><strong>MDP</strong></div>
    <div className="auth-first-load-copy">
      <span>{configuration.eyebrow}</span>
      <div className="auth-first-load-slide" key={`${variant}-${slide}`}>{configuration.slides[slide]}</div>
      <small>MY DOCTOR &amp; THE PROFESSOR</small>
    </div>
    <div className="auth-first-load-dots">{dots.map((index) => <i className={index === slide ? "active" : ""} key={index} />)}</div>
    <div className="auth-first-load-line"><i /></div>
  </div>;
}
