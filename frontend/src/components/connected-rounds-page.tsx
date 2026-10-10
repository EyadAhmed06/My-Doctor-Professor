"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import "./topic-practice-selection.css";

type Bundle = { id: string; title: string; read_only?: boolean };
type Lecture = { id: string; title: string; description: string | null; lectureNumber: number; question_count: number; mcq_count: number; flashcard_deck_count: number; resource_count: number; topics: Array<{ id: string; topicName: string; mcq_count: number }> };
type Week = { id: string; weekNumber: number; title: string | null; description: string | null; lectures: Lecture[] };
type Course = { id: string; courseName: string; courseCode: string; description: string | null; weeks: Week[] };
type Content = { bundle: Bundle; courses: Course[] };
type Generated = { test: { id: string }; attempt: { id: string }; question_count: number };
type PracticeMode = "TUTOR" | "TIMED";

const MAX_PRACTICE_QUESTION_COUNT = 200;

function numericCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

// A lecture with MCQs but no topic records is selectable as a whole.
function eligibleSelectionIds(lecture: Lecture): string[] {
  const topics = (lecture.topics || []).filter((topic) => numericCount(topic.mcq_count) > 0);
  return topics.length ? topics.map((topic) => topic.id) : numericCount(lecture.mcq_count) > 0 ? [lecture.id] : [];
}

function defaultPracticeLectures(lectures: Lecture[]) {
  const first = lectures.find((lecture) => numericCount(lecture.mcq_count) > 0);
  return first ? eligibleSelectionIds(first) : [];
}

function sessionHref(generated: Generated, bundleId: string, lectureIds: string[], mode: PracticeMode) {
  return `/mock-exam/session?attempt=${encodeURIComponent(generated.attempt.id)}&test=${encodeURIComponent(generated.test.id)}&mode=${mode}&source=rounds&bundle=${encodeURIComponent(bundleId)}&lectures=${encodeURIComponent(lectureIds.join(","))}`;
}

