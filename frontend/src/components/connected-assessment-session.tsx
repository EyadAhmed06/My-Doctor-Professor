"use client";

import { ApiError } from "@/lib/api";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell, Progress } from "./product-shell";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiClock,
  FiEdit3,
  FiEyeOff,
  FiFileText,
  FiFlag,
  FiMoreVertical,
  FiSave,
} from "react-icons/fi";
import { useRouter } from "next/navigation";
import { getQuestionVisual } from "./medical-image-assets";
import { useUx } from "./ux-provider";
import "./assessment-session.css";

type Option = { id: string; optionText: string; displayOrder: number };
type Question = { id: string; questionText: string; questionType: "MCQ" | "ESSAY"; options: Option[]; explanation?: string | null };
type Assignment = { questionId: string; displayOrder: number; marks?: string; question: Question };
type Attempt = {
  id: string;
  testId: string;
  testMode: "TUTOR" | "TIMED";
  status: string;
  deadline: string | null;
  startedAt?: string | null;
  test?: { title: string; durationMinutes?: number | null; testType?: string };
};
type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";
type Answer = { questionId: string; selectedOptionId: string | null; confidenceLevel?: ConfidenceLevel | null; isCorrect?: boolean | null };
type WorkspaceState = {
  attempt: Attempt;
  answers: Answer[];
  flagged_question_ids: string[];
  hard_question_ids: string[];
  notes: Array<{ question_id: string; note: string }>;
};
type TutorFeedback = { isCorrect: boolean | null; explanation?: string | null };
type ReviewOption = Option & { isCorrect?: boolean };
type ReviewQuestion = Omit<Question, "options"> & { options: ReviewOption[]; explanation?: string | null };
type ReviewAssignment = Omit<Assignment, "question"> & {
  question: ReviewQuestion;
  answer: { selectedOptionId: string | null; isCorrect: boolean | null } | null;
};
type Review = { attempt: Attempt; questions: ReviewAssignment[] };
type HighlightColor = "yellow" | "green" | "blue" | "pink";
type HighlightRange = { start: number; end: number; color?: HighlightColor };
type DrawingPoint = { x: number; y: number };
type PenColor = "red" | "blue" | "green" | "black";
type DrawingStroke = { points: DrawingPoint[]; color?: PenColor };
type DrawingState = Record<string, DrawingStroke[]>;
type QuestionHighlights = { stem: HighlightRange[]; options: Record<string, HighlightRange[]> };
type HighlightState = Record<string, QuestionHighlights>;

const BLOCK_SIZE = 40;

