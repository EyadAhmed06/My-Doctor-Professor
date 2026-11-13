"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import { TutorOptionReview } from "./tutor-option-review";
import "./assessment-session.css";

type HighlightRange = { start: number; end: number; color?: "yellow" | "green" | "blue" | "pink" };
type HighlightState = Record<string, { stem?: HighlightRange[]; options?: Record<string, HighlightRange[]> }>;
type DrawingState = Record<string, Array<{ color?: string; points: Array<{ x: number; y: number }> }>>;
type SavedAnnotationPayload = { highlights?: HighlightState; struck?: Record<string,string[]>; drawings?: DrawingState };
type SavedWorkspace = { notes: Array<{question_id:string;note:string}> };

function RestoredHighlights({ text, ranges = [] }: { text: string; ranges?: HighlightRange[] }) {
  const valid = [...ranges]
    .filter(range => Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end) && range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const range of valid) {
    const start = Math.max(cursor, Math.min(text.length, range.start));
    const end = Math.min(text.length, range.end);
    if (end <= start) continue;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(<mark key={parts.length} className={`exam-text-highlight highlight-${range.color || "yellow"}`}>{text.slice(start, end)}</mark>);
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

type ReviewOption = {
  id: string;
  optionText: string;
  displayOrder: number;
  isCorrect?: boolean;
  explanation?: string | null;
};

type ReviewQuestion = {
  id: string;
  questionText: string;
  questionType: "MCQ" | "ESSAY";
  explanation?: string | null;
  options: ReviewOption[];
};

type ReviewAssignment = {
  questionId: string;
  question: ReviewQuestion;
  answer: { selectedOptionId: string | null; isCorrect: boolean | null } | null;
};

type Review = {
  attempt: {
    id: string;
    status: string;
    testMode: "TUTOR" | "TIMED";
    test?: { title?: string | null };
  };
  questions: ReviewAssignment[];
};

export function AssessmentReview({ attemptId, source = "assessments" }: { attemptId: string; source?: string }) {
  const { user, request } = useAuth();
  const router = useRouter();
  const forensicCode = user?.forensic_code || user?.forensicCode;
  const [review, setReview] = useState<Review | null>(null);
  const [annotations, setAnnotations] = useState<SavedAnnotationPayload>({});
  const [notes, setNotes] = useState<Record<string,string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    void Promise.all([
      request<Review>(`/tests/attempts/${attemptId}/review`),
      request<{payload:SavedAnnotationPayload}>(`/tests/attempts/${attemptId}/annotations`),
      request<SavedWorkspace>(`/tests/attempts/${attemptId}/workspace-state`),
    ]).then(([value, savedAnnotations, workspace]) => {
      if (!active) return;
      setReview(value);
      setAnnotations(savedAnnotations.payload || {});
      setNotes(Object.fromEntries((workspace.notes || []).map(item => [item.question_id, item.note])));
    }).catch(cause => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Unable to load assessment review.");
    });
    return () => { active = false; };
  }, [attemptId, request]);

  const exitPath = source === "rounds" ? "/rounds" : source === "past-exams" ? "/past-exams" : "/assessments";

  if (error) {
    return <ProductShell><Panel title="Could not load review"><p>{error}</p><button className="pp-button" type="button" onClick={() => window.location.reload()}>Retry</button></Panel></ProductShell>;
  }
  if (!review) return <ProductShell><div className="product-auth-loading">Loading assessment review…</div></ProductShell>;

  return <ProductShell><main className="pp-page exam-session-page"><Panel title="Assessment submitted" className="exam-review-panel">
    <h2>{review.attempt.test?.title || "Assessment complete"}</h2>
    <p>Your submitted answers and saved annotations are shown below.</p>
    {review.questions.map((item, index) => {
      const selectedOption = item.question.options.find((option) => option.id === item.answer?.selectedOptionId);
      const correctOption = item.question.options.find((option) => option.isCorrect);
      const resultLabel = item.answer?.isCorrect === true ? "Correct" : item.answer?.isCorrect === false ? "Incorrect" : "Not answered / pending grading";
      const optionFeedback = item.question.options.map((option) => ({ id: option.id, explanation: option.explanation }));
      const structuredFeedback = correctOption ? {
        is_correct: item.answer?.isCorrect ?? null,
        question_explanation: item.question.explanation,
        selected_option: selectedOption ? { id: selectedOption.id, explanation: selectedOption.explanation } : null,
        correct_option: { id: correctOption.id, explanation: correctOption.explanation },
        options: optionFeedback,
      } : null;

      return <article className={`review-answer ${item.answer?.isCorrect === true ? "correct" : item.answer?.isCorrect === false ? "incorrect" : ""}`} key={item.question.id}>
        <b>{index + 1}{forensicCode ? ` · ${forensicCode}` : ""}. <RestoredHighlights text={item.question.questionText} ranges={annotations.highlights?.[item.question.id]?.stem} /></b>
        <strong>{resultLabel}</strong>
        {selectedOption && <p><span>Your answer:</span> <RestoredHighlights text={selectedOption.optionText} ranges={annotations.highlights?.[item.question.id]?.options?.[selectedOption.id]} /></p>}
        {correctOption && item.answer?.isCorrect !== true && <p><span>Correct answer:</span> {correctOption.optionText}</p>}
        <div className="review-explanation"><b>Explanation</b><p>{item.question.explanation || "No explanation has been published for this question."}</p></div>
        {structuredFeedback && item.question.options.length >= 4 && item.question.options.length <= 5 && <TutorOptionReview feedback={structuredFeedback} options={item.question.options} />}
        {notes[item.question.id] && <div className="review-explanation"><b>Your saved note</b><p style={{whiteSpace:"pre-wrap"}}>{notes[item.question.id]}</p></div>}
        {(annotations.drawings?.[item.question.id] || []).length > 0 && <div className="review-explanation"><b>Your saved pen marks</b><svg aria-label="Saved pen markings" viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{width:"100%",height:150}}>
          {annotations.drawings![item.question.id].map((stroke, i) => <polyline key={i} fill="none" stroke={stroke.color || "red"} strokeWidth={3} points={stroke.points.map(point => `${point.x},${point.y}`).join(" ")} />)}
        </svg></div>}
        {(annotations.struck?.[item.question.id] || []).length > 0 && <div className="review-explanation"><b>Crossed-out options</b><ul>{item.question.options.filter(option => annotations.struck?.[item.question.id]?.includes(option.id)).map(option => <li key={option.id}><s>{option.optionText}</s></li>)}</ul></div>}
      </article>;
    })}
    <button className="pp-button" type="button" onClick={() => router.push(exitPath)}>Back</button>
  </Panel></main></ProductShell>;
}
