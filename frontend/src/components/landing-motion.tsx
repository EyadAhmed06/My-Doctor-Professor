"use client";

import { useEffect, useState } from "react";
import "./landing-motion.css";

const revealItemSelector = [
  ".story-copy > p",
  ".thyroid-visual",
  ".thyroid-copy > *",
  ".organ-image-grid > figure",
  ".public-goal > *",
  ".year-grid > .year-card",
  ".feature-grid > article",
  ".circulation-copy > *",
  ".circulation-feature > figure",
  ".workflow-copy > *",
  ".workflow-section > ol > li",
  ".why-grid > article",
  ".public-cta > *",
  ".footer-main > div",
].join(", ");

export function LandingMotion() {
  const [introVisible, setIntroVisible] = useState(true);
  const [introLeaving, setIntroLeaving] = useState(false);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".public-home");
    if (!root) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setIntroVisible(false);
      return;
    }

    root.classList.add("home-motion-ready");

    const revealTargets = Array.from(root.querySelectorAll<HTMLElement>(
      ":scope > section:not(.public-hero), :scope > footer",
    ));

    const parentIndexes = new Map<Element, number>();
    const revealItems = Array.from(root.querySelectorAll<HTMLElement>(revealItemSelector));

    revealTargets.forEach((target, index) => {
      target.dataset.homeReveal = index % 3 === 2 ? "up" : index % 2 === 0 ? "left" : "right";
    });

    revealItems.forEach((item) => {
      item.dataset.homeRevealItem = "";
      const parent = item.parentElement;
      const index = parent ? parentIndexes.get(parent) ?? 0 : 0;
      item.style.setProperty("--home-item-index", String(Math.min(index, 7)));
      if (parent) parentIndexes.set(parent, index + 1);
    });

    const reveal = (target: HTMLElement) => {
      target.classList.add("is-home-visible");
      target.querySelectorAll<HTMLElement>("[data-home-reveal-item]").forEach((item) => {
        item.classList.add("is-home-visible");
      });
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const target = entry.target as HTMLElement;
        reveal(target);
        observer.unobserve(target);
      });
    }, {
      threshold: 0.12,
      rootMargin: "0px 0px -8% 0px",
    });

    revealTargets.forEach((target) => observer.observe(target));

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const startedAt = performance.now();
    let exitTimer = 0;
    let finishTimer = 0;
    let fallbackTimer = 0;
    let released = false;

    const releaseIntro = () => {
      if (released) return;
      released = true;
      const minimumVisibleMs = 850;
      const remaining = Math.max(0, minimumVisibleMs - (performance.now() - startedAt));

      exitTimer = window.setTimeout(() => {
        setIntroLeaving(true);
        document.body.style.overflow = previousOverflow;

        finishTimer = window.setTimeout(() => {
          setIntroVisible(false);
          window.requestAnimationFrame(() => root.classList.add("home-motion-entered"));
        }, 620);
      }, remaining);
    };

    if (document.readyState === "complete") releaseIntro();
    else window.addEventListener("load", releaseIntro, { once: true });

    /* Never let a slow third-party asset trap the user behind the intro. */
    fallbackTimer = window.setTimeout(releaseIntro, 3000);

    return () => {
      window.removeEventListener("load", releaseIntro);
      window.clearTimeout(exitTimer);
      window.clearTimeout(finishTimer);
      window.clearTimeout(fallbackTimer);
      observer.disconnect();
      document.body.style.overflow = previousOverflow;
      root.classList.remove("home-motion-ready", "home-motion-entered");
      revealTargets.forEach((target) => {
        target.classList.remove("is-home-visible");
        delete target.dataset.homeReveal;
      });
      revealItems.forEach((item) => {
        item.classList.remove("is-home-visible");
        delete item.dataset.homeRevealItem;
        item.style.removeProperty("--home-item-index");
      });
    };
  }, []);

  if (!introVisible) return null;

  return (
    <div className={`home-first-load${introLeaving ? " is-leaving" : ""}`} aria-hidden="true">
      <div className="home-first-load-glow" />
      <div className="home-first-load-mark">
        <span className="home-first-load-pulse" />
        <strong>MDP</strong>
      </div>
      <div className="home-first-load-copy">
        <span>MY DOCTOR &amp; THE PROFESSOR</span>
        <small>The professor&apos;s wisdom. The doctor&apos;s precision.</small>
      </div>
      <div className="home-first-load-line"><i /></div>
    </div>
  );
}