export function ConnectedRoundsPage() {
  const { request } = useAuth();
  const searchParams = useSearchParams();
  const requestedBundle = searchParams.get("bundle");
  const requestedCourse = searchParams.get("course");
  const requestedLecture = searchParams.get("lecture");
  const requestedLecturesParam = searchParams.get("lectures") || "";
  const requestedLectures = useMemo(() => requestedLecturesParam.split(",").filter(Boolean), [requestedLecturesParam]);

  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [bundleId, setBundleId] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [activeLecture, setActiveLecture] = useState<Lecture | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<PracticeMode>("TUTOR");
  const [openWeeks, setOpenWeeks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
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
  }, [bundleId, refreshKey, request, requestedCourse, requestedLecture, requestedLectures]);

  const course = useMemo(() => courses.find((item) => item.id === courseId), [courseId, courses]);
  const weeks = useMemo(() => course?.weeks ?? [], [course]);
  const lectureRows = useMemo(() => weeks.flatMap((week) => week.lectures.map((lecture) => ({ week, lecture }))), [weeks]);
  const totals = useMemo(
    () => lectureRows.reduce((value, row) => ({
      questions: value.questions + numericCount(row.lecture.question_count),
      mcqs: value.mcqs + numericCount(row.lecture.mcq_count),
      decks: value.decks + numericCount(row.lecture.flashcard_deck_count),
      resources: value.resources + numericCount(row.lecture.resource_count),
    }), { questions: 0, mcqs: 0, decks: 0, resources: 0 }),
    [lectureRows],
  );
  const currentBundle = bundles.find((item) => item.id === bundleId);
  const selectedLectures = lectureRows.filter(({ lecture }) => eligibleSelectionIds(lecture).some((id) => selectedIds.includes(id)));
  const selectedQuestionPool = selectedLectures.reduce((sum, { lecture }) => {
    const topics = (lecture.topics || []).filter((topic) => selectedIds.includes(topic.id));
    return sum + (topics.length ? topics.reduce((count, topic) => count + numericCount(topic.mcq_count), 0) : selectedIds.includes(lecture.id) ? numericCount(lecture.mcq_count) : 0);
  }, 0);
  const questionCount = Math.min(selectedQuestionPool, MAX_PRACTICE_QUESTION_COUNT);
  const ready = selectedIds.length > 0 && questionCount > 0 && !currentBundle?.read_only;

  useEffect(() => {
    if (!weeks.length) {
      setActiveLecture(null);
      setSelectedIds([]);
      return;
    }
    const allLectures = weeks.flatMap((item) => item.lectures);
    const requested = requestedLectures.filter((id) => allLectures.some((lecture) => lecture.id === id));
    if (!requested.length && requestedLecture && allLectures.some((lecture) => lecture.id === requestedLecture)) requested.push(requestedLecture);
    const initial = requested.length ? allLectures.filter((lecture) => requested.includes(lecture.id)).flatMap(eligibleSelectionIds) : defaultPracticeLectures(allLectures);
    setSelectedIds(initial);
    const first = allLectures.find((lecture) => eligibleSelectionIds(lecture).includes(initial[0])) || allLectures[0] || null;
    setActiveLecture(first);
    const initialSet = new Set(initial);
    const selectedWeeks = weeks.filter((item) => item.lectures.some((lecture) => eligibleSelectionIds(lecture).some((id) => initialSet.has(id)))).map((item) => item.id);
    const firstWeek = first ? weeks.find((item) => item.lectures.some((lecture) => lecture.id === first.id)) : undefined;
    setOpenWeeks(selectedWeeks.length ? selectedWeeks : firstWeek ? [firstWeek.id] : []);
  }, [courseId, requestedLecture, requestedLectures, weeks]);

  function toggleWeek(id: string) {
    setOpenWeeks((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleLecture(lecture: Lecture) {
    setActiveLecture(lecture);
    const ids = eligibleSelectionIds(lecture);
    setSelectedIds((current) => ids.every((id) => current.includes(id)) ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }

  function toggleWholeWeek(week: Week) {
    const ids = week.lectures.flatMap(eligibleSelectionIds);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }

  async function startPractice() {
    if (!ready || starting) return;
    setStarting(true);
    setError(null);
    try {
      const generated = await request<Generated>("/tests/practice/generate", {
        method: "POST",
        body: {
          bundle_id: bundleId,
          lecture_ids: selectedLectures.map(({ lecture }) => lecture.id),
          topic_ids: selectedIds.filter((id) => selectedLectures.some(({ lecture }) => (lecture.topics || []).some((topic) => topic.id === id))),
          question_count: questionCount,
          test_mode: mode,
          duration_minutes: mode === "TIMED" ? Math.ceil(questionCount * 1.5) : undefined,
        },
      });
      window.location.assign(sessionHref(generated, bundleId, selectedLectures.map(({ lecture }) => lecture.id), mode));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to build this quiz.");
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
            <p>Select individual topics or whole lectures. Practice uses only your selected topics, up to 200 MCQs, in Tutor or Timed mode.</p>
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
              <div className="rounds-nav-title"><span>SELECT TOPICS</span><b>{course.courseCode}</b></div>
              {weeks.map((week) => {
                const isOpen = openWeeks.includes(week.id);
                const weekMcqs = week.lectures.reduce((sum, item) => sum + numericCount(item.mcq_count), 0);
                const weekSelectionIds = week.lectures.flatMap(eligibleSelectionIds);
                const allSelected = weekSelectionIds.length > 0 && weekSelectionIds.every((id) => selectedIds.includes(id));
                return (
                  <section key={week.id}>
                    <div className="practice-week-heading">
                      <button className="rounds-week-button" type="button" onClick={() => toggleWeek(week.id)}>
                        <span><b>Week {week.weekNumber}</b><small>{week.title || "Untitled week"} · {weekMcqs} eligible MCQs</small></span><FiChevronDown className={isOpen ? "open" : ""} />
                      </button>
                      <button className={`practice-week-select ${allSelected ? "active" : ""}`} type="button" onClick={() => toggleWholeWeek(week)}>{allSelected ? <FiCheck /> : "+"}</button>
                    </div>
                    {isOpen && (
                      <div className="rounds-lecture-list">
                        {week.lectures.map((lecture) => {
                          const eligibleTopics = (lecture.topics || []).filter((topic) => topic.mcq_count > 0);
                          const checked = eligibleTopics.length > 0 && eligibleTopics.every((topic) => selectedIds.includes(topic.id));
                          return (
                            <div key={lecture.id}><button type="button" className={`${activeLecture?.id === lecture.id ? "active" : ""} ${checked ? "selected-for-practice" : ""}`} onClick={() => toggleLecture(lecture)}>
                              <span className={`practice-check ${checked ? "checked" : ""}`}>{checked ? <FiCheck /> : ""}</span>
                              <span><b>{lecture.title}</b><small>{numericCount(lecture.mcq_count)} eligible MCQs · {numericCount(lecture.flashcard_deck_count)} decks</small></span>
                              <small>{checked ? "Selected" : "Select"}</small>
                            </button><div className="practice-topic-options">{(lecture.topics || []).map((topic) => <label key={topic.id}><input type="checkbox" checked={selectedIds.includes(topic.id)} disabled={topic.mcq_count <= 0} onChange={() => { setActiveLecture(lecture); setSelectedIds((current) => current.includes(topic.id) ? current.filter((id) => id !== topic.id) : [...current, topic.id]); }} /><span>{topic.topicName}<small>{topic.mcq_count} eligible MCQs</small></span></label>)}</div></div>
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
                    <article><FiFileText /><div><b>{questionCount}</b><span>Quiz size</span><small>All available eligible MCQs, up to 200.</small></div></article>
                    <article><FiLayers /><div><b>{selectedIds.length}</b><span>Topics selected</span><small>Select one topic or mix several topics.</small></div></article>
                    <article><FiBookOpen /><div><b>{selectedQuestionPool}</b><span>Eligible MCQ pool</span><small>Active question-bank MCQs in your selection.</small></div></article>
                  </div>
                  <div className={`rounds-primary-action practice-launch ${ready ? "ready" : "needs-questions"}`}>
                    <div>
                      <small>{ready ? "READY" : "QUESTION POOL"}</small>
                      <h3>{ready ? `Start a ${questionCount}-MCQ ${mode === "TIMED" ? "Timed" : "Tutor"} quiz` : "Select a topic with eligible MCQs"}</h3>
                      <p>{ready ? "Questions are sampled from exactly the topics you selected and answers are saved to the backend." : "Select additional topics or ask the instructor to publish more active question-bank MCQs. The app will not silently duplicate questions."}</p>
                    </div>
                    <div className="practice-launch-controls"><label>Mode<select aria-label="Quiz mode" value={mode} disabled={starting} onChange={(event) => setMode(event.target.value as PracticeMode)}><option value="TUTOR">Tutor · explanation after each answer</option><option value="TIMED">Timed · {Math.ceil(questionCount * 1.5)} minutes</option></select></label><button className="pp-button" type="button" disabled={!ready || starting} onClick={() => void startPractice()}><FiPlayCircle />{starting ? "Building quiz…" : `Start ${questionCount} questions`}<FiArrowRight /></button></div>
                  </div>
                  <div className="rounds-secondary-actions"><Link className="pp-button secondary" href={`/flashcards?bundle=${bundleId}${activeLecture ? `&lecture=${activeLecture.id}` : ""}`}>Review flashcards</Link><Link className="pp-button secondary" href={`/past-exams?bundle=${bundleId}`}>End-of-round & Exams</Link></div>
                </>
              ) : <Panel title="No lecture selected"><p>Choose one or more lectures from the curriculum navigator.</p></Panel>}
            </section>

            <aside className="rounds-context-rail">
              <Panel title="Selection"><div className="rounds-coverage-number">{selectedIds.length}<small> topics</small></div><Progress value={ready ? 100 : 0} />
                <dl><div><dt>Quiz MCQs</dt><dd>{questionCount}</dd></div><div><dt>Eligible MCQ pool</dt><dd>{selectedQuestionPool}</dd></div><div><dt>Course eligible MCQs</dt><dd>{totals.mcqs}</dd></div></dl>
              </Panel>
              <Panel title={currentBundle?.read_only ? "Read-only access" : "Quiz rule"}><p>{currentBundle?.read_only ? "You may review existing content, but cannot start a new attempt from this bundle." : "Practice uses the eligible questions in your selection, up to 200. Tutor is untimed; Timed allows one minute per question."}</p></Panel>
              <button className="rounds-refresh" type="button" onClick={() => setRefreshKey((value) => value + 1)}><FiRefreshCw /> Refresh content</button>
            </aside>
          </div>}
      </main>
    </ProductShell>
  );
}
