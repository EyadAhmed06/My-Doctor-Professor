"use client";

import { useEffect } from "react";
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
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".public-home");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    root.classList.add("home-motion-ready");

    const entryFrame = window.requestAnimationFrame(() => {
      root.classList.add("home-motion-entered");
    });

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

    return () => {
      window.cancelAnimationFrame(entryFrame);
      observer.disconnect();
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

  return null;
}
