"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FiBookOpen,
  FiCalendar,
  FiCheck,
  FiClock,
  FiEdit3,
  FiLock,
  FiMove,
  FiRefreshCw,
  FiSave,
  FiTarget,
  FiUnlock,
  FiX,
} from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { PageSkeleton } from "./async-state";
import { Panel, ProductShell, Progress } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";

type PlanPreferences = {
  available_days?: number[];
  rest_day?: number;
  questions_minutes?: number;
  flashcards_minutes?: number;
};

type Plan = {
  studentId: string;
  dailyQuestionTarget: number;
  weeklyHoursTarget: number;
  dailyFlashcardTarget: number;
  preferences: PlanPreferences;
  generatedAt: string | null;
  scheduleVersion: number;
};

type ItemMetadata = {
  title?: string;
  rationale?: string;
  reason?: string;
  source?: string;
  locked?: boolean;
};

type Item = {
  id: string;
  scheduledDate: string;
  itemType: "QUESTIONS" | "FLASHCARDS" | "LECTURE" | "REVIEW" | "REST";
  status: "PLANNED" | "COMPLETED" | "SKIPPED";
  targetCount: number | null;
  durationMinutes: number;
  metadata: ItemMetadata;
  lecture?: { title: string } | null;
};

type Calendar = { from: string; to: string; data: Item[] };
type Readiness = { score: number; band: string; components: Record<string, number> };
type PreviewItem = Omit<Item, "id" | "lecture"> & { id?: string; lectureId?: string | null };
type Preview = {
  from: string;
  to: string;
  schedule_version: number;
  generated_count: number;
  replacing_planned: number;
  preserved_locked: number;
  totals: Record<string, number>;
  sample: PreviewItem[];
};

type GenerationState = "IDLE" | "PREVIEWING" | "READY" | "BUILDING" | "COMPLETE";

function titleFor(item: Pick<Item, "itemType" | "metadata" | "lecture">) {
  return item.lecture?.title || item.metadata.title || item.itemType.replaceAll("_", " ");
}

function rationaleFor(item: Pick<Item, "itemType" | "metadata">) {
  if (item.metadata.rationale) return item.metadata.rationale;
  if (item.metadata.reason) return item.metadata.reason;
  if (item.itemType === "QUESTIONS") return "Supports the daily question target and accuracy component of readiness.";
  if (item.itemType === "FLASHCARDS" || item.itemType === "REVIEW") return "Protects spaced-repetition timing and retention coverage.";
  if (item.itemType === "LECTURE") return "Advances the next published lecture from an active learning bundle.";
  return "Protected recovery time prevents the schedule from becoming unsustainably dense.";
}

