"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FiArrowRight,
  FiBookOpen,
  FiCheck,
  FiChevronDown,
  FiFileText,
  FiLayers,
  FiPlayCircle,
  FiRefreshCw,
} from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell, Progress } from "./product-shell";
import "./product-pages.css";
import "./practice-builder.css";

type Bundle = { id: string; title: string; read_only?: boolean };
type Lecture = { id: string; title: string; description: string | null; lectureNumber: number; question_count: number; flashcard_deck_count: number; resource_count: number };
type Week = { id: string; weekNumber: number; title: string | null; description: string | null; lectures: Lecture[] };
type Course = { id: string; courseName: string; courseCode: string; description: string | null; weeks: Week[] };
type Content = { bundle: Bundle; courses: Course[] };
type Generated = { test: { id: string }; attempt: { id: string }; question_count: number };

const PRACTICE_QUESTION_COUNT = 40;

export function ConnectedRoundsPage() {
  const { request } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedBundle = searchParams.get("bundle");
  const requestedCourse = searchParams.get("course");
  const requestedLecture = searchParams.get("lecture");
  const requestedLectures = (searchParams.get("lectures") || "").split(",").filter(Boolean);

  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [bundleId, setBundleId] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [activeLecture, setActiveLecture] = useState<Lecture | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openWeeks, setOpenWeeks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void request<Bundle[]>("/bundles/mine")
      .then((result) => {
        if (!active) return;
        setBundles(result);
        const target = result.find((item) => item.id === requestedBundle) || result[0];
        setBundleId(target?.id || "");
        if (!result.length) setLoading(false);
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Unable to load your bundles.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [request, requestedBundle]);

  useEffect(() => {
    if (!bundleId) return;
    let active = true;
    setLoading(true);
    void request<Content>(`/bundles/${bundleId}/content`)
      .then((result) => {
        if (!active) return;
        setCourses(result.courses);
        const allRequested = [...requestedLectures, ...(requestedLecture ? [requestedLecture] : [])];
        const lectureCourse = allRequested.length
          ? result.courses.find((item) => item.weeks.some((week) => week.lectures.some((lecture) => allRequested.includes(lecture.id))))
          : undefined;
        const target = lectureCourse || result.courses.find((item) => item.id === requestedCourse) || result.courses[0];
        setCourseId(target?.id || "");
        setError(null);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load bundle curriculum.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bundleId, request, requestedCourse, requestedLecture, searchParams]);

  const course = useMemo(() => courses.find((item) => item.id === courseId), [courseId, courses]);
  const weeks = useMemo(() => course?.weeks ?? [], [course]);
  const lectureRows = useMemo(() => weeks.flatMap((week) => week.lectures.map((lecture) => ({ week, lecture }))), [weeks]);
  const totals = useMemo(
    () => lectureRows.reduce((value, row) => ({
      questions: value.questions + row.lecture.question_count,
      decks: value.decks + row.lecture.flashcard_deck_count,
      resources: value.resources + row.lecture.resource_count,
    }), { questions: 0, decks: 0, resources: 0 }),
    [lectureRows],
  );
  const currentBundle = bundles.find((item) => item.id === bundleId);
  const selectedLectures = lectureRows.filter(({ lecture }) => selectedIds.includes(lecture.id));
  const selectedQuestionPool = selectedLectures.reduce((sum, item) => sum + item.lecture.question_count, 0);
  const ready = selectedIds.length > 0 && selectedQuestionPool >= PRACTICE_QUESTION_COUNT && !currentBundle?.read_only;

  useEffect(() => {
    if (!weeks.length) {
      setActiveLecture(null);
      setSelectedIds([]);
      return;
    }
    const allLectures = weeks.flatMap((item) => item.lectures);
    const requested = requestedLectures.filter((id) => allLectures.some((lecture) => lecture.id === id));
    if (!requested.length && requestedLecture && allLectures.some((lecture) => lecture.id === requestedLecture)) requested.push(requestedLecture);
    const initial = requested.length ? requested : allLectures[0] ? [allLectures[0].id] : [];
    setSelectedIds(initial);
    const first = allLectures.find((lecture) => lecture.id === initial[0]) || allLectures[0] || null;
    setActiveLecture(first);
    const firstWeek = first ? weeks.find((item) => item.lectures.some((lecture) => lecture.id === first.id)) : undefined;
    setOpenWeeks(firstWeek ? [firstWeek.id] : []);
  }, [courseId, requestedLecture, searchParams, weeks]);

  function toggleWeek(id: string) {
    setOpenWeeks((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleLecture(lecture: Lecture) {
    setActiveLecture(lecture);
    setSelectedIds((current) => current.includes(lecture.id) ? current.filter((id) => id !== lecture.id) : [...current, lecture.id]);
  }

  function toggleWholeWeek(week: Week) {
    const ids = week.lectures.map((lecture) => lecture.id);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }

  async function startTutor() {
    if (!ready || starting) return;
    setStarting(true);
    setError(null);
    try {
      const generated = await request<Generated>("/tests/practice/generate", {
        method: "POST",
        body: {
          bundle_id: bundleId,
          lecture_ids: selectedIds,
          question_count: PRACTICE_QUESTION_COUNT,
          test_mode: "TUTOR",
        },
      });
      router.push(`/mock-exam/session?attempt=${generated.attempt.id}&test=${generated.test.id}&mode=TUTOR&source=rounds&bundle=${bundleId}&lectures=${selectedIds.join(",")}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to build this 40-question quiz.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <ProductShell search="Search courses, weeks, or lectures">
      <main className="pp-page rounds-reference-page practice-builder-page">
        <header className="rounds-reference-header">
          <div>
            <span className="page-eyebrow">CURRICULUM QUIZ BUILDER</span>
            <h1>{course?.courseName || "Lecture Questions"}</h1>
            <p>Select one or more lectures. The generated practice set is always 40 MCQs in Tutor mode.</p>
          </div>
          <div className="rounds-reference-selectors">
            <label>Bundle<select value={bundleId} onChange={(event) => setBundleId(event.target.value)}>{bundles.map((item) => <option key={item.id} value={item.id}>{item.title}{item.read_only ? " · read-only" : ""}</option>)}</select></label>
            <label>Course<select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{courses.map((item) => <option key={item.id} value={item.id}>{item.courseCode} · {item.courseName}</option>)}</select></label>
          </div>
        </header>

        {error && <p className="form-error" role="alert">{error}</p>}
        {loading ? <div className="product-auth-loading">Loading your question workspace…</div> :
          !bundles.length ? <Panel title="No bundle access"><p>An administrator or instructor must assign a bundle before you can solve its questions.</p></Panel> :
          !course ? <Panel title="No course available"><p>The selected bundle does not contain a visible course.</p></Panel> :
          <div className="rounds-reference-layout">
            <aside className="rounds-week-nav practice-lecture-picker">
              <div className="rounds-nav-title"><span>SELECT LECTURE(S)</span><b>{course.courseCode}</b></div>
              {weeks.map((week) => {
                const isOpen = openWeeks.includes(week.id);
                const weekQuestions = week.lectures.reduce((sum, item) => sum + item.question_count, 0);
                const allSelected = week.lectures.length > 0 && week.lectures.every((lecture) => selectedIds.includes(lecture.id));
                return (
                  <section key={week.id}>
                    <div className="practice-week-heading">
                      <button className="rounds-week-button" type="button" onClick={() => toggleWeek(week.id)}>
                        <span><b>Week {week.weekNumber}</b><small>{week.title || "Untitled week"} · {weekQuestions} questions</small></span><FiChevronDown className={isOpen ? "open" : ""} />
                      </button>
                      <button className={`practice-week-select ${allSelected ? "active" : ""}`} type="button" onClick={() => toggleWholeWeek(week)}>{allSelected ? <FiCheck /> : "+"}</button>
                    </div>
                    {isOpen && (
                      <div className="rounds-lecture-list">
                        {week.lectures.map((lecture) => {
                          const checked = selectedIds.includes(lecture.id);
                          return (
                            <button key={lecture.id} type="button" className={`${activeLecture?.id === lecture.id ? "active" : ""} ${checked ? "selected-for-practice" : ""}`} onClick={() => toggleLecture(lecture)}>
                              <span className={`practice-check ${checked ? "checked" : ""}`}>{checked ? <FiCheck /> : ""}</span>
                              <span><b>{lecture.title}</b><small>{lecture.question_count} MCQ candidates · {lecture.flashcard_deck_count} decks</small></span>
                              <small>{checked ? "Selected" : "Select"}</small>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </aside>

            <section className="rounds-learning-stage">
              {activeLecture ? (
                <>
                  <div className="rounds-lecture-hero">
                    <div className="rounds-lecture-icon"><FiBookOpen /></div>
                    <div><small>LECTURE {activeLecture.lectureNumber}</small><h2>{activeLecture.title}</h2><p>{activeLecture.description || "The instructor has not published a lecture description yet."}</p></div>
                  </div>
                  <div className="rounds-action-grid">
                    <article><FiFileText /><div><b>{PRACTICE_QUESTION_COUNT}</b><span>Quiz size</span><small>Fixed 40-question MCQ practice set.</small></div></article>
                    <article><FiLayers /><div><b>{selectedIds.length}</b><span>Lectures selected</span><small>You can mix lectures from this course.</small></div></article>
                    <article><FiBookOpen /><div><b>{selectedQuestionPool}</b><span>Available question pool</span><small>At least 40 eligible questions are required.</small></div></article>
                  </div>
                  <div className={`rounds-primary-action practice-launch ${ready ? "ready" : "needs-questions"}`}>
                    <div>
                      <small>{ready ? "READY" : "QUESTION POOL"}</small>
                      <h3>{ready ? "Start a 40-MCQ Tutor quiz" : `Need ${Math.max(0, PRACTICE_QUESTION_COUNT - selectedQuestionPool)} more eligible MCQs`}</h3>
                      <p>{ready ? "Questions are sampled from exactly the lectures you selected and answers are saved to the backend." : "Select additional lectures or ask the instructor to publish more MCQs. The app will not silently duplicate questions."}</p>
                    </div>
                    <button className="pp-button" type="button" disabled={!ready || starting} onClick={() => void startTutor()}><FiPlayCircle />{starting ? "Building quiz…" : "Start 40 questions"}<FiArrowRight /></button>
                  </div>
                  <div className="rounds-secondary-actions"><Link className="pp-button secondary" href={`/flashcards?bundle=${bundleId}${activeLecture ? `&lecture=${activeLecture.id}` : ""}`}>Review flashcards</Link><Link className="pp-button secondary" href={`/past-exams?bundle=${bundleId}`}>Open configured exams</Link></div>
                </>
              ) : <Panel title="No lecture selected"><p>Choose one or more lectures from the curriculum navigator.</p></Panel>}
            </section>

            <aside className="rounds-context-rail">
              <Panel title="Selection"><div className="rounds-coverage-number">{selectedIds.length}<small> lectures</small></div><Progress value={Math.min(100, Math.round(selectedQuestionPool / PRACTICE_QUESTION_COUNT * 100))} />
                <dl><div><dt>Required MCQs</dt><dd>{PRACTICE_QUESTION_COUNT}</dd></div><div><dt>Question pool</dt><dd>{selectedQuestionPool}</dd></div><div><dt>Course total</dt><dd>{totals.questions}</dd></div></dl>
              </Panel>
              <Panel title={currentBundle?.read_only ? "Read-only access" : "Quiz rule"}><p>{currentBundle?.read_only ? "You may review existing content, but cannot start a new attempt from this bundle." : "Lecture practice is a fixed 40-MCQ Tutor session. Pre-authored exams use their instructor configuration instead."}</p></Panel>
              <button className="rounds-refresh" type="button" onClick={() => setBundleId((value) => value)}><FiRefreshCw /> Refresh content</button>
            </aside>
          </div>}
      </main>
    </ProductShell>
  );
}
