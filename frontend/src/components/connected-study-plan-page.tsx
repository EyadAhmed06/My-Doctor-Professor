"use client";

import { FormEvent, useEffect, useState } from "react";
import { FiCalendar, FiSave, FiTarget } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import "./product-pages.css";

type Plan = {
  studentId: string;
  targetExam: string | null;
  examDate: string | null;
  dailyQuestionTarget: number;
  weeklyHoursTarget: number;
  dailyFlashcardTarget: number;
  preferences: Record<string, unknown>;
};

export function ConnectedStudyPlanPage() {
  const { user, request } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "STUDENT") return;
    let active = true;
    void request<Plan>("/study-plan")
      .then((value) => { if (active) setPlan(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load study plan."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, request]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!plan) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const updated = await request<Plan>("/study-plan", { method: "PUT", body: {
        target_exam: plan.targetExam, exam_date: plan.examDate || undefined,
        daily_question_target: plan.dailyQuestionTarget, weekly_hours_target: plan.weeklyHoursTarget,
        daily_flashcard_target: plan.dailyFlashcardTarget, preferences: plan.preferences,
      }});
      setPlan(updated); setMessage("Study plan saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save study plan.");
    } finally { setSaving(false); }
  }

  return <ProductShell><main className="pp-page">
    <div className="pp-title"><div><h1>Study Plan</h1><p>Your persistent targets. The server creates one plan per student.</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success">{message}</p>}
    {user?.role !== "STUDENT" ? <Panel title="Student account required"><p>Study plans belong to student accounts.</p></Panel>
      : loading ? <div className="product-auth-loading">Loading study plan…</div>
      : plan ? <form onSubmit={save} className="settings-grid">
        <Panel title="Exam target"><label>Target exam<input value={plan.targetExam || ""} onChange={(event) => setPlan({...plan, targetExam:event.target.value})} placeholder="e.g. End-of-course final" /></label><label>Exam date<input type="date" value={plan.examDate || ""} onChange={(event) => setPlan({...plan, examDate:event.target.value})} /></label></Panel>
        <Panel title="Daily targets"><label>Questions<input type="number" min={1} max={500} value={plan.dailyQuestionTarget} onChange={(event) => setPlan({...plan, dailyQuestionTarget:Number(event.target.value)})} /></label><label>Flashcards<input type="number" min={1} max={1000} value={plan.dailyFlashcardTarget} onChange={(event) => setPlan({...plan, dailyFlashcardTarget:Number(event.target.value)})} /></label></Panel>
        <Panel title="Weekly capacity"><label>Study hours<input type="number" min={1} max={168} value={plan.weeklyHoursTarget} onChange={(event) => setPlan({...plan, weeklyHoursTarget:Number(event.target.value)})} /></label><p><FiTarget /> {plan.dailyQuestionTarget * 7} questions/week</p><p><FiCalendar /> {plan.dailyFlashcardTarget * 7} flashcards/week</p></Panel>
        <Panel title="Save"><button className="pp-button" disabled={saving}><FiSave /> {saving ? "Saving…" : "Save plan"}</button></Panel>
      </form> : null}
  </main></ProductShell>;
}
