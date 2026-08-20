"use client";

import { useMemo, useState } from "react";
import { FiBookOpen, FiCheck, FiChevronDown, FiChevronLeft, FiEye, FiFileText } from "react-icons/fi";
import casesData from "@/data/summer-uro-nephrology-essay.json";
import { Panel, ProductShell } from "./product-shell";
import "./pdf-essay-cases.css";

type EssayQuestion = { id: string; prompt: string; answer: string };
type EssayCase = { id: string; section: string; sourceCaseNumber: number; title: string; stem: string; week: number; questions: EssayQuestion[] };
type Stage = "writing" | "submitted" | "revealed";

const cases = casesData as EssayCase[];

export function PdfEssayCasesPage() {
  const [openWeeks, setOpenWeeks] = useState<number[]>([1]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stages, setStages] = useState<Record<string, Stage>>({});
  const selected = cases.find((item) => item.id === selectedId) || null;
  const weeks = useMemo(() => Array.from({ length: 12 }, (_, index) => ({
    number: index + 1,
    cases: cases.filter((item) => item.week === index + 1),
  })).filter((week) => week.cases.length), []);

  const stage = selected ? stages[selected.id] || "writing" : "writing";
  const complete = Boolean(selected?.questions.every((question) => answers[question.id]?.trim()));

  function choose(item: EssayCase) {
    setSelectedId(item.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submit() {
    if (!selected || !complete || stage !== "writing") return;
    setStages((current) => ({ ...current, [selected.id]: "submitted" }));
  }

  function reveal() {
    if (!selected || stage !== "submitted") return;
    setStages((current) => ({ ...current, [selected.id]: "revealed" }));
  }

  return <ProductShell search="Search essay cases">
    <main className="pp-page pdf-essay-page">
      <header className="pdf-essay-heading">
        <div><span className="page-eyebrow">CASE-BASED ESSAY CURRICULUM</span><h1>Urology & Nephrology Essay</h1><p>Course → Week → Cases. Answer every part before comparing your work with the original model answers.</p></div>
        <div className="pdf-source-badge"><FiFileText /><span><b>21 cases</b><small>142 questions from the Summer Essay PDF</small></span></div>
      </header>

      {!selected ? <div className="pdf-curriculum-layout">
        <aside className="pdf-course-card"><FiBookOpen /><small>COURSE</small><h2>Urology & Nephrology</h2><p>Summer essay curriculum</p><span>{cases.length} cases · 12 weeks</span></aside>
        <section className="pdf-week-list">
          {weeks.map((week) => { const open = openWeeks.includes(week.number); return <article className="pdf-week" key={week.number}>
            <button type="button" className="pdf-week-heading" onClick={() => setOpenWeeks((current) => open ? current.filter((number) => number !== week.number) : [...current, week.number])}>
              <span><small>WEEK {String(week.number).padStart(2, "0")}</small><b>{week.cases.length} {week.cases.length === 1 ? "case" : "cases"}</b></span><FiChevronDown className={open ? "open" : ""} />
            </button>
            {open && <div className="pdf-case-grid">{week.cases.map((item) => <button type="button" key={item.id} onClick={() => choose(item)} className="pdf-case-tile"><span>{item.section}</span><h3>Case {item.sourceCaseNumber}</h3><p>{item.stem}</p><footer><b>{item.questions.length} questions</b><span>Open case →</span></footer></button>)}</div>}
          </article>; })}
        </section>
      </div> : <section className="pdf-case-workspace">
        <button className="pdf-back" type="button" onClick={() => setSelectedId(null)}><FiChevronLeft /> Back to weeks & cases</button>
        <Panel className="pdf-case-paper">
          <header><div><small>{selected.section} · WEEK {selected.week}</small><h2>Case {selected.sourceCaseNumber}</h2></div><span>{selected.questions.length} questions</span></header>
          <div className="pdf-case-stem"><small>CASE STUDY</small><p>{selected.stem}</p></div>
          <div className="pdf-question-stack">{selected.questions.map((question, index) => <article className="pdf-question" key={question.id}>
            <h3><span>Q {index + 1}</span>{question.prompt}</h3>
            <label>Your answer<textarea rows={6} disabled={stage !== "writing"} value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Write your answer here…" /></label>
            {stage === "revealed" && <div className="pdf-comparison">
              <div><small>YOUR ANSWER</small><p>{answers[question.id]}</p></div>
              <div className="model"><small><FiCheck /> MODEL ANSWER · FROM THE PDF</small><p>{question.answer}</p></div>
            </div>}
          </article>)}</div>
          <footer className="pdf-case-actions">
            {stage === "writing" && <><div><b>{selected.questions.filter((question) => answers[question.id]?.trim()).length}/{selected.questions.length} answered</b><small>Complete every textbox to submit this case.</small></div><button className="pp-button" disabled={!complete} type="button" onClick={submit}><FiCheck /> Submit case</button></>}
            {stage === "submitted" && <><div><b>Answers submitted</b><small>Your answers are locked. Reveal the PDF answers when you are ready to compare.</small></div><button className="pp-button" type="button" onClick={reveal}><FiEye /> Reveal answers</button></>}
            {stage === "revealed" && <><div><b>Comparison mode</b><small>Your answer and the original model answer remain visible together.</small></div><button className="pp-button secondary" type="button" onClick={() => setSelectedId(null)}>Choose next case</button></>}
          </footer>
        </Panel>
      </section>}
    </main>
  </ProductShell>;
}
