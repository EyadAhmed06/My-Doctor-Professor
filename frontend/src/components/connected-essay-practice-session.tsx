"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FiArrowLeft, FiArrowRight, FiCheck, FiEye, FiLock, FiSave } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell, Progress } from "./product-shell";
import { useUx } from "./ux-provider";
import "./essay-practice.css";

type EssayQuestion = {
  question_id: string;
  display_order: number;
  marks: string;
  title: string | null;
  question_text: string;
  lecture: { id: string; title: string; week_number: number };
  minimum_word_count: number | null;
  maximum_word_count: number | null;
  submitted_answer: string | null;
  submitted: boolean;
};
type Workspace = { attempt: { id: string; testId: string; status: string }; questions: EssayQuestion[] };
type ModelAnswer = { question_id: string; model_answer: string; grading_rubric: string | null };

function splitCase(value: string) {
  const marker = "\n\nQUESTION\n";
  if (value.startsWith("CASE\n") && value.includes(marker)) {
    const [caseText, prompt] = value.slice(5).split(marker, 2);
    return { caseText: caseText.trim(), prompt: prompt.trim() };
  }
  return { caseText: "", prompt: value.trim() };
}

export function ConnectedEssayPracticeSession() {
  const { request } = useAuth();
  const { notify } = useUx();
  const params = useSearchParams();
  const attemptId = params.get("attempt") || "";
  const bundleId = params.get("bundle") || "";
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, ModelAnswer>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) { setError("Missing essay practice attempt."); setLoading(false); return; }
    let active = true;
    void request<Workspace>(`/essay-practice/attempts/${attemptId}/workspace`).then((result) => {
      if (!active) return;
      setWorkspace(result);
      setDrafts(Object.fromEntries(result.questions.map((q) => [q.question_id, q.submitted_answer || ""])));
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load essay practice."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attemptId, request]);

  const questions = workspace?.questions || [];
  const current = questions[index];
  const parts = useMemo(() => current ? splitCase(current.question_text) : { caseText: "", prompt: "" }, [current]);
  const submittedCount = questions.filter((question) => question.submitted).length;
  const wordCount = current ? (drafts[current.question_id]?.trim() ? drafts[current.question_id].trim().split(/\s+/).length : 0) : 0;

  async function submit() {
    if (!current || current.submitted || saving) return;
    const value = drafts[current.question_id]?.trim() || "";
    if (!value) { notify({ title: "Write your answer first", description: "Reveal Answer stays locked until your response is submitted.", tone: "info" }); return; }
    setSaving(current.question_id); setError(null);
    try {
      await request(`/essay-practice/attempts/${attemptId}/answers/${current.question_id}`, { method: "PUT", body: { essay_answer: value } });
      setWorkspace((state) => state ? { ...state, questions: state.questions.map((question) => question.question_id === current.question_id ? { ...question, submitted: true, submitted_answer: value } : question) } : state);
      notify({ title: "Essay response submitted", description: "Your response is locked. You can now reveal the published model answer.", tone: "success" });
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Unable to submit essay response."; setError(message); notify({ title: "Essay was not submitted", description: message, tone: "error" }); }
    finally { setSaving(null); }
  }

  async function reveal() {
    if (!current?.submitted || revealing) return;
    if (models[current.question_id]) return;
    setRevealing(current.question_id); setError(null);
    try {
      const result = await request<ModelAnswer>(`/essay-practice/attempts/${attemptId}/questions/${current.question_id}/model-answer`);
      setModels((value) => ({ ...value, [current.question_id]: result }));
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Unable to reveal the model answer."; setError(message); }
    finally { setRevealing(null); }
  }

  return <ProductShell search="Search essay practice">
    <main className="pp-page essay-session-page">
      {loading ? <Panel><p>Loading your essay quiz…</p></Panel> : error && !current ? <Panel title="Unable to open essay practice"><p className="form-error">{error}</p></Panel> : current ? <>
        <header className="essay-session-header"><div><span className="page-eyebrow">10-QUESTION ESSAY PRACTICE</span><h1>{current.title || "Case-based essay"}</h1><p>Week {current.lecture.week_number} · {current.lecture.title}</p></div><div><strong>{submittedCount}/10</strong><span>submitted</span></div></header>
        <Progress value={questions.length ? Math.round(submittedCount / questions.length * 100) : 0}/>
        <div className="essay-session-layout">
          <aside className="essay-question-nav"><h2>Questions</h2><div>{questions.map((question, qIndex) => <button type="button" key={question.question_id} className={`${qIndex === index ? "current" : ""} ${question.submitted ? "done" : ""}`} onClick={() => setIndex(qIndex)}><span>{qIndex + 1}</span>{question.submitted ? <FiCheck/> : null}</button>)}</div><a className="pp-button secondary" href={bundleId ? `/essay-practice?bundle=${encodeURIComponent(bundleId)}` : "/essay-practice"}>Exit practice</a></aside>
          <section className="essay-question-stage">
            {parts.caseText && <article className="essay-case-card"><small>CASE</small><p>{parts.caseText}</p></article>}
            <article className="essay-prompt-card"><small>QUESTION {index + 1} OF {questions.length}</small><h2>{parts.prompt}</h2><div className="essay-answer-meta"><span>{current.marks} marks</span><span>{wordCount} words</span>{current.minimum_word_count ? <span>Minimum {current.minimum_word_count}</span> : null}</div>
              <textarea aria-label="Your essay answer" placeholder="Write your answer here…" value={drafts[current.question_id] || ""} disabled={current.submitted} onChange={(event) => setDrafts((value) => ({ ...value, [current.question_id]: event.target.value }))}/>
              <div className="essay-answer-actions"><button className="pp-button" type="button" disabled={current.submitted || saving === current.question_id || !drafts[current.question_id]?.trim()} onClick={() => void submit()}>{current.submitted ? <><FiCheck/>Submitted</> : <><FiSave/>{saving === current.question_id ? "Submitting…" : "Submit answer"}</>}</button><button className="pp-button secondary" type="button" disabled={!current.submitted || revealing === current.question_id} onClick={() => void reveal()}>{current.submitted ? <FiEye/> : <FiLock/>}{revealing === current.question_id ? "Loading answer…" : "Reveal answer"}</button></div>
            </article>
            {models[current.question_id] && <article className="essay-model-answer"><small>PUBLISHED MODEL ANSWER</small><h2>Compare with your response</h2><p>{models[current.question_id].model_answer}</p>{models[current.question_id].grading_rubric ? <details><summary>Grading rubric</summary><p>{models[current.question_id].grading_rubric}</p></details> : null}</article>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <footer className="essay-session-footer"><button type="button" className="pp-button secondary" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}><FiArrowLeft/>Previous</button><span>Question {index + 1} of {questions.length}</span><button type="button" className="pp-button" disabled={index >= questions.length - 1} onClick={() => setIndex((value) => Math.min(questions.length - 1, value + 1))}>Next<FiArrowRight/></button></footer>
          </section>
          <aside><Panel title="How it works"><ol className="essay-rules"><li>Write your own answer.</li><li>Submit locks that response.</li><li>Reveal Answer becomes available only after successful backend submission.</li><li>The model answer comes from the instructor-published essay configuration, not from AI.</li></ol></Panel></aside>
        </div>
      </> : <Panel title="No essay questions"><p>This attempt has no questions.</p></Panel>}
    </main>
  </ProductShell>;
}
