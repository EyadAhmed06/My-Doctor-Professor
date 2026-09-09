"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiActivity, FiBarChart2, FiBookOpen, FiRefreshCw } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { useLocale } from "./locale-provider";
import "./student-progress-control.css";
import "./student-progress-control-fix.css";

type StudentCourse = {
  completionPercentage: string;
  lecturesCompleted: number;
  totalLectures: number;
};

type StudentProgressSnapshot = {
  courses: StudentCourse[];
  questions: { attempts: number; correct_attempts: number; accuracy: string };
  flashcards: { reviewed: number; mastered: number; due: number };
  clinical_momentum?: { level: number; level_progress: number };
};

function normalizeSnapshot(value: Partial<StudentProgressSnapshot> | null | undefined): StudentProgressSnapshot {
  return {
    courses: Array.isArray(value?.courses) ? value.courses : [],
    questions: {
      attempts: numeric(value?.questions?.attempts),
      correct_attempts: numeric(value?.questions?.correct_attempts),
      accuracy: String(value?.questions?.accuracy ?? "0"),
    },
    flashcards: {
      reviewed: numeric(value?.flashcards?.reviewed),
      mastered: numeric(value?.flashcards?.mastered),
      due: numeric(value?.flashcards?.due),
    },
    clinical_momentum: value?.clinical_momentum,
  };
}

function numeric(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function StudentProgressControl({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user, request } = useAuth();
  const { translate, locale } = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [data, setData] = useState<StudentProgressSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (user?.role !== "STUDENT") return;
    setLoading(true);
    setError(null);
    try {
      setData(normalizeSnapshot(await request<Partial<StudentProgressSnapshot>>("/dashboard/student")));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("Unable to load your progress."));
    } finally {
      setLoading(false);
    }
  }, [request, translate, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onOpenChange(false);
      buttonRef.current?.focus();
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [onOpenChange, open]);

  const progress = useMemo(() => {
    const completedLectures = data?.courses?.reduce((sum, item) => sum + numeric(item.lecturesCompleted), 0) ?? 0;
    const totalLectures = data?.courses?.reduce((sum, item) => sum + numeric(item.totalLectures), 0) ?? 0;
    const overallProgress = totalLectures ? clamp(Math.round(completedLectures * 100 / totalLectures)) : 0;
    const mastered = numeric(data?.flashcards?.mastered);
    const progressPoints = numeric(data?.questions?.correct_attempts) + mastered + 10 * completedLectures;
    const level = Math.max(1, numeric(data?.clinical_momentum?.level) || Math.floor(progressPoints / 100) + 1);
    const levelProgress = Math.round(numeric(data?.clinical_momentum?.level_progress) || progressPoints % 100);
    const accuracy = clamp(numeric(data?.questions?.accuracy));
    return { completedLectures, totalLectures, overallProgress, mastered, level, levelProgress, accuracy };
  }, [data]);

  if (user?.role !== "STUDENT") return null;

  return <div className="header-popover-anchor student-progress-anchor" ref={rootRef}>
    <button
      ref={buttonRef}
      className={`student-progress-trigger${open ? " is-open" : ""}`}
      type="button"
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={locale === "ar" ? `افتح تقدمك${data ? `، المستوى ${progress.level}` : ""}` : `Open your progress${data ? `, level ${progress.level}` : ""}`}
      title={translate("Your Progress")}
      onClick={() => onOpenChange(!open)}
    >
      <span className="student-progress-shield" aria-hidden="true">
        <i />
        <strong>{data ? progress.level : "•"}</strong>
      </span>
    </button>

    {open && <section className="header-popover student-progress-popover" role="dialog" aria-label={translate("Your Progress")}>
      <header className="student-progress-popover-header">
        <div><small>{translate("YOUR PROGRESS")}</small><h2>{translate("Clinical Learner")}</h2></div>
        <button className="student-progress-refresh" type="button" onClick={() => void load()} disabled={loading} aria-label={translate("Refresh progress")}><FiRefreshCw className={loading ? "is-spinning" : ""} /></button>
      </header>

      {loading && !data ? <div className="student-progress-loading" role="status"><span /><span /><span /></div> : error && !data ? <div className="student-progress-error"><p>{error}</p><button type="button" onClick={() => void load()}>{translate("Try again")}</button></div> : data ? <>
        <div className="student-progress-hero">
          <div className="student-progress-shield student-progress-shield-large" aria-hidden="true"><i /><strong>{progress.level}</strong></div>
          <div><small>{translate(`Level ${progress.level}`)}</small><h3>{translate("Clinical Learner")}</h3><span>{translate(`${progress.levelProgress} / 100 XP to next level`)}</span></div>
        </div>
        <div className="student-progress-xp" role="progressbar" aria-label={translate(`${progress.levelProgress} of 100 XP toward the next level`)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.levelProgress}><i style={{ width: `${progress.levelProgress}%` }} /></div>

        <div className="student-progress-stats">
          <article><FiBookOpen /><span><small>{translate("Curriculum")}</small><b>{progress.totalLectures ? `${progress.overallProgress}%` : "—"}</b><em>{translate(progress.totalLectures ? `${progress.completedLectures} of ${progress.totalLectures} lectures` : "Open a bundle lecture to begin")}</em></span></article>
          <article><FiBarChart2 /><span><small>{translate("Accuracy")}</small><b>{progress.accuracy}%</b><em>{translate(`${numeric(data.questions.attempts)} questions answered`)}</em></span></article>
          <article><FiActivity /><span><small>{translate("Flashcards")}</small><b>{progress.mastered}</b><em>{translate("mastered")}</em></span></article>
        </div>

        <footer><Link href="/analytics" onClick={() => onOpenChange(false)}>{translate("Open full analytics")}</Link></footer>
      </> : null}
    </section>}
  </div>;
}