function formatPace(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}/question`;
}

function normalizeRanges(ranges: HighlightRange[], textLength: number) {
  const ordered = ranges
    .map((range) => ({ start: Math.max(0, Math.min(textLength, range.start)), end: Math.max(0, Math.min(textLength, range.end)), color: range.color || "yellow" as HighlightColor }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: HighlightRange[] = [];
  for (const range of ordered) {
    const previous = merged[merged.length - 1];
    if (previous && previous.color === range.color && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else if (previous && range.start < previous.end) { if (range.end > previous.end) merged.push({ ...range, start: previous.end }); }
    else merged.push({ ...range });
  }
  return merged;
}

function HighlightableText({ text, ranges, enabled, eraserEnabled = false, onHighlight, onErase, className }: { text: string; ranges: HighlightRange[]; enabled: boolean; eraserEnabled?: boolean; onHighlight: (start: number, end: number) => void; onErase?: (start: number, end: number) => void; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const normalized = useMemo(() => normalizeRanges(ranges, text.length), [ranges, text.length]);
  function captureSelection() {
    if (!enabled || !ref.current) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!ref.current.contains(range.commonAncestorContainer)) return;
    const prefix = document.createRange();
    prefix.selectNodeContents(ref.current);
    prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    const end = start + range.toString().length;
    if (range.toString().trim() && end > start) onHighlight(start, end);
    selection.removeAllRanges();
  }
  const content: ReactNode[] = [];
  let cursor = 0;
  normalized.forEach((range, index) => {
    if (range.start > cursor) content.push(text.slice(cursor, range.start));
    content.push(<mark className={`exam-text-highlight highlight-${range.color || "yellow"} ${eraserEnabled ? "is-erasable" : ""}`} onClick={(event) => { if (eraserEnabled) { event.preventDefault(); event.stopPropagation(); onErase?.(range.start, range.end); } }} key={`${range.start}-${range.end}-${index}`}>{text.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  });
  if (cursor < text.length) content.push(text.slice(cursor));
  return <span ref={ref} className={`${className || ""} exam-highlightable ${enabled ? "is-highlight-mode" : ""} ${eraserEnabled ? "is-eraser-mode" : ""}`.trim()} onMouseUp={captureSelection} title={enabled ? "Select text to highlight it" : undefined}>{content.length ? content : text}</span>;
}

export function ConnectedAssessmentSession({ attemptId, testId, source = "assessments" }: { attemptId: string; testId: string; source?: string }) {
  const { request } = useAuth();
  const { notify, celebrate } = useUx();
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [items, setItems] = useState<Assignment[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<Record<string, ConfidenceLevel>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [hardFlags, setHardFlags] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, TutorFeedback>>({});
  const [struck, setStruck] = useState<Record<string, string[]>>({});
  const [highlights, setHighlights] = useState<HighlightState>({});
  const [strikeMode, setStrikeMode] = useState(false);
  const [highlightMode, setHighlightMode] = useState(false);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("yellow");
  const [penMode, setPenMode] = useState(false);
  const [penColor, setPenColor] = useState<PenColor>("red");
  const [eraserMode, setEraserMode] = useState<"highlight" | "pen" | null>(null);
  const [drawings, setDrawings] = useState<DrawingState>({});
  const [review, setReview] = useState<Review | null>(null);
  const [visualOpen, setVisualOpen] = useState(false);
  const [hideTime, setHideTime] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [localToolsLoaded, setLocalToolsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const autoSubmitStarted = useRef(false);
  const answerRequests = useRef(new Set<string>());
  const drawingSurfaceRef = useRef<HTMLDivElement>(null);
  const activeStroke = useRef<number | null>(null);

  useEffect(() => {
    try {
      const savedHighlights = JSON.parse(sessionStorage.getItem(`mdp:highlights:${attemptId}`) || "{}") as HighlightState;
      const savedStrikes = JSON.parse(sessionStorage.getItem(`mdp:strikes:${attemptId}`) || "{}") as Record<string, string[]>;
      const savedDrawings = JSON.parse(sessionStorage.getItem(`mdp:drawings:${attemptId}`) || "{}") as DrawingState;
      setHighlights(savedHighlights && typeof savedHighlights === "object" ? savedHighlights : {});
      setStruck(savedStrikes && typeof savedStrikes === "object" ? savedStrikes : {});
      setDrawings(savedDrawings && typeof savedDrawings === "object" ? savedDrawings : {});
    } catch {
      setHighlights({}); setStruck({}); setDrawings({});
    } finally { setLocalToolsLoaded(true); }
  }, [attemptId]);

  useEffect(() => {
    if (!attemptId || !testId) return;
    let active = true;
    void Promise.all([request<WorkspaceState>(`/tests/attempts/${attemptId}/workspace-state`), request<Assignment[]>(`/tests/${testId}/questions`)])
      .then(([state, questions]) => {
        if (!active) return;
        setAttempt(state.attempt); setItems(questions);
        setAnswers(Object.fromEntries(state.answers.filter((item) => item.selectedOptionId).map((item) => [item.questionId, item.selectedOptionId!])));
        setConfidence(Object.fromEntries(state.answers.filter((item) => item.confidenceLevel).map((item) => [item.questionId, item.confidenceLevel!])));
        setFlags(state.flagged_question_ids); setHardFlags(state.hard_question_ids || []); setNotes(Object.fromEntries(state.notes.map((item) => [item.question_id, item.note])));
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load this attempt."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attemptId, testId, request]);

  useEffect(() => {
    if (!attempt?.deadline) { setNow(Date.now()); return; }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [attempt?.deadline]);

  useEffect(() => {
    if (!localToolsLoaded) return;
    try {
      sessionStorage.setItem(`mdp:highlights:${attemptId}`, JSON.stringify(highlights));
      sessionStorage.setItem(`mdp:strikes:${attemptId}`, JSON.stringify(struck));
      sessionStorage.setItem(`mdp:drawings:${attemptId}`, JSON.stringify(drawings));
    } catch { /* best effort */ }
  }, [attemptId, drawings, highlights, localToolsLoaded, struck]);

  useEffect(() => { setMoreOpen(false); setHighlightMode(false); setStrikeMode(false); setPenMode(false); setEraserMode(null); setSavedNoteId(null); }, [index]);

  const current = items[index];
  const questionVisual = current ? getQuestionVisual(current.question.questionText) : null;
  const totalAnswered = useMemo(() => items.filter((item) => Boolean(answers[item.question.id])).length, [answers, items]);
  const blockCount = Math.max(1, Math.ceil(items.length / BLOCK_SIZE));
  const blockIndex = Math.min(blockCount - 1, Math.floor(index / BLOCK_SIZE));
  const blockStart = blockIndex * BLOCK_SIZE;
  const blockItems = items.slice(blockStart, blockStart + BLOCK_SIZE);
  const questionInBlock = index - blockStart + 1;
  const blockAnswered = blockItems.filter((item) => Boolean(answers[item.question.id])).length;
  const unanswered = Math.max(0, blockItems.length - blockAnswered);
  const progress = blockItems.length ? Math.round((blockAnswered / blockItems.length) * 100) : 0;
  const overallProgress = items.length ? Math.round((totalAnswered / items.length) * 100) : 0;
  const showOverallProgress = attempt?.testMode === "TIMED" && items.length > BLOCK_SIZE;
  const secondsLeft = attempt?.deadline && now !== null ? Math.max(0, Math.floor((new Date(attempt.deadline).getTime() - now) / 1000)) : null;
  const clock = secondsLeft === null ? "Untimed" : `${String(Math.floor(secondsLeft / 3600)).padStart(2, "0")}:${String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;
  const tutor = attempt?.testMode === "TUTOR" || source === "rounds";
  const expired = attempt?.testMode === "TIMED" && secondsLeft === 0;
  const elapsedSeconds = attempt?.startedAt && now !== null ? Math.max(0, Math.floor((now - new Date(attempt.startedAt).getTime()) / 1000)) : 0;
  const pace = totalAnswered ? formatPace(elapsedSeconds / totalAnswered) : "—";

  function questionHighlights(questionId: string): QuestionHighlights { return highlights[questionId] || { stem: [], options: {} }; }
  function addHighlight(questionId: string, target: "stem" | string, start: number, end: number) {
    setHighlights((value) => {
      const existing = value[questionId] || { stem: [], options: {} };
      if (target === "stem") return { ...value, [questionId]: { ...existing, stem: normalizeRanges([...existing.stem, { start, end, color: highlightColor }], current?.question.questionText.length || end) } };
      const optionText = current?.question.options.find((option) => option.id === target)?.optionText || "";
      return { ...value, [questionId]: { ...existing, options: { ...existing.options, [target]: normalizeRanges([...(existing.options[target] || []), { start, end, color: highlightColor }], optionText.length || end) } } };
    });
  }
  function clearQuestionHighlights(questionId: string) { setHighlights((value) => { const next = { ...value }; delete next[questionId]; return next; }); }
  function eraseHighlight(questionId: string, target: "stem" | string, start: number, end: number) {
    setHighlights((value) => {
      const existing = value[questionId]; if (!existing) return value;
      if (target === "stem") return { ...value, [questionId]: { ...existing, stem: existing.stem.filter((range) => range.end <= start || range.start >= end) } };
      return { ...value, [questionId]: { ...existing, options: { ...existing.options, [target]: (existing.options[target] || []).filter((range) => range.end <= start || range.start >= end) } } };
    });
  }
  function drawingPoint(event: ReactPointerEvent<HTMLDivElement>): DrawingPoint | null {
    const box = drawingSurfaceRef.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return null;
    return { x: ((event.clientX - box.left) / box.width) * 1000, y: ((event.clientY - box.top) / box.height) * 1000 };
  }
  function startDrawing(event: ReactPointerEvent<HTMLDivElement>) {
    if (!current || expired) return;
    if (eraserMode === "pen") { eraseDrawingAt(event); return; }
    if (!penMode) return;
    const point = drawingPoint(event); if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawings((value) => { const strokes = [...(value[current.question.id] || []), { points: [point], color: penColor }]; activeStroke.current = strokes.length - 1; return { ...value, [current.question.id]: strokes }; });
  }
  function continueDrawing(event: React.PointerEvent<HTMLDivElement>) {
    if (!current) return;
    if (eraserMode === "pen") { eraseDrawingAt(event); return; }
    if (!penMode || activeStroke.current === null) return;
    const point = drawingPoint(event); if (!point) return;
    setDrawings((value) => { const strokes = [...(value[current.question.id] || [])]; const stroke = strokes[activeStroke.current!]; if (!stroke) return value; strokes[activeStroke.current!] = { points: [...stroke.points, point] }; return { ...value, [current.question.id]: strokes }; });
  }
  function stopDrawing() { activeStroke.current = null; }
  function eraseDrawingAt(event: ReactPointerEvent<HTMLDivElement>) {
    if (!current) return; const point = drawingPoint(event); if (!point) return;
    const radius = 34;
    setDrawings((value) => ({ ...value, [current.question.id]: (value[current.question.id] || []).filter((stroke) => !stroke.points.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= radius)) }));
  }
  function clearQuestionDrawings(questionId: string) { setDrawings((value) => { const next = { ...value }; delete next[questionId]; return next; }); }

  async function choose(optionId: string, confidenceLevel: ConfidenceLevel) {
    if (!current || expired || Boolean(tutor && feedback[current.question.id] && answers[current.question.id] !== optionId)) return;
    const questionId = current.question.id;
    if (answerRequests.current.has(questionId)) return;
    const previous = answers[questionId];
    const previousConfidence = confidence[questionId];
    answerRequests.current.add(questionId);
    setAnswers((value) => ({ ...value, [questionId]: optionId }));
    setConfidence((value) => ({ ...value, [questionId]: confidenceLevel }));
    setSavingQuestionId(questionId); setError(null);
    try {
      const result = await request<Answer & TutorFeedback>(`/tests/attempts/${attemptId}/answers/${questionId}`, { method: "PUT", body: { selected_option_id: optionId, confidence_level: confidenceLevel } });
      setAnswers((value) => ({ ...value, [questionId]: result.selectedOptionId || optionId }));
      setConfidence((value) => ({ ...value, [questionId]: result.confidenceLevel || confidenceLevel }));
      setPendingAnswers((value) => { const next = { ...value }; delete next[questionId]; return next; });
      if (tutor) setFeedback((value) => ({ ...value, [questionId]: { isCorrect: result.isCorrect ?? null, explanation: result.explanation } }));
      celebrate({ id: "assessment-first-answer", title: "First answer recorded", description: "Your answer and confidence were saved.", points: 20 });
    } catch (cause) {
      setAnswers((value) => { const next = { ...value }; if (previous) next[questionId] = previous; else delete next[questionId]; return next; });
      setConfidence((value) => { const next = { ...value }; if (previousConfidence) next[questionId] = previousConfidence; else delete next[questionId]; return next; });
      const message = cause instanceof Error ? cause.message : "Unable to save this answer.";
      setError(message);
      notify({ title: "Answer was not saved", description: cause instanceof ApiError ? `${message} (${cause.status})` : message, tone: "error", duration: 7000 });
    } finally { answerRequests.current.delete(questionId); setSavingQuestionId(null); }
  }

  function selectOption(optionId: string) {
    if (!current || expired || Boolean(tutor && feedback[current.question.id])) return;
    const questionId = current.question.id;
    setPendingAnswers((value) => ({ ...value, [questionId]: optionId }));
    const existingConfidence = confidence[questionId];
    if (existingConfidence) void choose(optionId, existingConfidence);
  }
  async function toggleFlag() {
    if (!current || expired) return;
    const active = flags.includes(current.question.id);
    try {
      await request(`/tests/attempts/${attemptId}/flags/${current.question.id}`, { method: active ? "DELETE" : "POST" });
      setFlags((value) => (active ? value.filter((id) => id !== current.question.id) : [...value, current.question.id]));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update the flag."); }
  }
  async function toggleHardFlag() {
    if (!current || expired) return;
    const active = hardFlags.includes(current.question.id);
    try {
      await request(`/tests/attempts/${attemptId}/hard-flags/${current.question.id}`, { method: active ? "DELETE" : "POST" });
      setHardFlags((value) => (active ? value.filter((id) => id !== current.question.id) : [...value, current.question.id]));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update the hard-question flag."); }
  }

  async function saveNote() {
    if (!current || expired || savingNoteId === current.question.id) return;
    const questionId = current.question.id; const value = notes[questionId]?.trim() || "";
    setSavingNoteId(questionId); setSavedNoteId(null); setError(null);
    try {
      if (value) {
        await request(`/tests/attempts/${attemptId}/notes/${questionId}`, { method: "PUT", body: { note: value } });
        setNotes((currentNotes) => ({ ...currentNotes, [questionId]: value }));
        notify({ title: "Question note saved", description: "Saved to your account for this assessment question.", tone: "success", duration: 2500 });
      } else if (notes[questionId] !== undefined) {
        await request(`/tests/attempts/${attemptId}/notes/${questionId}`, { method: "DELETE" });
        notify({ title: "Question note removed", tone: "info", duration: 2000 });
      }
      setSavedNoteId(questionId);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to save the note."; setError(message); notify({ title: "Question note was not saved", description: message, tone: "error" });
    } finally { setSavingNoteId(null); }
  }

  function toggleStrike(optionId: string) {
    if (!current || expired) return;
    const questionId = current.question.id;
    setStruck((value) => { const currentIds = value[questionId] || []; return { ...value, [questionId]: currentIds.includes(optionId) ? currentIds.filter((id) => id !== optionId) : [...currentIds, optionId] }; });
  }
  function clearQuestionStrikes(questionId: string) { setStruck((value) => { const next = { ...value }; delete next[questionId]; return next; }); }

  const finalize = useCallback(async (auto = false) => {
    const missingConfidence = items.some((item) => !(pendingAnswers[item.question.id] || answers[item.question.id]) || !confidence[item.question.id]);
    if (!auto && tutor && missingConfidence) { notify({ title: "Confidence required", description: "Answer every question and choose a confidence level for each one before ending Tutor practice.", tone: "error" }); return; }
    if (!auto && !window.confirm(`Submit this assessment with ${totalAnswered} of ${items.length} questions answered?`)) return;
    setSubmitting(true); setError(null);
    try {
      await request(`/tests/attempts/${attemptId}/submit`, { method: "POST" });
      setReview(await request<Review>(`/tests/attempts/${attemptId}/review`));
      celebrate({ id: `assessment-complete-${attemptId}`, title: "Practice completed", description: "A complete assessment attempt was submitted and preserved.", points: Math.min(100, Math.max(25, items.length)) });
    } catch (cause) {
      if (auto) {
        try { setReview(await request<Review>(`/tests/attempts/${attemptId}/review`)); return; } catch { /* server may still be finalizing */ }
      }
      setError(cause instanceof Error ? cause.message : "Unable to submit the assessment.");
    } finally { setSubmitting(false); }
  }, [answers, attemptId, celebrate, confidence, items, notify, pendingAnswers, request, totalAnswered, tutor]);

  function endBlock() {
    if (tutor || blockIndex === blockCount - 1) { void finalize(Boolean(expired)); return; }
    const remaining = blockItems.length - blockAnswered;
    if (remaining > 0 && !window.confirm(`This block still has ${remaining} unanswered question${remaining === 1 ? "" : "s"}. Move to the next block?`)) return;
    setIndex((blockIndex + 1) * BLOCK_SIZE); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  useEffect(() => { if (!expired || review || autoSubmitStarted.current) return; autoSubmitStarted.current = true; void finalize(true); }, [expired, finalize, review]);
  const exitPath = source === "rounds" ? "/rounds" : "/past-exams";

  if (!attemptId || !testId) return <ProductShell><div className="product-auth-loading">Missing attempt information. Start an assessment from Questions or Past Exams.</div></ProductShell>;

  return <ProductShell search="Search cases, topics, or concepts"><main className={`pp-page exam-session-page ${tutor ? "is-tutor" : "is-timed"}`}>
    {error && <p className="form-error exam-session-error" role="alert">{error}</p>}
    {expired && !review && <p className="form-success exam-session-error" role="status">Time expired. Answers are locked while the server finalizes this assessment.</p>}
    {loading ? <div className="product-auth-loading">Loading assessment…</div> : error && !attempt ? <Panel title="Could not load assessment"><p>{error}</p><button className="pp-button" type="button" onClick={() => window.location.reload()}>Retry</button></Panel> : review ? <Panel title="Assessment submitted" className="exam-review-panel">
      <h2>{review.attempt.test?.title || "Assessment complete"}</h2><p>Your submitted answers are saved. Detailed explanations are shown below.</p>
      {review.questions.map((item, i) => { const selectedOption = item.question.options.find((option) => option.id === item.answer?.selectedOptionId); const correctOption = item.question.options.find((option) => option.isCorrect); const resultLabel = item.answer?.isCorrect === true ? "Correct" : item.answer?.isCorrect === false ? "Incorrect" : "Not answered / pending grading"; return <article className={`review-answer ${item.answer?.isCorrect === true ? "correct" : item.answer?.isCorrect === false ? "incorrect" : ""}`} key={item.question.id}><b>{i + 1}. {item.question.questionText}</b><strong>{resultLabel}</strong>{selectedOption && <p><span>Your answer:</span> {selectedOption.optionText}</p>}{correctOption && item.answer?.isCorrect !== true && <p><span>Correct answer:</span> {correctOption.optionText}</p>}<div className="review-explanation"><b>Explanation</b><p>{item.question.explanation || "No explanation has been published for this question."}</p></div></article>; })}
      <button className="pp-button" type="button" onClick={() => router.push(exitPath)}>Back</button>
    </Panel> : current ? <>
      <section className="exam-command-strip" aria-label="Exam status"><button className="exam-exit" type="button" onClick={() => router.push(exitPath)}><FiArrowLeft /> Exit {tutor ? "practice" : "exam"}</button><div><small>Exam</small><b>{attempt?.test?.title || (tutor ? "40 Question Practice" : "Mock Exam")}</b></div><div><small>Mode</small><b>{tutor ? "Tutor" : "Timed"}</b></div><div><small>Scope</small><b>{source === "rounds" ? "Selected lectures" : attempt?.test?.testType || "Configured exam"}</b></div><div><small>Block</small><b>Block {blockIndex + 1} of {blockCount}</b></div><div className="exam-time-cell"><small>Time remaining</small><b><FiClock /> {hideTime ? "••:••:••" : clock}</b></div><div><small>Progress</small><b>{showOverallProgress ? `${totalAnswered} answered of ${items.length}` : `${blockAnswered} answered of ${blockItems.length}`}</b><Progress value={showOverallProgress ? overallProgress : progress} /></div></section>
      <div className="exam-workspace-grid">
        <aside className="exam-navigator-card"><header><FiFileText /><b>Question Navigator</b></header>{blockCount > 1 && <nav className="exam-block-pager" aria-label="Question groups">{Array.from({ length: blockCount }, (_, groupIndex) => { const start = groupIndex * BLOCK_SIZE + 1; const end = Math.min(items.length, start + BLOCK_SIZE - 1); return <button type="button" key={groupIndex} className={groupIndex === blockIndex ? "active" : ""} aria-current={groupIndex === blockIndex ? "page" : undefined} onClick={() => { setIndex(groupIndex * BLOCK_SIZE); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{start}–{end}</button>; })}</nav>}<div className="exam-mini-legend"><span className="answered">Answered</span><span className="unanswered">Unanswered</span><span className="current">Current</span><span className="normal-flagged">Flagged</span><span className="flagged">Hard</span></div><div className="exam-number-grid">{blockItems.map((item, i) => { const globalIndex = blockStart + i; const isCurrent = globalIndex === index; const isAnswered = Boolean(answers[item.question.id]); const isFlagged = flags.includes(item.question.id); const isHard = hardFlags.includes(item.question.id); return <button type="button" className={`${isAnswered ? "answered" : "unanswered"} ${isCurrent ? "current" : ""} ${isFlagged ? "normal-flagged" : ""} ${isHard ? "hard-flagged" : ""}`} onClick={() => setIndex(globalIndex)} key={item.question.id} aria-label={`Question ${globalIndex + 1}${isAnswered ? ", answered" : ", unanswered"}${isFlagged ? ", flagged" : ""}${isHard ? ", marked hard" : ""}`}>{globalIndex + 1}{isFlagged && <FiFlag className="normal-flag-icon" />}{isHard && <FiFlag className="hard-flag-icon" />}</button>; })}</div><footer><b>Block progress</b><Progress value={progress} /><span><small>{blockAnswered}/{blockItems.length} answered</small><strong>{progress}%</strong></span></footer></aside>
        <section className="exam-main-column"><article className="exam-question-card">
          <div className="exam-question-toolbar"><div><span>{tutor ? "Tutor" : "Timed"}</span><span>MCQ</span></div><div><button type="button" className={`normal-flag ${flags.includes(current.question.id) ? "active" : ""}`} disabled={expired} onClick={() => void toggleFlag()}><FiFlag /> Flag</button><button type="button" className={`hard-flag ${hardFlags.includes(current.question.id) ? "active" : ""}`} disabled={expired} onClick={() => void toggleHardFlag()}><FiFlag /> Hard question</button><button type="button" className={highlightMode ? "active" : ""} aria-pressed={highlightMode} disabled={expired} onClick={() => { setHighlightMode((value) => !value); setStrikeMode(false); setPenMode(false); setEraserMode(null); }}><FiEdit3 /> Highlighter</button><button type="button" className={penMode ? "active" : ""} aria-pressed={penMode} disabled={expired} onClick={() => { setPenMode((value) => !value); setHighlightMode(false); setStrikeMode(false); setEraserMode(null); }}><FiEdit3 /> Pen</button><button type="button" className={eraserMode ? "active" : ""} aria-pressed={Boolean(eraserMode)} disabled={expired} onClick={() => { setEraserMode((value) => value ? null : "pen"); setPenMode(false); setHighlightMode(false); setStrikeMode(false); }}>⌫ Eraser</button><button type="button" className={strikeMode ? "active" : ""} aria-pressed={strikeMode} disabled={expired} onClick={() => { setStrikeMode((value) => !value); setHighlightMode(false); setPenMode(false); setEraserMode(null); }}>S̶ Strike out</button><button type="button" onClick={() => document.getElementById("exam-question-notes")?.scrollIntoView({ behavior: "smooth", block: "center" })}>▣ Notes</button><div className="exam-more-actions"><button type="button" aria-label="More question actions" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}><FiMoreVertical /></button>{moreOpen && <div className="exam-more-menu" role="menu"><button type="button" role="menuitem" disabled={!questionHighlights(current.question.id).stem.length && !Object.values(questionHighlights(current.question.id).options).some((ranges) => ranges.length)} onClick={() => { clearQuestionHighlights(current.question.id); setMoreOpen(false); }}>Clear highlights</button><button type="button" role="menuitem" disabled={!(drawings[current.question.id] || []).length} onClick={() => { clearQuestionDrawings(current.question.id); setMoreOpen(false); }}>Clear pen marks</button><button type="button" role="menuitem" disabled={!(struck[current.question.id] || []).length} onClick={() => { clearQuestionStrikes(current.question.id); setMoreOpen(false); }}>Clear strike-outs</button></div>}</div></div></div>
          {highlightMode && <div className="exam-highlight-tools" role="status"><p className="exam-tool-hint"><FiEdit3 /> Highlighter active — select any words in the question or answer choices.</p><div className="exam-highlight-palette" aria-label="Highlighter colour">{(["yellow", "green", "blue", "pink"] as HighlightColor[]).map((color) => <button type="button" key={color} className={`${color} ${highlightColor === color ? "active" : ""}`} aria-label={`${color} highlighter`} aria-pressed={highlightColor === color} onClick={() => setHighlightColor(color)} />)}</div></div>}{penMode && <div className="exam-highlight-tools" role="status"><p className="exam-tool-hint"><FiEdit3 /> Pen active — drag to underline, circle, or annotate the question.</p><div className="exam-pen-palette" aria-label="Pen colour">{(["red", "blue", "green", "black"] as PenColor[]).map((color) => <button type="button" key={color} className={`${color} ${penColor === color ? "active" : ""}`} aria-label={`${color} pen`} aria-pressed={penColor === color} onClick={() => setPenColor(color)} />)}</div></div>}{eraserMode && <div className="exam-eraser-tools" role="status"><p className="exam-tool-hint">⌫ Eraser active — choose what to erase.</p><div><button type="button" className={eraserMode === "highlight" ? "active" : ""} onClick={() => setEraserMode("highlight")}>Highlights</button><button type="button" className={eraserMode === "pen" ? "active" : ""} onClick={() => setEraserMode("pen")}>Pen strokes</button></div></div>}{strikeMode && <p className="exam-tool-hint" role="status">S̶ Strike-out active — click an answer choice to cross it out without answering.</p>}
          {questionVisual && <>{<button type="button" className={`question-visual question-visual--${questionVisual.specialty}`} onClick={() => setVisualOpen(true)} aria-label={`Open larger ${questionVisual.specialty} illustration`}><img src={questionVisual.src} alt={questionVisual.alt} /><span>{questionVisual.specialty} · open image</span></button>}{visualOpen && <div className="question-visual-modal" role="dialog" aria-modal="true" aria-label={questionVisual.alt} onClick={() => setVisualOpen(false)}><button type="button" aria-label="Close image" onClick={() => setVisualOpen(false)}>×</button><img src={questionVisual.src} alt={questionVisual.alt} /></div>}</>}
          <div ref={drawingSurfaceRef} className={`exam-annotation-surface ${penMode ? "is-pen-mode" : ""} ${eraserMode === "pen" ? "is-pen-eraser" : ""}`} onPointerDown={startDrawing} onPointerMove={continueDrawing} onPointerUp={stopDrawing} onPointerCancel={stopDrawing}><svg className="exam-pen-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">{(drawings[current.question.id] || []).map((stroke, strokeIndex) => <polyline key={strokeIndex} stroke={stroke.color || "red"} points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")} />)}</svg>
          <h1><HighlightableText className="exam-question-stem-text" text={current.question.questionText} ranges={questionHighlights(current.question.id).stem} enabled={highlightMode} eraserEnabled={eraserMode === "highlight"} onHighlight={(start, end) => addHighlight(current.question.id, "stem", start, end)} onErase={(start, end) => eraseHighlight(current.question.id, "stem", start, end)} /></h1>
          <div className="exam-answer-list" role="radiogroup" aria-label={`Answers for question ${index + 1}`}>{current.question.options.map((option, i) => { const selected = (pendingAnswers[current.question.id] || answers[current.question.id]) === option.id; const crossed = (struck[current.question.id] || []).includes(option.id); const tutorResult = feedback[current.question.id]; const judgedClass = tutorResult && selected ? (tutorResult.isCorrect ? "answer-correct" : "answer-incorrect") : ""; return <div className={`exam-answer-row ${selected ? "selected" : ""} ${crossed ? "struck" : ""} ${judgedClass}`} key={option.id}><button type="button" role="radio" aria-checked={selected} disabled={expired || savingQuestionId === current.question.id || Boolean(tutor && feedback[current.question.id])} onClick={() => { if (highlightMode) return; if (strikeMode) { toggleStrike(option.id); return; } selectOption(option.id); }}><b>{String.fromCharCode(65 + i)}</b><span><HighlightableText className="exam-option-highlight-text" text={option.optionText} ranges={questionHighlights(current.question.id).options[option.id] || []} enabled={highlightMode} eraserEnabled={eraserMode === "highlight"} onHighlight={(start, end) => addHighlight(current.question.id, option.id, start, end)} onErase={(start, end) => eraseHighlight(current.question.id, option.id, start, end)} /></span>{savingQuestionId === current.question.id && selected ? <small>Saving…</small> : selected ? <FiCheck /> : null}</button><button type="button" className="exam-strike-toggle" aria-label={`${crossed ? "Restore" : "Strike out"} option ${String.fromCharCode(65 + i)}`} aria-pressed={crossed} disabled={expired} onClick={() => toggleStrike(option.id)}>S̶</button></div>; })}</div>
          {(pendingAnswers[current.question.id] || answers[current.question.id]) && <section className="exam-confidence" aria-label="Answer confidence"><div><b>How confident are you?</b><small>Required before this answer is saved. You can change it later.</small></div><div>{(["LOW", "MEDIUM", "HIGH"] as ConfidenceLevel[]).map((level) => <button type="button" key={level} className={confidence[current.question.id] === level ? "active" : ""} aria-pressed={confidence[current.question.id] === level} disabled={expired || savingQuestionId === current.question.id} onClick={() => void choose(pendingAnswers[current.question.id] || answers[current.question.id], level)}>{level === "LOW" ? "Low" : level === "MEDIUM" ? "Medium" : "High"}</button>)}</div></section>}
          </div>
          {tutor && feedback[current.question.id] && <div className={`tutor-explanation ${feedback[current.question.id].isCorrect ? "correct" : "incorrect"}`} role="status"><b>{feedback[current.question.id].isCorrect ? "Correct" : "Incorrect"}</b><p>{feedback[current.question.id].explanation || "No explanation has been published for this question."}</p></div>}
        </article>
        <div className="exam-lower-grid exam-lower-grid--notes-only"><section className="exam-scratchpad-card" id="exam-question-notes"><nav><span>Notes</span></nav><div><small>Private question note — saved to your account and tied to this assessment attempt + question.</small><textarea disabled={expired} value={notes[current.question.id] || ""} onChange={(event) => { setSavedNoteId(null); setNotes((value) => ({ ...value, [current.question.id]: event.target.value })); }} placeholder="Save a private note for this question…" /><button type="button" disabled={expired || savingNoteId === current.question.id} onClick={() => void saveNote()}><FiSave /> {savingNoteId === current.question.id ? "Saving…" : savedNoteId === current.question.id ? "Saved" : "Save note"}</button></div></section></div>
        </section>
        <aside className="exam-overview-card"><header><b>Exam Overview</b></header><section className="overview-time"><small>Time remaining</small><strong>{hideTime ? "••:••:••" : clock}</strong><button type="button" onClick={() => setHideTime((value) => !value)}><FiEyeOff /> {hideTime ? "Show" : "Hide"}</button></section><dl><div className="answered"><dt>Answered</dt><dd>{blockAnswered} / {blockItems.length} <small>{progress}%</small></dd></div><div className="normal-flagged"><dt>Flagged</dt><dd>{blockItems.filter((item) => flags.includes(item.question.id)).length}</dd></div><div className="flagged"><dt>Hard questions</dt><dd>{blockItems.filter((item) => hardFlags.includes(item.question.id)).length}</dd></div><div className="unanswered"><dt>Unanswered</dt><dd>{unanswered}</dd></div></dl><section className="overview-pace"><span><small>Your pace</small><b>{pace}</b></span><Progress value={Math.min(100, Math.max(0, progress))} /></section><section className="overview-legend"><b>Question status legend</b><span className="answered">Answered</span><span className="unanswered">Unanswered</span><span className="current">Current question</span><span className="normal-flagged">Flagged</span><span className="flagged">Hard question</span></section><section className="overview-lock"><FiFileText /><p>{tutor ? "Tutor explanations appear after the server confirms each saved answer." : "Explanations are hidden during the exam. You will see detailed explanations after submission."}</p></section></aside>
      </div>
      <footer className="exam-session-footer"><button type="button" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}><FiArrowLeft /> Previous</button><b>Question {questionInBlock} of {blockItems.length}</b><div><button type="button" className="end" disabled={submitting} onClick={endBlock}>{expired ? (submitting ? "Submitting…" : "Retry submission") : tutor ? "End practice" : blockIndex === blockCount - 1 ? "Submit exam" : "End block"}</button><button type="button" className="next" disabled={index === items.length - 1 || Boolean(pendingAnswers[current.question.id] && !confidence[current.question.id])} onClick={() => setIndex((value) => Math.min(items.length - 1, value + 1))}>Next question <FiArrowRight /></button></div></footer>
    </> : <Panel title="No questions"><p>This assessment contains no accessible questions.</p></Panel>}

  </main></ProductShell>;
}
