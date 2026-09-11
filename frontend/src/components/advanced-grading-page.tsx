"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheckCircle,
  FiChevronRight,
  FiClipboard,
  FiEdit3,
  FiFilter,
  FiRefreshCw,
  FiSave,
  FiSearch,
} from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { EmptyState, ErrorState, PageSkeleton } from "./async-state";
import { Panel, ProductShell, Progress } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";
import "./role-workspace.css";

type PageResponse<T> = { data: T[] };
type Test = { id: string; title: string; isPublished: boolean; testType: string; course?: { courseName?: string } | null };
type Attempt = {
  id: string;
  status: string;
  score: string | null;
  submittedAt?: string | null;
  submitted_at?: string | null;
  student?: { user?: { fullName?: string; email?: string }; studentNumber?: string };
};
type Question = { id: string; title: string | null; questionText: string; marks: string; questionType: "MCQ" | "ESSAY" };
type Answer = {
  id: string;
  questionId?: string;
  essayAnswer?: string | null;
  essay_answer?: string | null;
  awardedMarks?: string | null;
  awarded_marks?: string | null;
  gradingFeedback?: string | null;
  grading_feedback?: string | null;
  question?: Question;
};
type AnswerFilter = "ALL" | "PENDING" | "GRADED" | "ESSAY" | "OBJECTIVE";

type GradeDraft = { awarded_marks: number; feedback: string };

function studentLabel(attempt: Attempt) {
  return attempt.student?.user?.fullName || attempt.student?.user?.email || attempt.student?.studentNumber || "Student";
}
function essayText(answer: Answer) {
  return answer.essayAnswer || answer.essay_answer || "";
}
function awarded(answer: Answer) {
  const value = answer.awardedMarks ?? answer.awarded_marks;
  return value === null || value === undefined ? null : Number(value);
}
function feedback(answer: Answer) {
  return answer.gradingFeedback || answer.grading_feedback || "";
}
function isEssay(answer: Answer) {
  return Boolean(essayText(answer)) || answer.question?.questionType === "ESSAY";
}

function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = normalized.includes("graded") || normalized.includes("complete") || normalized.includes("submitted") ? "good" : normalized.includes("pending") || normalized.includes("progress") ? "pending" : "bad";
  return <span className={`role-status ${tone}`}>{value.replaceAll("_", " ")}</span>;
}

