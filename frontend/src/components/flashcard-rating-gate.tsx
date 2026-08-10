"use client";

import { ReactNode, useEffect, useRef } from "react";
import { useLocale } from "./locale-provider";
import { useUx } from "./ux-provider";

function answerIsRevealed() {
  return Boolean(document.querySelector(".flashcards-simplified .study-card .card-back"));
}

function isRatingControl(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(".review-rating"));
}

export function FlashcardRatingGate({ children }: { children: ReactNode }) {
  const { translate } = useLocale();
  const { notify } = useUx();
  const lastNoticeAt = useRef(0);

  useEffect(() => {
    function warn() {
      const now = Date.now();
      if (now - lastNoticeAt.current < 1200) return;
      lastNoticeAt.current = now;
      notify({
        title: translate("Rate this card to continue"),
        description: translate("Once the answer is revealed, choose Again, Hard, Good, or Easy before moving away from this card."),
        tone: "info",
        duration: 2200,
      });
    }

    function block(event: Event) {
      event.preventDefault();
      event.stopPropagation();
      if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
      warn();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!answerIsRevealed()) return;
      if (["1", "2", "3", "4"].includes(event.key)) return;
      if (event.code === "Space" || event.key === "ArrowLeft" || event.key === "ArrowRight") block(event);
    }

    function handleClick(event: MouseEvent) {
      if (!answerIsRevealed() || isRatingControl(event.target)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest(".study-card") || target.closest(".flashcard-session-toolbar") || target.closest("a[href]")) block(event);
    }

    function handlePointer(event: PointerEvent) {
      if (!answerIsRevealed() || isRatingControl(event.target)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".study-card")) block(event);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("click", handleClick, true);
    window.addEventListener("pointerdown", handlePointer, true);
    window.addEventListener("pointermove", handlePointer, true);
    window.addEventListener("pointerup", handlePointer, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("pointerdown", handlePointer, true);
      window.removeEventListener("pointermove", handlePointer, true);
      window.removeEventListener("pointerup", handlePointer, true);
    };
  }, [notify, translate]);

  return children;
}
