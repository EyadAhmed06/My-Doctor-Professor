"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiActivity, FiArrowRight, FiBookmark, FiCheckCircle, FiClock, FiLayers } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { ErrorState, PageSkeleton } from "./async-state";
import { Panel, ProductShell, Progress } from "./product-shell";
import "./product-pages.css";

type Analytics = {
  summary: { questions_answered: number; accuracy: number; bookmarked: number; calibrated_confidence: number; flashcards_mastered: number; flashcards_due: number };
  accuracy_over_time: { date: string; answered: number; accuracy: number }[];
  topic_mastery: { id: string; name: string; course: string; mastery: number; confidence: number | null; questions_attempted: number }[];
  study_activity: { date: string; completed: number; skipped: number; planned: number }[];
  readiness: { score: number; band: string; components: { accuracy: number; curriculum: number; flashcards: number; consistency: number } };
};

type Recommendation = { id: string; priority: "HIGH" | "MEDIUM" | "LOW"; title: string; reason: string; action: string; href: string; metric: string };
type Range = "7D" | "30D" | "SEMESTER" | "CUSTOM";

function buildRecommendations(data: Analytics): Recommendation[] {
  const result: Recommendation[] = [];
  const weakest = Object.entries(data.readiness.components).sort((a, b) => a[1] - b[1])[0];
  const overallAccuracy = data.readiness.components.accuracy;
  if (data.summary.flashcards_due > 0) result.push({ id: "due-cards", priority: data.summary.flashcards_due >= 20 ? "HIGH" : "MEDIUM", title: "Clear the due flashcard queue", reason: `${data.summary.flashcards_due} card${data.summary.flashcards_due === 1 ? " is" : "s are"} due. Delaying them weakens spaced-repetition timing.`, action: "Review flashcards", href: "/flashcards", metric: `${data.summary.flashcards_due} due` });
  if (data.summary.questions_answered === 0) result.push({ id: "start-questions", priority: "HIGH", title: "Create an accuracy baseline", reason: "Readiness cannot distinguish strengths from weaknesses until you complete and submit questions.", action: "Open Question Bank", href: "/bundles?tab=questions", metric: "No validated attempts yet" });
  else if (overallAccuracy < 70) result.push({ id: "accuracy", priority: overallAccuracy < 50 ? "HIGH" : "MEDIUM", title: "Prioritize question practice", reason: `Overall validated accuracy is ${Math.round(overallAccuracy)}%. More targeted attempts will improve the highest-weight readiness component.`, action: "Practice questions", href: "/bundles?tab=questions", metric: `${Math.round(overallAccuracy)}% overall accuracy` });
  const weakestTopic = [...data.topic_mastery].filter((topic) => topic.questions_attempted > 0).sort((a, b) => a.mastery - b.mastery)[0];
  if (weakestTopic && weakestTopic.mastery < 70) result.push({ id: `topic-${weakestTopic.id}`, priority: weakestTopic.mastery < 45 ? "HIGH" : "MEDIUM", title: `Revisit ${weakestTopic.name}`, reason: `This is your lowest measured topic in ${weakestTopic.course}, based on ${weakestTopic.questions_attempted} validated attempts.`, action: "Open study guides", href: "/guidelines", metric: `${Math.round(weakestTopic.mastery)}% mastery` });
  if (weakest) {
    const [name, value] = weakest;
    const map: Record<string, { title: string; reason: string; action: string; href: string }> = {
      curriculum: { title: "Advance lecture completion", reason: "Curriculum completion is the weakest readiness input.", action: "Continue a lecture", href: "/guidelines" },
      consistency: { title: "Repair schedule consistency", reason: "Completed versus skipped study sessions is limiting readiness.", action: "Open Study Plan", href: "/study-plan" },
      flashcards: { title: "Build retention coverage", reason: "Flashcard mastery is the weakest readiness input.", action: "Review flashcards", href: "/flashcards" },
      accuracy: { title: "Strengthen answer accuracy", reason: "Validated question accuracy is the weakest and most heavily weighted readiness input.", action: "Practice questions", href: "/bundles?tab=questions" },
    };
    const entry = map[name];
    if (entry && !result.some((item) => item.href === entry.href)) result.push({ id: `weakest-${name}`, priority: value < 40 ? "HIGH" : "MEDIUM", ...entry, metric: `${Math.round(value)}% ${name}` });
  }
  if (data.readiness.score >= 80 && result.length < 3) result.push({ id: "maintain", priority: "LOW", title: "Maintain readiness without overloading", reason: "Your readiness score is already strong. Keep the due queue clear and follow the generated plan rather than adding random work.", action: "Review today’s plan", href: "/study-plan", metric: `${data.readiness.score}/100 ready` });
  const priorityOrder: Record<Recommendation["priority"], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return result.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, 4);
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function subtractDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() - days);
  return result;
}

