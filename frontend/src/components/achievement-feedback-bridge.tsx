"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "./auth-provider";
import { useUx } from "./ux-provider";

type Achievement = {
  id: string;
  title: string;
  description: string;
};

type AchievementSync = {
  newly_unlocked: Achievement[];
};

const ACHIEVEMENT_CHECK = "mdp:achievement-check";

export function AchievementFeedbackBridge() {
  const { user, request } = useAuth();
  const { celebrate } = useUx();
  const busy = useRef(false);
  const queued = useRef(false);
  const timer = useRef<number | null>(null);

  const sync = useCallback(async () => {
    if (user?.role !== "STUDENT") return;
    if (busy.current) {
      queued.current = true;
      return;
    }
    busy.current = true;
    try {
      const result = await request<AchievementSync>("/progress/achievements/sync", { method: "POST" });
      const achievement = result.newly_unlocked[0];
      if (achievement) {
        celebrate({
          id: achievement.id,
          title: achievement.title,
          description: achievement.description,
        });
      }
    } catch {
      // Achievement feedback must never block the learning workflow that earned it.
    } finally {
      busy.current = false;
      if (queued.current) {
        queued.current = false;
        void sync();
      }
    }
  }, [celebrate, request, user?.role]);

  useEffect(() => {
    if (user?.role === "STUDENT") void sync();
  }, [sync, user?.id, user?.role]);

  useEffect(() => {
    const schedule = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void sync(), 350);
    };
    window.addEventListener(ACHIEVEMENT_CHECK, schedule);
    return () => {
      window.removeEventListener(ACHIEVEMENT_CHECK, schedule);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [sync]);

  return null;
}
