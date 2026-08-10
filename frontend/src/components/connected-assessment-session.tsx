"use client";

import { useAuth } from "./auth-provider";
import { Panel, ProductShell, Progress } from "./product-shell";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiClock,
  FiEyeOff,
  FiFileText,
  FiFlag,
  FiMoreVertical,
  FiSave,
} from "react-icons/fi";
import { useRouter } from "next/navigation";
import { getQuestionVisual } from "./medical-image-assets";
import "./assessment-session.css";

type Option = { id: string; optionText: string; displayOrder: number };
type Question = { id: string; questionText: string; questionType: "MCQ" | "ESSAY"; options: Option[] };
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
type Answer = { questionId: string; selectedOptionId: string | null; isCorrect?: boolean | null };
type WorkspaceState = {
  attempt: Attempt;
  answers: Answer[];
  flagged_question_ids: string[];
  notes: Array<{ question_id: string; note: string }>;
};
type TutorFeedback = { isCorrect: boolean | null; explanation?: string | null };
type Review = { attempt: Attempt; questions: Array<Assignment & { answer: { selectedOptionId: string | null; isCorrect: boolean | null } | null }> };
type LowerTab = "scratchpad" | "patient" | "note";

const BLOCK_SIZE = 40;

function formatPace(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}/question`;
}

export function ConnectedAssessmentSession({ attemptId, testId, source = "assessments" }: { attemptId: string; testId: string; source?: string }) {
  const { request } = useAuth();
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [items, setItems] = useState<Assignment[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, TutorFeedback>>({});
  const [struck, setStruck] = useState<Record<string, string[]>>({});
  const [strikeMode, setStrikeMode] = useState(false);
  const [scratchpad, setScratchpad] = useState("");
  const [lowerTab, setLowerTab] = useState<LowerTab>("scratchpad");
  const [review, setReview] = useState<Review | null>(null);
  const [visualOpen, setVisualOpen] = useState(false);
  const [hideTime, setHideTime] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const autoSubmitStarted = useRef(false);

  useEffect(() => {
    if (!attemptId || !testId) return;
    let active = true;
    void Promise.all([
      request<WorkspaceState>(`/tests/attempts/${attemptId}/workspace-state`),
      request<Assignment[]>(`/tests/${testId}/questions`),
    ])
      .then(([state, questions]) => {
        if (!active) return;
        setAttempt(state.attempt);
        setItems(questions);
        setAnswers(Object.fromEntries(state.answers.filter((item) => item.selectedOptionId).map((item) => [item.questionId, item.selectedOptionId!])));
        setFlags(state.flagged_question_ids);
        setNotes(Object.fromEntries(state.notes.map((item) => [item.question_id, item.note])));
        try {
          setScratchpad(sessionStorage.getItem(`mdp:scratchpad:${attemptId}`) || "");
        } catch {
          setScratchpad("");
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load this attempt.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attemptId, testId, request]);

  useEffect(() => {
    if (!attempt?.deadline) {
      setNow(Date.now());
      return;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [attempt?.deadline]);

  useEffect(() => {
    try {
      sessionStorage.setItem(`mdp:scratchpad:${attemptId}`, scratchpad);
    } catch {
      // Scratchpad persistence is best-effort.
    }
  }, [attemptId, scratchpad]);

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
  const secondsLeft = attempt?.deadline && now !== null ? Math.max(0, Math.floor((new Date(attempt.deadline).getTime() - now) / 1000)) : null;
  const clock = secondsLeft === null ? "Untimed" : `${String(Math.floor(secondsLeft / 3600)).padStart(2, "0")}:${String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;
  const tutor = attempt?.testMode === "TUTOR" || source === "rounds";
  const expired = attempt?.testMode === "TIMED" && secondsLeft === 0;
  const elapsedSeconds = attempt?.startedAt && now !== null ? Math.max(0, Math.floor((now - new Date(attempt.startedAt).getTime()) / 1000)) : 0;
  const pace = totalAnswered ? formatPace(elapsedSeconds / totalAnswered) : "—";

  async function choose(optionId: string) {
    if (!current || expired || Boolean(tutor && feedback[current.question.id])) return;
    const questionId = current.question.id;
    const previous = answers[questionId];

    // Optimistic selection: the answer visibly selects immediately, while persistence runs.
    setAnswers((value) => ({ ...value, [questionId]: optionId }));
    setSavingQuestionId(questionId);
    setError(null);
    try {
      const result = await request<Answer & TutorFeedback>(`/tests/attempts/${attemptId}/answers/${questionId}`, {
        method: "PUT",
        body: { selected_option_id: optionId },
      });
      if (tutor) {
        setFeedback((value) => ({
          ...value,
          [questionId]: { isCorrect: result.isCorrect ?? null, explanation: result.explanation },
        }));
      }
    } catch (cause) {
      setAnswers((value) => {
        const next = { ...value };
        if (previous) next[questionId] = previous;
        else delete next[questionId];
        return next;
      });
      setError(cause instanceof Error ? cause.message : "Unable to save this answer.");
    } finally {
      setSavingQuestionId(null);
    }
  }

  async function toggleFlag() {
    if (!current || expired) return;
    const active = flags.includes(current.question.id);
    try {
      await request(`/tests/attempts/${attemptId}/flags/${current.question.id}`, { method: active ? "DELETE" : "POST" });
      setFlags((value) => (active ? value.filter((id) => id !== current.question.id) : [...value, current.question.id]));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the flag.");
    }
  }

  async function saveNote() {
    if (!current || expired) return;
    const value = notes[current.question.id]?.trim() || "";
    try {
      if (value) await request(`/tests/attempts/${attemptId}/notes/${current.question.id}`, { method: "PUT", body: { note: value } });
      else if (notes[current.question.id] !== undefined) await request(`/tests/attempts/${attemptId}/notes/${current.question.id}`, { method: "DELETE" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the note.");
    }
  }

  function toggleStrike(optionId: string) {
    if (!current || expired) return;
    const questionId = current.question.id;
    setStruck((value) => {
      const currentIds = value[questionId] || [];
      return {
        ...value,
        [questionId]: currentIds.includes(optionId) ? currentIds.filter((id) => id !== optionId) : [...currentIds, optionId],
      };
    });
  }

  const finalize = useCallback(
    async (auto = false) => {
      if (!auto && !window.confirm(`Submit this assessment with ${totalAnswered} of ${items.length} questions answered?`)) return;
      setSubmitting(true);
      setError(null);
      try {
        await request(`/tests/attempts/${attemptId}/submit`, { method: "POST" });
        setReview(await request<Review>(`/tests/attempts/${attemptId}/review`));
      } catch (cause) {
        if (auto) {
          try {
            setReview(await request<Review>(`/tests/attempts/${attemptId}/review`));
            return;
          } catch {
            // The server may still be finalizing. Keep the attempt locked for retry.
          }
        }
        setError(cause instanceof Error ? cause.message : "Unable to submit the assessment.");
      } finally {
        setSubmitting(false);
      }
    },
    [attemptId, items.length, request, totalAnswered],
  );

  function endBlock() {
    if (tutor || blockIndex === blockCount - 1) {
      void finalize(Boolean(expired));
      return;
    }
    const remaining = blockItems.length - blockAnswered;
    if (remaining > 0 && !window.confirm(`This block still has ${remaining} unanswered question${remaining === 1 ? "" : "s"}. Move to the next block?`)) return;
    setIndex((blockIndex + 1) * BLOCK_SIZE);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    if (!expired || review || autoSubmitStarted.current) return;
    autoSubmitStarted.current = true;
    void finalize(true);
  }, [expired, finalize, review]);

  const exitPath = source === "rounds" ? "/rounds" : "/past-exams";

  if (!attemptId || !testId) {
    return <ProductShell><div className="product-auth-loading">Missing attempt information. Start an assessment from Questions or Past Exams.</div></ProductShell>;
  }

  return (
    <ProductShell search="Search cases, topics, or concepts">
      <main className={`pp-page exam-session-page ${tutor ? "is-tutor" : "is-timed"}`}>
        {error && <p className="form-error exam-session-error" role="alert">{error}</p>}
        {expired && !review && <p className="form-success exam-session-error" role="status">Time expired. Answers are locked while the server finalizes this assessment.</p>}

        {loading ? (
          <div className="product-auth-loading">Loading assessment…</div>
        ) : review ? (
          <Panel title="Assessment submitted" className="exam-review-panel">
            <h2>{review.attempt.test?.title || "Assessment complete"}</h2>
            <p>Your submitted answers are saved. Review is shown below.</p>
            {review.questions.map((item, i) => (
              <article className="review-answer" key={item.question.id}>
                <b>{i + 1}. {item.question.questionText}</b>
                <p>{item.answer?.isCorrect === true ? "Correct" : item.answer?.isCorrect === false ? "Incorrect" : "Not answered / pending grading"}</p>
              </article>
            ))}
            <button className="pp-button" type="button" onClick={() => router.push(exitPath)}>Back</button>
          </Panel>
        ) : current ? (
          <>
            <section className="exam-command-strip" aria-label="Exam status">
              <button className="exam-exit" type="button" onClick={() => router.push(exitPath)}><FiArrowLeft /> Exit {tutor ? "practice" : "exam"}</button>
              <div><small>Exam</small><b>{attempt?.test?.title || (tutor ? "40 Question Practice" : "Mock Exam")}</b></div>
              <div><small>Mode</small><b>{tutor ? "Tutor" : "Timed"}</b></div>
              <div><small>Scope</small><b>{source === "rounds" ? "Selected lectures" : attempt?.test?.testType || "Configured exam"}</b></div>
              <div><small>Block</small><b>Block {blockIndex + 1} of {blockCount}</b></div>
              <div className="exam-time-cell"><small>Time remaining</small><b><FiClock /> {hideTime ? "••:••:••" : clock}</b></div>
              <div><small>Progress</small><b>Question {questionInBlock} of {blockItems.length}</b><Progress value={progress} /></div>
            </section>

            <div className="exam-workspace-grid">
              <aside className="exam-navigator-card">
                <header><FiFileText /><b>Question Navigator</b></header>
                <div className="exam-mini-legend"><span className="answered">Answered</span><span className="unanswered">Unanswered</span><span className="current">Current</span><span className="flagged">Flagged</span></div>
                <div className="exam-number-grid">
                  {blockItems.map((item, i) => {
                    const globalIndex = blockStart + i;
                    const isCurrent = globalIndex === index;
                    const isAnswered = Boolean(answers[item.question.id]);
                    const isFlagged = flags.includes(item.question.id);
                    return (
                      <button
                        type="button"
                        className={`${isAnswered ? "answered" : "unanswered"} ${isCurrent ? "current" : ""} ${isFlagged ? "flagged" : ""}`}
                        onClick={() => setIndex(globalIndex)}
                        key={item.question.id}
                        aria-label={`Question ${i + 1}${isAnswered ? ", answered" : ", unanswered"}${isFlagged ? ", flagged" : ""}`}
                      >
                        {i + 1}{isFlagged && <FiFlag />}
                      </button>
                    );
                  })}
                </div>
                <footer>
                  <b>Block progress</b>
                  <Progress value={progress} />
                  <span><small>{blockAnswered}/{blockItems.length} answered</small><strong>{progress}%</strong></span>
                </footer>
              </aside>

              <section className="exam-main-column">
                <article className="exam-question-card">
                  <div className="exam-question-toolbar">
                    <div><span>{tutor ? "Tutor" : "Timed"}</span><span>MCQ</span></div>
                    <div>
                      <button type="button" className={flags.includes(current.question.id) ? "active" : ""} disabled={expired} onClick={() => void toggleFlag()}><FiFlag /> Flag</button>
                      <button type="button" className={strikeMode ? "active" : ""} disabled={expired} onClick={() => setStrikeMode((value) => !value)}>S̶ Strike out</button>
                      <button type="button" onClick={() => document.getElementById("exam-lab-preview")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}>⚗ Lab values</button>
                      <button type="button" onClick={() => setLowerTab("note")}>▣ Notes</button>
                      <button type="button" aria-label="More question actions"><FiMoreVertical /></button>
                    </div>
                  </div>

                  {questionVisual && (
                    <>
                      <button type="button" className={`question-visual question-visual--${questionVisual.specialty}`} onClick={() => setVisualOpen(true)} aria-label={`Open larger ${questionVisual.specialty} illustration`}>
                        <img src={questionVisual.src} alt={questionVisual.alt} />
                        <span>{questionVisual.specialty} · open image</span>
                      </button>
                      {visualOpen && (
                        <div className="question-visual-modal" role="dialog" aria-modal="true" aria-label={questionVisual.alt} onClick={() => setVisualOpen(false)}>
                          <button type="button" aria-label="Close image" onClick={() => setVisualOpen(false)}>×</button>
                          <img src={questionVisual.src} alt={questionVisual.alt} />
                        </div>
                      )}
                    </>
                  )}

                  <h1>{current.question.questionText}</h1>
                  <div className="exam-answer-list" role="radiogroup" aria-label={`Answers for question ${index + 1}`}>
                    {current.question.options.map((option, i) => {
                      const selected = answers[current.question.id] === option.id;
                      const crossed = (struck[current.question.id] || []).includes(option.id);
                      return (
                        <div className={`exam-answer-row ${selected ? "selected" : ""} ${crossed ? "struck" : ""}`} key={option.id}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={expired || Boolean(tutor && feedback[current.question.id])}
                            onClick={() => void choose(option.id)}
                          >
                            <b>{String.fromCharCode(65 + i)}</b>
                            <span>{option.optionText}</span>
                            {savingQuestionId === current.question.id && selected ? <small>Saving…</small> : selected ? <FiCheck /> : null}
                          </button>
                          <button
                            type="button"
                            className="exam-strike-toggle"
                            aria-label={`${crossed ? "Restore" : "Strike out"} option ${String.fromCharCode(65 + i)}`}
                            aria-pressed={crossed}
                            disabled={expired}
                            onClick={() => toggleStrike(option.id)}
                          >
                            S̶
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {tutor && feedback[current.question.id] && (
                    <div className={`tutor-explanation ${feedback[current.question.id].isCorrect ? "correct" : "incorrect"}`}>
                      <b>{feedback[current.question.id].isCorrect ? "Correct answer" : "Review this answer"}</b>
                      <p>{feedback[current.question.id].explanation || "No explanation has been published for this question."}</p>
                    </div>
                  )}
                </article>

                <div className="exam-lower-grid">
                  <section className="exam-scratchpad-card">
                    <nav>
                      <button type="button" className={lowerTab === "scratchpad" ? "active" : ""} onClick={() => setLowerTab("scratchpad")}>Scratchpad</button>
                      <button type="button" className={lowerTab === "patient" ? "active" : ""} onClick={() => setLowerTab("patient")}>Patient summary</button>
                      <button type="button" className={lowerTab === "note" ? "active" : ""} onClick={() => setLowerTab("note")}>Question note</button>
                    </nav>
                    {lowerTab === "scratchpad" ? (
                      <div><textarea value={scratchpad} onChange={(event) => setScratchpad(event.target.value)} placeholder="Use this space for notes or quick calculations…" /><button type="button" onClick={() => setScratchpad("")}>Clear</button></div>
                    ) : lowerTab === "patient" ? (
                      <div className="exam-empty-context"><p>No structured patient summary is attached to this question.</p></div>
                    ) : (
                      <div><textarea disabled={expired} value={notes[current.question.id] || ""} onChange={(event) => setNotes((value) => ({ ...value, [current.question.id]: event.target.value }))} placeholder="Save a private note for this question…" /><button type="button" disabled={expired} onClick={() => void saveNote()}><FiSave /> Save note</button></div>
                    )}
                  </section>

                  <section className="exam-lab-preview" id="exam-lab-preview">
                    <header><span>⚗</span><b>Lab values (preview)</b><button type="button">View all</button></header>
                    <div className="exam-empty-context"><p>No structured lab values are attached to this question.</p></div>
                  </section>
                </div>
              </section>

              <aside className="exam-overview-card">
                <header><b>Exam Overview</b></header>
                <section className="overview-time"><small>Time remaining</small><strong>{hideTime ? "••:••:••" : clock}</strong><button type="button" onClick={() => setHideTime((value) => !value)}><FiEyeOff /> {hideTime ? "Show" : "Hide"}</button></section>
                <dl>
                  <div className="answered"><dt>Answered</dt><dd>{blockAnswered} / {blockItems.length} <small>{progress}%</small></dd></div>
                  <div className="flagged"><dt>Flagged</dt><dd>{blockItems.filter((item) => flags.includes(item.question.id)).length}</dd></div>
                  <div className="unanswered"><dt>Unanswered</dt><dd>{unanswered}</dd></div>
                </dl>
                <section className="overview-pace"><span><small>Your pace</small><b>{pace}</b></span><Progress value={Math.min(100, Math.max(0, progress))} /></section>
                <section className="overview-legend"><b>Question status legend</b><span className="answered">Answered</span><span className="unanswered">Unanswered</span><span className="current">Current question</span><span className="flagged">Flagged</span></section>
                <section className="overview-lock"><FiFileText /><p>{tutor ? "Tutor explanations appear after you answer each question." : "Explanations are hidden during the exam. You will see detailed explanations after submission."}</p></section>
              </aside>
            </div>

            <footer className="exam-session-footer">
              <button type="button" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}><FiArrowLeft /> Previous</button>
              <b>Question {questionInBlock} of {blockItems.length}</b>
              <div>
                <button type="button" className="end" disabled={submitting} onClick={endBlock}>{expired ? (submitting ? "Submitting…" : "Retry submission") : tutor ? "End practice" : blockIndex === blockCount - 1 ? "Submit exam" : "End block"}</button>
                <button type="button" className="next" disabled={questionInBlock === blockItems.length} onClick={() => setIndex((value) => value + 1)}>Next question <FiArrowRight /></button>
              </div>
            </footer>
          </>
        ) : (
          <Panel title="No questions"><p>This assessment contains no accessible questions.</p></Panel>
        )}
      </main>
    </ProductShell>
  );
}
