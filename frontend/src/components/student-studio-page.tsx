"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiAlertCircle, FiBookOpen, FiCheckCircle, FiRefreshCw, FiStar } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { EmptyState, ErrorState, PageSkeleton } from "./async-state";
import { useLocale } from "./locale-provider";
import { ProductShell } from "./product-shell";
import "./student-studio.css";

type StudioOption = {
  id: string;
  option_text: string;
  is_correct: boolean;
  display_order: number;
  explanation: string | null;
};

type StudioQuestion = {
  question_id: string;
  question_text: string;
  explanation: string | null;
  difficulty: string;
  marks: string | number;
  test_id: string;
  test_title: string;
  attempt_id: string;
  flagged_at: string;
  course_id: string | null;
  course_name: string | null;
  lecture_id: string | null;
  lecture_title: string | null;
  selected_option_id: string | null;
  student_was_correct: boolean | null;
  options: StudioOption[];
};

type StudioResponse = { data: StudioQuestion[]; total: number };

function optionLabel(index: number) {
  return String.fromCharCode(65 + index);
}

export function StudentStudioPage() {
  const { request } = useAuth();
  const { translate, locale } = useLocale();
  const [rows, setRows] = useState<StudioQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async (background = false) => {
    background ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const result = await request<StudioResponse>("/tests/studio/hard-questions");
      setRows(result.data || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("Unable to load Studio."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [request, translate]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.question_text} ${row.course_name || ""} ${row.lecture_title || ""} ${row.test_title || ""}`.toLowerCase().includes(needle));
  }, [query, rows]);

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return <ProductShell search={translate("Search your hard questions")}>
    <main className="pp-page student-studio-page">
      <header className="studio-heading">
        <div>
          <span className="page-eyebrow">{translate("STUDENT · REVIEW STUDIO")}</span>
          <h1>{translate("Studio")}</h1>
          <p>{translate("Return to the questions you marked as hard after a quiz closes, review the correct reasoning, and turn difficult questions into revision targets.")}</p>
        </div>
        <button className="pp-button secondary" type="button" disabled={refreshing} onClick={() => void load(true)}><FiRefreshCw className={refreshing ? "is-spinning" : ""}/> {translate(refreshing ? "Refreshing" : "Refresh")}</button>
      </header>

      <section className="studio-toolbar">
        <div><FiStar/><strong>{rows.length}</strong><span>{translate("hard questions saved from completed quizzes")}</span></div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={translate("Search question, course, lecture, or quiz…")} aria-label={translate("Search Studio")}/>
      </section>

      {error && <ErrorState title={translate("Studio could not load")} description={error} action={<button className="pp-button secondary" onClick={() => void load()}>{translate("Retry")}</button>} />}
      {loading && !rows.length ? <PageSkeleton variant="workspace" label={translate("Loading your hard questions")} /> : null}
      {!loading && !error && !rows.length ? <EmptyState icon={<FiCheckCircle/>} title={translate("No hard questions yet")} description={translate("During a quiz, mark a question as Hard. Once that attempt is submitted or expires, the question will appear here for review.")} action={<Link className="pp-button" href="/assessments">{translate("Open questions")}</Link>} /> : null}

      {visible.length > 0 && <section className="studio-list">
        {visible.map((row, index) => {
          const expanded = open.has(row.question_id);
          return <article className={`studio-question ${expanded ? "open" : ""}`} key={row.question_id}>
            <button className="studio-question-summary" type="button" onClick={() => toggle(row.question_id)} aria-expanded={expanded}>
              <span className="studio-number">{index + 1}</span>
              <span className="studio-summary-copy">
                <small>{[row.course_name, row.lecture_title, row.test_title].filter(Boolean).join(" · ") || translate("Completed quiz")}</small>
                <strong data-academic-content>{row.question_text}</strong>
                <em className={row.student_was_correct ? "correct" : "review"}>{row.student_was_correct ? translate("You answered correctly") : translate("Review this one")}</em>
              </span>
              <FiBookOpen/>
            </button>
            {expanded && <div className="studio-question-review">
              <div className="studio-options">
                {row.options.map((option, optionIndex) => {
                  const selected = option.id === row.selected_option_id;
                  return <div className={`${option.is_correct ? "correct" : ""} ${selected ? "selected" : ""}`} key={option.id}>
                    <b>{optionLabel(optionIndex)}</b>
                    <span data-academic-content>{option.option_text}</span>
                    {option.is_correct && <small><FiCheckCircle/> {translate("Correct answer")}</small>}
                    {selected && <small>{translate("Your answer")}</small>}
                    {option.explanation && <p data-academic-content>{option.explanation}</p>}
                  </div>;
                })}
              </div>
              {row.explanation && <section className="studio-explanation"><FiAlertCircle/><div><strong>{translate("Why")}</strong><p data-academic-content>{row.explanation}</p></div></section>}
              <footer><span>{translate("Flagged")} {new Date(row.flagged_at).toLocaleDateString(locale === "ar" ? "ar-EG" : undefined)}</span></footer>
            </div>}
          </article>;
        })}
      </section>}
    </main>
  </ProductShell>;
}