export function ConnectedAnalyticsPage() {
  const { user, request } = useAuth();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("30D");
  const [customFrom, setCustomFrom] = useState(() => dateKey(subtractDays(new Date(), 29)));
  const [customTo, setCustomTo] = useState(() => dateKey(new Date()));

  useEffect(() => {
    if (user?.role !== "STUDENT") {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void request<Analytics>("/analytics/student")
      .then((value) => { if (active) setData(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load analytics."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, request]);

  const recommendations = useMemo(() => data ? buildRecommendations(data) : [], [data]);
  const dateWindow = useMemo(() => {
    const end = range === "CUSTOM" ? new Date(`${customTo}T23:59:59`) : new Date();
    const days = range === "7D" ? 7 : range === "30D" ? 30 : range === "SEMESTER" ? 120 : Math.max(1, Math.ceil((end.getTime() - new Date(`${customFrom}T00:00:00`).getTime()) / 86400000) + 1);
    const start = range === "CUSTOM" ? new Date(`${customFrom}T00:00:00`) : subtractDays(end, days - 1);
    return { start, end, days };
  }, [customFrom, customTo, range]);

  const filteredActivity = useMemo(() => data?.study_activity.filter((point) => {
    const date = new Date(point.date);
    return date >= dateWindow.start && date <= dateWindow.end;
  }) || [], [data, dateWindow]);

  return <ProductShell><main className="pp-page analytics-page analytics-exploration-page">
    <header className="workspace-heading"><div><span className="page-eyebrow">LEARNING INTELLIGENCE</span><h1>Analytics Dashboard</h1><p>Review your current learning state, readiness, topic mastery, and study consistency.</p></div></header>

    {user?.role !== "STUDENT" ? <Panel title="Student analytics"><p>This dashboard is calculated for student accounts.</p></Panel> : loading ? <PageSkeleton variant="chart" label="Calculating analytics" /> : error ? <ErrorState description={error} onRetry={() => globalThis.location.reload()} /> : data ? <>
      <section className="analytics-range-bar" aria-label="Analytics date range">
        <div role="group" aria-label="Preset ranges">{(["7D", "30D", "SEMESTER", "CUSTOM"] as Range[]).map((value) => <button type="button" className={range === value ? "active" : ""} key={value} onClick={() => setRange(value)}>{value === "7D" ? "7 days" : value === "30D" ? "30 days" : value === "SEMESTER" ? "Semester" : "Custom"}</button>)}</div>
        {range === "CUSTOM" && <div className="analytics-custom-range"><label>From<input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} /></label><label>To<input type="date" value={customTo} min={customFrom} max={dateKey(new Date())} onChange={(event) => setCustomTo(event.target.value)} /></label></div>}
        <small>{dateWindow.start.toLocaleDateString()} – {dateWindow.end.toLocaleDateString()}}. This selector controls study consistency; overview metrics and readiness show your current overall state.</small>
      </section>

      <section className="analytics-metrics">
        <Metric href="/bundles?tab=questions" icon={<FiActivity />} label="Validated answers · overall" value={data.summary.questions_answered} explanation="Submitted or expired answers with a known correctness result across your account." />
        <Metric href="/bundles?tab=questions" icon={<FiCheckCircle />} label="Accuracy · overall" value={data.summary.accuracy} suffix="%" explanation="Correct validated attempts divided by all validated answered questions." />
        <Metric href="/notebook" icon={<FiBookmark />} label="Saved questions · current" value={data.summary.bookmarked} explanation="Questions currently bookmarked for later review." />
        <Metric href="/flashcards" icon={<FiLayers />} label="Flashcards mastered · current" value={data.summary.flashcards_mastered} explanation="Reviewed cards currently classified as mastered by the spaced-repetition scheduler." />
        <Metric href="/flashcards" icon={<FiClock />} label="Flashcards due · current" value={data.summary.flashcards_due} explanation="Reviewed cards whose scheduled next-review time has arrived." />
      </section>

      <Panel title="Recommended next actions" className="analytics-recommendations"><p className="recommendation-intro">These actions are derived from current readiness components, measured topic mastery, and due work—not from the selected chart window alone.</p><div>{recommendations.map((item) => <article data-priority={item.priority} key={item.id}><span>{item.priority}</span><div><small>{item.metric}</small><h3>{item.title}</h3><p>{item.reason}</p></div><Link className="pp-button secondary" href={item.href}>{item.action}<FiArrowRight /></Link></article>)}</div></Panel>

      <div className="analytics-grid">
        <Panel title="Current exam readiness"><div className="readiness-score"><b><AnimatedNumber value={data.readiness.score} /></b><span>/100</span><small>{data.readiness.band.replaceAll("_", " ")}</small></div>{Object.entries(data.readiness.components).map(([label, value]) => <div className="readiness-component" key={label}><span>{label}</span><b><AnimatedNumber value={value} />%</b><Progress value={value} /></div>)}<p>Readiness = 40% overall validated accuracy + 25% current curriculum completion + 20% current flashcard mastery + 15% completed-vs-skipped schedule consistency. It is intentionally not changed by the date selector.</p></Panel>

        <Panel title="Topic mastery" className="analytics-topics"><p>Mastery = 70% observed accuracy + 30% active-question coverage. “Evidence” shows sample strength (20 × √attempts, capped at 100%), not subjective confidence.</p>{data.topic_mastery.length ? data.topic_mastery.map((topic) => <Link href="/bundles?tab=questions" key={topic.id}><span><b>{topic.name}</b><small>{topic.course} · {topic.questions_attempted} validated attempts{topic.confidence === null ? "" : ` · ${Math.round(topic.confidence)}% evidence`}</small></span><strong><AnimatedNumber value={topic.mastery} />%</strong><Progress value={topic.mastery} /></Link>) : <p>Practice questions to build your topic map.</p>}</Panel>

        <Panel title="Study consistency"><div className="activity-bars">{filteredActivity.length ? filteredActivity.map((day) => {
          const percentage = Math.max(5, 100 * day.completed / Math.max(1, day.planned));
          const label = new Date(day.date).toLocaleDateString(undefined, { weekday: "short" });
          const fullDate = new Date(day.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const tooltip = `${fullDate}: ${day.completed} completed, ${day.skipped} skipped, ${day.planned} planned`;
          return <ChartBar key={day.date} height={percentage} label={label} tooltip={tooltip} />;
        }) : <p>No scheduled activity in this range.</p>}</div><p>Completed sessions come from your generated study-plan records—not estimated behavior.</p></Panel>
      </div>
    </> : null}
  </main></ProductShell>;
}

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const frame = useRef<number | null>(null);
  const previous = useRef(0);
  useEffect(() => {
    const startValue = previous.current;
    previous.current = value;
    if (frame.current) cancelAnimationFrame(frame.current);
    if (globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const started = performance.now();
    const duration = 560;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(startValue + (value - startValue) * eased);
      if (progress < 1) frame.current = requestAnimationFrame(animate);
    };
    frame.current = requestAnimationFrame(animate);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [value]);
  return <>{Math.round(display)}{suffix}</>;
}

function ChartBar({ height, label, tooltip }: { height: number; label: string; tooltip: string }) {
  return <span className="chart-bar-point" data-tooltip={tooltip} aria-label={tooltip} role="img" tabIndex={0}><i style={{ height: `${Math.min(100, Math.max(5, height))}%` }} /><small>{label}</small></span>;
}

function Metric({ icon, label, value, suffix = "", href, explanation }: { icon: React.ReactNode; label: string; value: number; suffix?: string; href: string; explanation: string }) {
  return <Panel className="analytics-metric analytics-metric-explained"><Link href={href}><span>{icon}</span><div><small>{label}</small><b><AnimatedNumber value={value} suffix={suffix} /></b><em>{explanation}</em></div></Link></Panel>;
}