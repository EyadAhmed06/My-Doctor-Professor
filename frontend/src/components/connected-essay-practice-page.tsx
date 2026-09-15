"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiBookOpen, FiCheck, FiChevronDown, FiEdit3, FiPlayCircle } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell, Progress } from "./product-shell";
import "./essay-practice.css";

type Bundle = { id: string; title: string; read_only?: boolean };
type Lecture = { id: string; title: string; lectureNumber: number; question_count: number; mcq_count: number };
type Week = { id: string; weekNumber: number; title: string | null; lectures: Lecture[] };
type Course = { id: string; courseCode: string; courseName: string; weeks: Week[] };
type Content = { bundle: Bundle; courses: Course[] };
type Generated = { test: { id: string }; attempt: { id: string }; question_count: number };

const REQUIRED = 10;
const count = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; };
const essayCount = (lecture: Lecture) => Math.max(0, count(lecture.question_count) - count(lecture.mcq_count));

export function ConnectedEssayPracticePage() {
  const { request } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const requestedBundle = params.get("bundle");
  const requestedCourse = params.get("course");
  const requestedLecture = params.get("lecture");
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [bundleId, setBundleId] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [openWeeks, setOpenWeeks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void request<Bundle[]>("/bundles/mine").then((items) => {
      if (!active) return;
      setBundles(items);
      setBundleId(items.find((item) => item.id === requestedBundle)?.id || items[0]?.id || "");
      if (!items.length) setLoading(false);
    }).catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : "Unable to load bundles."); setLoading(false); } });
    return () => { active = false; };
  }, [request, requestedBundle]);

  useEffect(() => {
    if (!bundleId) return;
    let active = true; setLoading(true);
    void request<Content>(`/bundles/${bundleId}/content`).then((content) => {
      if (!active) return;
      setCourses(content.courses);
      const target = content.courses.find((item) => item.id === requestedCourse) || content.courses[0];
      setCourseId(target?.id || "");
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load bundle curriculum."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bundleId, request, requestedCourse]);

  const course = courses.find((item) => item.id === courseId);
  const lectures = useMemo(() => course?.weeks.flatMap((week) => week.lectures.map((lecture) => ({ week, lecture }))) || [], [course]);
  const pool = lectures.filter(({ lecture }) => selected.includes(lecture.id)).reduce((sum, item) => sum + essayCount(item.lecture), 0);
  const totalPool = lectures.reduce((sum, item) => sum + essayCount(item.lecture), 0);
  const ready = pool >= REQUIRED && !bundles.find((item) => item.id === bundleId)?.read_only;

  useEffect(() => {
    if (!course) return;
    const all = course.weeks.flatMap((week) => week.lectures);
    const requested = requestedLecture && all.some((lecture) => lecture.id === requestedLecture) ? [requestedLecture] : [];
    if (requested.length) setSelected(requested);
    else {
      const next: string[] = []; let running = 0;
      for (const lecture of all) { const n = essayCount(lecture); if (!n) continue; next.push(lecture.id); running += n; if (running >= REQUIRED) break; }
      setSelected(next);
    }
    const firstWeek = course.weeks.find((week) => week.lectures.some((lecture) => requested.includes(lecture.id))) || course.weeks[0];
    setOpenWeeks(firstWeek ? [firstWeek.id] : []);
  }, [course, requestedLecture]);

  async function start() {
    if (!ready || starting) return;
    setStarting(true); setError(null);
    try {
      const generated = await request<Generated>("/essay-practice/generate", { method: "POST", body: { bundle_id: bundleId, lecture_ids: selected } });
      router.push(`/essay-practice/session?attempt=${encodeURIComponent(generated.attempt.id)}&test=${encodeURIComponent(generated.test.id)}&bundle=${encodeURIComponent(bundleId)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to build essay quiz."); setStarting(false); }
  }

  return <ProductShell search="Search essay lectures">
    <main className="pp-page essay-practice-page">
      <header className="essay-practice-heading"><div><span className="page-eyebrow">CASE-BASED ESSAY PRACTICE</span><h1>{course?.courseName || "Essay Questions"}</h1><p>Select one or more lectures. Each practice quiz contains exactly 10 essay questions sampled only from those lectures.</p></div>
        <div className="essay-practice-selectors"><label>Bundle<select value={bundleId} onChange={(e) => setBundleId(e.target.value)}>{bundles.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></label><label>Course<select value={courseId} onChange={(e) => setCourseId(e.target.value)}>{courses.map((c) => <option key={c.id} value={c.id}>{c.courseCode} · {c.courseName}</option>)}</select></label></div></header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <Panel><p>Loading essay question pool…</p></Panel> : !course ? <Panel title="No course available"><p>This bundle has no visible course.</p></Panel> :
        <div className="essay-practice-layout">
          <aside className="essay-lecture-picker"><h2>Weeks & lectures</h2>{course.weeks.map((week) => { const open = openWeeks.includes(week.id); return <section key={week.id}><button type="button" className="essay-week-toggle" onClick={() => setOpenWeeks((value) => value.includes(week.id) ? value.filter((id) => id !== week.id) : [...value, week.id])}><span><b>Week {week.weekNumber}</b><small>{week.title || "Untitled week"}</small></span><FiChevronDown className={open ? "open" : ""}/></button>{open && <div>{week.lectures.map((lecture) => { const checked = selected.includes(lecture.id); const eligible = essayCount(lecture); return <button type="button" key={lecture.id} className={`essay-lecture ${checked ? "selected" : ""}`} disabled={!eligible} onClick={() => setSelected((value) => checked ? value.filter((id) => id !== lecture.id) : [...value, lecture.id])}><span className="essay-checkbox">{checked ? <FiCheck/> : ""}</span><span><b>{lecture.title}</b><small>{eligible} essay questions</small></span></button>; })}</div>}</section>; })}</aside>
          <section className="essay-practice-main"><Panel title="Your 10-question essay quiz"><div className="essay-practice-stats"><article><FiEdit3/><b>10</b><span>Questions</span></article><article><FiBookOpen/><b>{selected.length}</b><span>Lectures</span></article><article><b>{pool}</b><span>Eligible pool</span></article></div><Progress value={Math.min(100, Math.round(pool / REQUIRED * 100))}/><div className={`essay-launch ${ready ? "ready" : "blocked"}`}><div><small>{ready ? "READY" : "QUESTION POOL"}</small><h2>{ready ? "Start essay practice" : `Need ${Math.max(0, REQUIRED - pool)} more essay questions`}</h2><p>Write your own answer first. The model answer stays hidden until that response is submitted.</p></div><button className="pp-button" type="button" disabled={!ready || starting} onClick={() => void start()}><FiPlayCircle/>{starting ? "Building quiz…" : "Start 10 essays"}</button></div></Panel></section>
          <aside><Panel title="Selection"><p><strong>{pool}</strong> eligible essay questions from the selected lectures.</p><p>{totalPool} essay questions are currently available in this course.</p><p>Questions are reused from the canonical question bank; the quiz does not duplicate records.</p></Panel></aside>
        </div>}
    </main>
  </ProductShell>;
}