export function AdvancedStudyPlanPage({ calendarOnly = false }: { calendarOnly?: boolean }) {
  const { user, request } = useAuth();
  const { notify, celebrate } = useUx();
  const [today] = useState(() => Date.now());
  const [plan, setPlan] = useState<Plan | null>(null);
  const [calendar, setCalendar] = useState<Item[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>("IDLE");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (user?.role !== "STUDENT") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextPlan, nextCalendar, nextReadiness] = await Promise.all([
        request<Plan>("/study-plan"),
        request<Calendar>("/study-plan/calendar"),
        request<Readiness>("/study-plan/readiness"),
      ]);
      setPlan(nextPlan);
      setCalendar(nextCalendar.data);
      setReadiness(nextReadiness);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load study plan.");
    } finally {
      setLoading(false);
    }
  }, [request, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  function payload(value: Plan) {
    return {
      daily_question_target: value.dailyQuestionTarget,
      weekly_hours_target: value.weeklyHoursTarget,
      daily_flashcard_target: value.dailyFlashcardTarget,
      preferences: value.preferences,
    };
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!plan) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await request<Plan>("/study-plan", { method: "PUT", body: payload(plan) });
      setPlan(saved);
      setPreview(null);
      setGenerationState("IDLE");
      setMessage("Plan settings saved. Preview the next calendar before replacing future sessions.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save plan.");
    } finally {
      setBusy(false);
    }
  }

  async function previewGeneration() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setGenerationState("PREVIEWING");
    try {
      const result = await request<Preview>("/study-plan/preview", { method: "POST" });
      setPreview(result);
      setGenerationState("READY");
    } catch (cause) {
      setGenerationState("IDLE");
      setError(cause instanceof Error ? cause.message : "Unable to preview calendar.");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setGenerationState("BUILDING");
    try {
      const result = await request<Calendar>("/study-plan/generate", { method: "POST" });
      setCalendar(result.data);
      setReadiness(await request<Readiness>("/study-plan/readiness"));
      const refreshedPlan = await request<Plan>("/study-plan");
      setPlan(refreshedPlan);
      setGenerationState("COMPLETE");
      setMessage(`Calendar version ${preview.schedule_version} built. Locked sessions were preserved.`);
      celebrate({
        id: `study-plan-version-${preview.schedule_version}`,
        title: "Study calendar built",
        description: `${preview.generated_count} sessions were balanced around your exam and saved targets.`,
        points: 25,
      });
      setPreview(null);
    } catch (cause) {
      setGenerationState("READY");
      setError(cause instanceof Error ? cause.message : "Unable to generate calendar.");
    } finally {
      setBusy(false);
    }
  }

  async function updateItem(item: Item, body: Record<string, unknown>, optimistic: Partial<Item>) {
    const previous = item;
    setMovingIds((current) => new Set(current).add(item.id));
    setCalendar((current) => current.map((value) => value.id === item.id ? { ...value, ...optimistic } : value));
    try {
      const updated = await request<Item>(`/study-plan/items/${item.id}`, { method: "PUT", body });
      setCalendar((current) => current.map((value) => value.id === item.id ? updated : value));
      return updated;
    } catch (cause) {
      setCalendar((current) => current.map((value) => value.id === item.id ? previous : value));
      throw cause;
    } finally {
      setMovingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function complete(item: Item) {
    try {
      const nextStatus = item.status === "COMPLETED" ? "PLANNED" : "COMPLETED";
      await updateItem(item, { status: nextStatus }, { status: nextStatus });
      setReadiness(await request<Readiness>("/study-plan/readiness"));
      notify({ title: nextStatus === "COMPLETED" ? "Session completed" : "Session reopened", description: titleFor(item), tone: "success" });
    } catch (cause) {
      notify({ title: "Could not update session", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  async function reschedule(item: Item, date: string) {
    if (item.status === "COMPLETED" || item.itemType === "REST" || date === item.scheduledDate) return;
    try {
      await updateItem(item, { scheduled_date: date, status: "PLANNED" }, { scheduledDate: date, status: "PLANNED" });
      notify({ title: "Session rescheduled", description: `Moved to ${new Date(`${date}T00:00:00`).toLocaleDateString()}.`, tone: "success", duration: 2500 });
    } catch (cause) {
      notify({ title: "Could not reschedule session", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  async function resize(item: Item, minutes: number) {
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 1440 || minutes === item.durationMinutes) return;
    try {
      await updateItem(item, { duration_minutes: minutes }, { durationMinutes: minutes });
      notify({ title: "Session duration updated", description: `${titleFor(item)} is now ${minutes} minutes.`, tone: "success", duration: 2200 });
    } catch (cause) {
      notify({ title: "Could not resize session", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  async function toggleLock(item: Item) {
    const locked = !item.metadata.locked;
    try {
      await updateItem(item, { is_locked: locked }, { metadata: { ...item.metadata, locked } });
      notify({
        title: locked ? "Session locked" : "Session unlocked",
        description: locked ? "Regeneration will preserve this planned session." : "Regeneration may now replace this session.",
        tone: "info",
      });
    } catch (cause) {
      notify({ title: "Could not change session lock", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  function dropOn(date: string) {
    if (!draggedId) return;
    const item = calendar.find((value) => value.id === draggedId);
    setDraggedId(null);
    if (item) void reschedule(item, date);
  }

  const grouped = useMemo(() => calendar.reduce<Record<string, Item[]>>((map, item) => {
    (map[item.scheduledDate] ??= []).push(item);
    return map;
  }, {}), [calendar]);
  const days = Object.entries(grouped).slice(0, 21);
  const moveDates = Object.keys(grouped).filter((date) => new Date(`${date}T23:59:59`).getTime() >= today);

  function updateActive(next: Plan) {
    setPlan(next);
  }

  function setNumericPreference(key: "questions_minutes" | "flashcards_minutes", value: number) {
    if (plan) updateActive({ ...plan, preferences: { ...plan.preferences, [key]: value } });
  }

  const selectedItems = selectedDay ? grouped[selectedDay] || [] : [];

  return <ProductShell><main className="pp-page study-plan-restored advanced-study-plan-page">
    <header className="workspace-heading">
      <div><span className="page-eyebrow">ADAPTIVE LEARNING SCHEDULE</span><h1>{calendarOnly ? "Study Calendar" : "Study Plan"}</h1><p>{calendarOnly ? "Review, complete, protect, resize, and reschedule your generated sessions." : "Set your learning targets and weekly capacity for a rolling 30-day plan."}</p></div>
      <div className="plan-header-actions">
        {calendarOnly ? <>
          <Link className="pp-button secondary" href="/study-plan">Back to study plan</Link>
          {preview && generationState === "READY" ? <button className="pp-button" type="button" disabled={busy} onClick={() => void generate()}><FiCheck /> Accept and build</button> : <button className="pp-button" disabled={busy} onClick={() => void previewGeneration()}><FiRefreshCw /> {generationState === "PREVIEWING" ? "Analyzing…" : "Rebuild calendar"}</button>}
        </> : <>
          <Link className="pp-button" href="/study-plan/calendar"><FiCalendar /> Show calendar</Link>
        </>}
      </div>
    </header>

    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-success" role="status">{message}</p>}

    {calendarOnly && <GenerationStepper state={generationState} />}


    {user?.role !== "STUDENT" ? <Panel title="Student account required"><p>Study plans belong to student accounts.</p></Panel> : loading ? <PageSkeleton variant="calendar" label="Loading study plan" /> : !plan ? <Panel title="Study plan unavailable"><p>The plan could not be initialized.</p></Panel> : <>
      {!calendarOnly && <section className="plan-metrics plan-metrics-compact">
        <Metric icon={<FiTarget />} label="Daily target" value={`${plan.dailyQuestionTarget} Qs`} detail={`${plan.dailyQuestionTarget * 7} maximum per week`} />
        <Metric icon={<FiClock />} label="Planning target" value={`${plan.weeklyHoursTarget} hrs`} detail="stored weekly capacity" />
        <Metric icon={<FiBookOpen />} label="Review target" value={`${plan.dailyFlashcardTarget}`} detail="flashcards per study day" />
      </section>}

      <div className={`plan-dashboard ${calendarOnly ? "calendar-only" : "settings-only"}`}>
        {calendarOnly && <section><Panel title="Generated calendar" action={<small>{plan?.generatedAt ? `Version ${plan.scheduleVersion} · ${new Date(plan.generatedAt).toLocaleString()}` : "Not generated yet"}</small>}>
          {days.length ? <div className="study-calendar phase3-calendar">{days.map(([date, items]) => <article className={`${draggedId ? "drop-ready" : ""} ${selectedDay === date ? "selected-day" : ""}`} key={date} onDragOver={(event) => { if (draggedId) event.preventDefault(); }} onDrop={() => dropOn(date)}>
            <header><button type="button" onClick={() => setSelectedDay(date)}><b>{new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</b><small>{items.reduce((sum, item) => sum + item.durationMinutes, 0)} min · {items.length} sessions</small></button></header>
            {items.map((item) => <div className={`study-plan-session advanced-session ${item.status === "COMPLETED" ? "completed" : ""} ${movingIds.has(item.id) ? "moving" : ""} ${item.metadata.locked ? "locked" : ""}`} draggable={item.status !== "COMPLETED" && item.itemType !== "REST" && !item.metadata.locked} onDragStart={() => setDraggedId(item.id)} onDragEnd={() => setDraggedId(null)} key={item.id}>
              <button type="button" className="session-main" onClick={() => void complete(item)} disabled={movingIds.has(item.id) || item.itemType === "REST"}><i><FiCheck /></i><span><b>{titleFor(item)}</b><small>{item.targetCount ? `${item.targetCount} items · ` : ""}{item.durationMinutes} minutes</small></span></button>
              {item.status !== "COMPLETED" && item.itemType !== "REST" && <div className="session-controls">
                <button type="button" className={item.metadata.locked ? "active" : ""} title={item.metadata.locked ? "Unlock session" : "Lock session"} onClick={() => void toggleLock(item)}>{item.metadata.locked ? <FiLock /> : <FiUnlock />}</button>
                <label title="Resize session"><FiEdit3 /><input aria-label={`Duration for ${titleFor(item)}`} type="number" min="5" max="1440" step="5" defaultValue={item.durationMinutes} onBlur={(event) => void resize(item, Number(event.target.value))} /></label>
                <label title="Move session"><FiMove /><select aria-label={`Move ${titleFor(item)}`} value={item.scheduledDate} disabled={movingIds.has(item.id) || item.metadata.locked} onChange={(event) => void reschedule(item, event.target.value)}>{moveDates.map((value) => <option value={value} key={value}>{new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</option>)}</select></label>
              </div>}
              <details className="session-rationale"><summary>Why this session?</summary><p>{rationaleFor(item)}</p></details>
            </div>)}
          </article>)}</div> : <p>No monthly schedule exists yet. Save your targets, then build the next 30 days.</p>}
        </Panel></section>}

        {!calendarOnly && <aside>
          <Panel title="Readiness projection">{readiness ? <><div className="readiness-score"><b>{readiness.score}</b><span>/100</span><small>{readiness.band.replaceAll("_", " ")}</small></div>{Object.entries(readiness.components).map(([label, value]) => <div className="readiness-component" key={label}><span>{label}</span><b>{Math.round(value)}%</b><Progress value={value} /></div>)}</> : <p>Readiness is calculated after activity exists.</p>}</Panel>

          <Panel title="Plan settings"><form className="plan-target-form" onSubmit={save}>
            <label>Daily questions<input type="number" min="1" max="500" value={plan.dailyQuestionTarget} onChange={(event) => updateActive({ ...plan, dailyQuestionTarget: Number(event.target.value) })} /></label>
            <label>Question session minutes<input type="number" min="5" max="1440" value={Number(plan.preferences.questions_minutes ?? Math.max(30, Math.ceil(plan.dailyQuestionTarget * 1.5)))} onChange={(event) => setNumericPreference("questions_minutes", Number(event.target.value))} /></label>
            <label>Daily flashcards<input type="number" min="1" max="1000" value={plan.dailyFlashcardTarget} onChange={(event) => updateActive({ ...plan, dailyFlashcardTarget: Number(event.target.value) })} /></label>
            <label>Flashcard session minutes<input type="number" min="5" max="1440" value={Number(plan.preferences.flashcards_minutes ?? Math.max(15, Math.ceil(plan.dailyFlashcardTarget * 0.5)))} onChange={(event) => setNumericPreference("flashcards_minutes", Number(event.target.value))} /></label>
            <label>Weekly hours<input type="number" min="1" max="168" value={plan.weeklyHoursTarget} onChange={(event) => updateActive({ ...plan, weeklyHoursTarget: Number(event.target.value) })} /></label>
            <small>Locked sessions survive regeneration. Existing completed sessions are never replaced.</small>
            <button className="pp-button" disabled={busy}><FiSave /> Save settings</button>
          </form></Panel>
        </aside>}
      </div>

      {calendarOnly && selectedDay && <button className="day-drawer-backdrop" type="button" aria-label="Close selected day" onClick={() => setSelectedDay(null)} />}
      {calendarOnly && selectedDay && <aside className="day-detail-drawer" role="dialog" aria-modal="true" aria-label={`Sessions for ${selectedDay}`}><header><div><small>SELECTED DAY</small><h2>{new Date(`${selectedDay}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2></div><button type="button" onClick={() => setSelectedDay(null)}><FiX /></button></header><div>{selectedItems.map((item) => <article key={item.id}><span>{item.itemType.replaceAll("_", " ")}</span><h3>{titleFor(item)}</h3><p>{rationaleFor(item)}</p><small>{item.durationMinutes} minutes{item.targetCount ? ` · ${item.targetCount} items` : ""}{item.metadata.locked ? " · Locked" : ""}</small></article>)}</div></aside>}
    </>}
  </main></ProductShell>;
}

function GenerationStepper({ state }: { state: GenerationState }) {
  const order: GenerationState[] = ["PREVIEWING", "READY", "BUILDING", "COMPLETE"];
  const current = state === "IDLE" ? -1 : order.indexOf(state);
  const steps = [
    { label: "Validate", detail: "Monthly capacity" },
    { label: "Prioritize", detail: "Questions, reviews, lectures" },
    { label: "Balance", detail: "Rest days and weekly load" },
    { label: "Build", detail: "Persist accepted calendar" },
  ];
  return <section className={`generation-stepper state-${state.toLowerCase()}`} aria-label="Calendar generation progress">{steps.map((step, index) => {
    const complete = state === "COMPLETE" || (state === "READY" && index < 3) || (state === "BUILDING" && index < 3);
    const active = (state === "PREVIEWING" && index === 0) || (state === "READY" && index === 3) || (state === "BUILDING" && index === 3);
    return <div className={`${complete ? "complete" : ""} ${active ? "active" : ""}`} key={step.label}><i>{complete ? <FiCheck /> : index + 1}</i><span><b>{step.label}</b><small>{step.detail}</small></span>{index < steps.length - 1 && <em />}</div>;
  })}<span className="sr-only">Generation stage {Math.max(0, current + 1)} of 4</span></section>;
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <Panel className="plan-metric"><span>{icon}</span><div><small>{label}</small><b>{value}</b><p>{detail}</p></div></Panel>;
}