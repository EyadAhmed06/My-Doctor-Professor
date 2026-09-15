"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiAlertCircle, FiBookOpen, FiCheckCircle, FiFlag, FiRefreshCw, FiStar } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { EmptyState, ErrorState, PageSkeleton } from "./async-state";
import { useLocale } from "./locale-provider";
import { ProductShell } from "./product-shell";
import "./student-studio.css";

type StudioFilter = "ALL" | "FLAGGED" | "HARD";

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
  saved_at: string;
  flagged_at: string;
  is_flagged: boolean;
  is_hard: boolean;
  course_id: string | null;
  course_name: string | null;
  lecture_id: string | null;
  lecture_title: string | null;
  selected_option_id: string | null;
  student_was_correct: boolean | null;
  options: StudioOption[];
};

type StudioResponse = { data: StudioQuestion[]; total: number; filter: StudioFilter };

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
  const [filter, setFilter] = useState<StudioFilter>("ALL");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async (background = false) => {
    background ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const result = await request<StudioResponse>("/student/studio/questions");
      setRows(result.data || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("Unable to load Studio."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [request, translate]);

  useEffect(() => { void load(); }, [load]);

  const flaggedCount = useMemo(() => rows.filter((row) => row.is_flagged).length, [rows]);
  const hardCount = useMemo(() => rows.filter((row) => row.is_hard).length, [rows]);

  const visible = useMemo(() => {
    const byType = rows.filter((row) => filter === "ALL" || (filter === "FLAGGED" ? row.is_flagged : row.is_hard));
    const needle = query.trim().toLowerCase();
    if (!needle) return byType;
    return byType.filter((row) => `${row.question_text} ${row.course_name || ""} ${row.lecture_title || ""} ${row.test_title || ""}`.toLowerCase().includes(needle));
  }, [filter, query, rows]);

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filteredEmptyTitle = filter === "FLAGGED"
    ? translate("No review-later questions")
    : filter === "HARD"
      ? translate("No hard questions")
      : translate("No saved questions");

  return <ProductShell search={translate("Search saved questions")}>
    <main className="pp-page student-studio-page">
      <header className="studio-heading">
        <div>
          <span className="page-eyebrow">{translate("STUDENT · REVIEW STUDIO")}</span>
          <h1>{translate("Studio")}</h1>
          <p>{translate("Questions you deliberately saved while solving. Flag means review later; Hard means you personally struggled with it. Answers appear here only after the attempt closes and while you still have access to the content.")}</p>
        </div>
        <button className="pp-button secondary" type="button" disabled={refreshing} onClick={() => void load(true)}><FiRefreshCw className={refreshing ? "is-spinning" : ""}/> {translate(refreshing ? "Refreshing" : "Refresh")}</button>
      </header>

      <section className="studio-toolbar">
        <div className="studio-toolbar-summary"><FiBookOpen/><strong>{rows.length}</strong><span>{translate("unique questions saved from completed attempts")}</span></div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={translate("Search question, course, lecture, or quiz…")} aria-label={translate("Search Studio")}/>
      </section>

      <section className="studio-filters" aria-label={translate("Saved question filters")}>
        <button type="button" className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}><FiBookOpen/><span>{translate("All saved")}</span><b>{rows.length}</b></button>
        <button type="button" className={filter === "FLAGGED" ? "active" : ""} onClick={() => setFilter("FLAGGED")}><FiFlag/><span>{translate("Review later")}</span><b>{flaggedCount}</b></button>
        <button type="button" className={filter === "HARD" ? "active" : ""} onClick={() => setFilter("HARD")}><FiStar/><span>{translate("Hard")}</span><b>{hardCount}</b></button>
      </section>

      {error && <ErrorState title={translate("Studio could not load")} description={error} onRetry={() => void load()} />}
      {loading && !rows.length ? <PageSkeleton variant="workspace" label={translate("Loading your saved questions")} /> : null}
      {!loading && !error && !rows.length ? <EmptyState title={translate("No saved questions yet")} description={translate("While solving, use Flag when you want to revisit a question or Hard when you personally struggle with it. It will enter Studio after that attempt is submitted or expires.")} action={<Link className="pp-button" href="/assessments">{translate("Open questions")}</Link>} /> : null}
      {!loading && !error && rows.length > 0 && !visible.length ? <EmptyState title={query.trim() ? translate("No saved questions match your search") : filteredEmptyTitle} description={query.trim() ? translate("Try a different question, course, lecture, or quiz term.") : translate("Questions with this marker will appear here after their attempt closes.")} /> : null}

      {visible.length > 0 && <section className="studio-list">
        {visible.map((row, index) => {
          const expanded = open.has(row.question_id);
          return <article className={`studio-question ${expanded ? "open" : ""}`} key={row.question_id}>
            <button className="studio-question-summary" type="button" onClick={() => toggle(row.question_id)} aria-expanded={expanded}>
              <span className="studio-number">{index + 1}</span>
              <span className="studio-summary-copy">
                <small>{[row.course_name, row.lecture_title, row.test_title].filter(Boolean).join(" · ") || translate("Completed quiz")}</small>
                <strong data-academic-content>{row.question_text}</strong>
                <span className="studio-markers">
                  {row.is_flagged && <span className="flagged"><FiFlag/> {translate("Review later")}</span>}
                  {row.is_hard && <span className="hard"><FiStar/> {translate("Hard")}</span>}
                  <em className={row.student_was_correct ? "correct" : "review"}>{row.student_was_correct ? translate("You answered correctly") : translate("Review this one")}</em>
                </span>
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
              <footer><span>{translate("Last saved")} {new Date(row.saved_at || row.flagged_at).toLocaleDateString(locale === "ar" ? "ar-EG" : undefined)}</span></footer>
            </div>}
          </article>;
        })}
      </section>}
    </main>
  </ProductShell>;
}