export function AdvancedGradingPage({ admin = false }: { admin?: boolean }) {
  const { user, request } = useAuth();
  const { notify, celebrate } = useUx();
  const [tests, setTests] = useState<Test[]>([]);
  const [selectedTestId, setSelectedTestId] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [selectedAnswerId, setSelectedAnswerId] = useState("");
  const [grade, setGrade] = useState<GradeDraft>({ awarded_marks: 0, feedback: "" });
  const [attemptSearch, setAttemptSearch] = useState("");
  const [attemptStatus, setAttemptStatus] = useState("");
  const [answerFilter, setAnswerFilter] = useState<AnswerFilter>("PENDING");
  const [answerSearch, setAnswerSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [loadingAnswers, setLoadingAnswers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTests = useCallback(async () => {
    if (!user || user.role === "STUDENT") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await request<PageResponse<Test>>("/tests?limit=100");
      setTests(response.data);
      setSelectedTestId((current) => current && response.data.some((test) => test.id === current) ? current : response.data[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load assessments.");
    } finally {
      setLoading(false);
    }
  }, [request, user]);

  const loadAttempts = useCallback(async (testId: string) => {
    setLoadingAttempts(true);
    setError(null);
    try {
      const rows = await request<Attempt[]>(`/tests/${testId}/attempts`);
      setAttempts(rows);
      setSelectedAttemptId((current) => current && rows.some((attempt) => attempt.id === current) ? current : rows[0]?.id || "");
    } catch (cause) {
      setAttempts([]);
      setSelectedAttemptId("");
      setError(cause instanceof Error ? cause.message : "Unable to load attempts.");
    } finally {
      setLoadingAttempts(false);
    }
  }, [request]);

  const loadAnswers = useCallback(async (attemptId: string) => {
    setLoadingAnswers(true);
    setError(null);
    try {
      const rows = await request<Answer[]>(`/tests/attempts/${attemptId}/answers`);
      setAnswers(rows);
      const firstPending = rows.find((answer) => isEssay(answer) && awarded(answer) === null);
      setSelectedAnswerId((current) => current && rows.some((answer) => answer.id === current) ? current : firstPending?.id || rows.find(isEssay)?.id || rows[0]?.id || "");
    } catch (cause) {
      setAnswers([]);
      setSelectedAnswerId("");
      setError(cause instanceof Error ? cause.message : "Unable to load answers.");
    } finally {
      setLoadingAnswers(false);
    }
  }, [request]);

  useEffect(() => { void loadTests(); }, [loadTests]);
  useEffect(() => {
    setAttempts([]);
    setSelectedAttemptId("");
    setAnswers([]);
    setSelectedAnswerId("");
    if (selectedTestId) void loadAttempts(selectedTestId);
  }, [loadAttempts, selectedTestId]);
  useEffect(() => {
    setAnswers([]);
    setSelectedAnswerId("");
    if (selectedAttemptId) void loadAnswers(selectedAttemptId);
  }, [loadAnswers, selectedAttemptId]);

  const selectedTest = tests.find((test) => test.id === selectedTestId) || null;
  const selectedAttempt = attempts.find((attempt) => attempt.id === selectedAttemptId) || null;
  const selectedAnswer = answers.find((answer) => answer.id === selectedAnswerId) || null;

  useEffect(() => {
    if (!selectedAnswer) return;
    setGrade({ awarded_marks: awarded(selectedAnswer) ?? 0, feedback: feedback(selectedAnswer) });
  }, [selectedAnswer]);

  const filteredAttempts = useMemo(() => {
    const needle = attemptSearch.trim().toLowerCase();
    return attempts.filter((attempt) => (!attemptStatus || attempt.status === attemptStatus) && (!needle || studentLabel(attempt).toLowerCase().includes(needle)));
  }, [attemptSearch, attempts, attemptStatus]);

  const filteredAnswers = useMemo(() => {
    const needle = answerSearch.trim().toLowerCase();
    return answers.filter((answer) => {
      const pending = isEssay(answer) && awarded(answer) === null;
      const graded = isEssay(answer) && awarded(answer) !== null;
      const typeMatch = answerFilter === "ALL" || (answerFilter === "PENDING" && pending) || (answerFilter === "GRADED" && graded) || (answerFilter === "ESSAY" && isEssay(answer)) || (answerFilter === "OBJECTIVE" && !isEssay(answer));
      const text = `${answer.question?.title || ""} ${answer.question?.questionText || ""} ${essayText(answer)}`.toLowerCase();
      return typeMatch && (!needle || text.includes(needle));
    });
  }, [answerFilter, answerSearch, answers]);

  const essayAnswers = answers.filter(isEssay);
  const pendingAnswers = essayAnswers.filter((answer) => awarded(answer) === null);
  const gradedAnswers = essayAnswers.filter((answer) => awarded(answer) !== null);
  const progress = essayAnswers.length ? Math.round(gradedAnswers.length * 100 / essayAnswers.length) : 100;
  const selectedVisibleIndex = filteredAnswers.findIndex((answer) => answer.id === selectedAnswerId);
  const maxMarks = Number(selectedAnswer?.question?.marks || 0);
  const gradeInvalid = !selectedAnswer || !isEssay(selectedAnswer) || grade.awarded_marks < 0 || (maxMarks > 0 && grade.awarded_marks > maxMarks);

  function selectAnswer(answer: Answer) {
    setSelectedAnswerId(answer.id);
  }

  function moveVisible(direction: -1 | 1) {
    if (!filteredAnswers.length) return;
    const index = selectedVisibleIndex < 0 ? 0 : selectedVisibleIndex;
    const next = Math.max(0, Math.min(filteredAnswers.length - 1, index + direction));
    selectAnswer(filteredAnswers[next]);
  }

  function nextPendingAfter(answerId: string) {
    const index = answers.findIndex((answer) => answer.id === answerId);
    return [...answers.slice(index + 1), ...answers.slice(0, index)].find((answer) => isEssay(answer) && awarded(answer) === null) || null;
  }

  async function saveGrade(event?: FormEvent, advance = false) {
    event?.preventDefault();
    if (!selectedAnswer || !selectedAttemptId || gradeInvalid || saving) return;
    const currentAnswerId = selectedAnswer.id;
    setSaving(true);
    try {
      await request(`/tests/attempts/${selectedAttemptId}/answers/${selectedAnswer.id}/grade`, {
        method: "PUT",
        body: { awarded_marks: Number(grade.awarded_marks), feedback: grade.feedback.trim() || undefined },
      });
      const refreshed = await request<Answer[]>(`/tests/attempts/${selectedAttemptId}/answers`);
      setAnswers(refreshed);
      const remaining = refreshed.filter((answer) => isEssay(answer) && awarded(answer) === null);
      const next = advance ? (() => {
        const currentIndex = refreshed.findIndex((answer) => answer.id === currentAnswerId);
        return [...refreshed.slice(currentIndex + 1), ...refreshed.slice(0, currentIndex)].find((answer) => isEssay(answer) && awarded(answer) === null) || null;
      })() : refreshed.find((answer) => answer.id === currentAnswerId) || null;
      if (next) setSelectedAnswerId(next.id);
      notify({ title: "Essay grade saved", description: advance && next ? "Moved to the next pending essay." : remaining.length ? `${remaining.length} essay${remaining.length === 1 ? "" : "s"} still pending.` : "This attempt has no pending essays.", tone: "success" });
      if (!remaining.length && essayAnswers.length) celebrate({ id: `attempt-grading-complete-${selectedAttemptId}`, title: "Attempt grading complete", description: `All ${essayAnswers.length} essay answers were graded.`, points: 20 });
    } catch (cause) {
      notify({ title: "Could not save grade", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const pendingAfterCurrent = selectedAnswer ? nextPendingAfter(selectedAnswer.id) : null;

  return <ProductShell search="Search attempts and essay answers"><main className="pp-page role-workspace advanced-grading-page">
    <div className="pp-title hero role-heading"><div><small className="page-eyebrow">{admin ? "ADMIN · GRADING OVERSIGHT" : "INSTRUCTOR · GRADING DESK"}</small><h1>Essay grading queue</h1><p>Filter assessments and attempts, move through pending essays, enforce mark boundaries, and finish each queue deliberately.</p></div><button className="pp-button secondary" type="button" onClick={() => void loadTests()}><FiRefreshCw /> Refresh</button></div>

    {user?.role === "STUDENT" ? <Panel title="Instructor access required"><p>This grading workspace is available to instructors and system administrators.</p></Panel> : error ? <ErrorState description={error} onRetry={() => void loadTests()} /> : loading ? <PageSkeleton variant="workspace" label="Loading grading desk" /> : !tests.length ? <EmptyState title="No assessments available" description="Create an assessment before opening the grading queue." /> : <>
      <section className="grading-overview">
        <Panel><label>Assessment<select value={selectedTestId} onChange={(event) => setSelectedTestId(event.target.value)}>{tests.map((test) => <option value={test.id} key={test.id}>{test.title} · {test.testType}</option>)}</select></label><small>{selectedTest?.course?.courseName || "No course"} · {selectedTest?.isPublished ? "Published" : "Draft"}</small></Panel>
        <Panel><span><FiClipboard /></span><div><small>Attempts</small><b>{attempts.length}</b><p>{filteredAttempts.length} visible after filters</p></div></Panel>
        <Panel><span><FiEdit3 /></span><div><small>Pending essays</small><b>{pendingAnswers.length}</b><p>{gradedAnswers.length} graded</p></div></Panel>
        <Panel><span><FiCheckCircle /></span><div><small>Attempt grading</small><b>{progress}%</b><Progress value={progress} /></div></Panel>
      </section>

      <div className="advanced-grading-layout">
        <Panel title="Attempts" className="grading-attempt-column">
          <div className="grading-filter-stack"><div><FiSearch /><input value={attemptSearch} onChange={(event) => setAttemptSearch(event.target.value)} placeholder="Student name or email" /></div><label><FiFilter /><select value={attemptStatus} onChange={(event) => setAttemptStatus(event.target.value)}><option value="">All statuses</option>{[...new Set(attempts.map((attempt) => attempt.status))].map((value) => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}</select></label></div>
          {loadingAttempts ? <PageSkeleton variant="list" label="Loading attempts" /> : filteredAttempts.length ? <div className="grading-attempt-list">{filteredAttempts.map((attempt) => <button className={attempt.id === selectedAttemptId ? "active" : ""} type="button" key={attempt.id} onClick={() => setSelectedAttemptId(attempt.id)}><span><FiClipboard /></span><div><b>{studentLabel(attempt)}</b><small>{attempt.status} · score {attempt.score || "—"}</small><small>{attempt.submittedAt || attempt.submitted_at ? new Date(attempt.submittedAt || attempt.submitted_at || "").toLocaleString() : "Not submitted"}</small></div><FiChevronRight /></button>)}</div> : <EmptyState title="No matching attempts" description={attempts.length ? "Adjust the attempt filters." : "No student has attempted this assessment."} />}
        </Panel>

        <Panel title={`Answers · ${filteredAnswers.length}/${answers.length}`} className="grading-answer-column">
          <div className="grading-answer-filters"><div><FiSearch /><input value={answerSearch} onChange={(event) => setAnswerSearch(event.target.value)} placeholder="Question or response" /></div><select value={answerFilter} onChange={(event) => setAnswerFilter(event.target.value as AnswerFilter)}><option value="PENDING">Pending essays</option><option value="GRADED">Graded essays</option><option value="ESSAY">All essays</option><option value="OBJECTIVE">Objective answers</option><option value="ALL">All answers</option></select></div>
          {loadingAnswers ? <PageSkeleton variant="list" label="Loading answers" /> : filteredAnswers.length ? <div className="grading-answer-list">{filteredAnswers.map((answer, index) => <button className={`${answer.id === selectedAnswerId ? "active" : ""} ${awarded(answer) !== null ? "graded" : ""}`} type="button" key={answer.id} onClick={() => selectAnswer(answer)}><span>{index + 1}</span><div><b>{answer.question?.title || answer.question?.questionText || "Answer"}</b><small>{isEssay(answer) ? "Essay" : "Objective"} · max {answer.question?.marks || "—"}</small></div><Status value={isEssay(answer) ? awarded(answer) === null ? "PENDING" : "GRADED" : "OBJECTIVE"} /></button>)}</div> : <EmptyState title="No answers in this view" description={answers.length ? "Change the answer filters." : "Select a submitted attempt to load its answers."} />}
        </Panel>

        <Panel title="Grade selected answer" className="grading-editor-column">
          {selectedAnswer ? <form className="grading-editor" onSubmit={(event) => void saveGrade(event)}>
            <header><div><Status value={isEssay(selectedAnswer) ? awarded(selectedAnswer) === null ? "PENDING" : "GRADED" : "OBJECTIVE"} /><small>{selectedAttempt ? studentLabel(selectedAttempt) : "Student"}</small></div><div><button type="button" disabled={selectedVisibleIndex <= 0} onClick={() => moveVisible(-1)}><FiArrowLeft /> Previous</button><button type="button" disabled={selectedVisibleIndex < 0 || selectedVisibleIndex >= filteredAnswers.length - 1} onClick={() => moveVisible(1)}>Next <FiArrowRight /></button></div></header>
            <section><small>QUESTION</small><h2>{selectedAnswer.question?.title || "Essay question"}</h2><p>{selectedAnswer.question?.questionText || "Question text unavailable."}</p></section>
            <section className="student-essay-response"><small>STUDENT RESPONSE</small><p>{essayText(selectedAnswer) || "This is an objective response and does not require essay grading."}</p></section>
            {isEssay(selectedAnswer) ? <><div className="grade-fields"><label>Awarded marks <span>0–{maxMarks || "?"}</span><input required min={0} max={maxMarks || undefined} step="0.01" type="number" value={grade.awarded_marks} onChange={(event) => setGrade((current) => ({ ...current, awarded_marks: Number(event.target.value) }))} /></label><label>Feedback<textarea rows={6} value={grade.feedback} onChange={(event) => setGrade((current) => ({ ...current, feedback: event.target.value }))} placeholder="Explain the mark and what to improve" /></label></div>{gradeInvalid && <p className="form-error">Awarded marks must be between 0 and {maxMarks || "the question maximum"}.</p>}<footer><button className="pp-button secondary" type="submit" disabled={saving || gradeInvalid}><FiSave /> {saving ? "Saving…" : "Save grade"}</button><button className="pp-button" type="button" disabled={saving || gradeInvalid || !pendingAfterCurrent} onClick={() => void saveGrade(undefined, true)}><FiCheckCircle /> Save & next pending</button></footer></> : <EmptyState title="No manual grade required" description="Objective answers are calculated by the assessment engine." />}
          </form> : <EmptyState title="Select an answer" description="Choose an attempt and answer to inspect or grade." />}
        </Panel>
      </div>
    </>}
  </main></ProductShell>;
}