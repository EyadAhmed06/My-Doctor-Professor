"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiCheck,
  FiCheckCircle,
  FiFileText,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiUploadCloud,
  FiXCircle,
} from "react-icons/fi";
import { PageSkeleton } from "./async-state";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./role-workspace.css";
import "./question-import.css";

type PageResponse<T> = { data: T[] };
type Topic = { id: string; topicName: string };
type Lecture = { id: string; title: string; topics?: Topic[] };
type Week = { id: string; weekNumber: number; title: string | null; lectures?: Lecture[] };
type Course = { id: string; courseCode: string; courseName: string; weeks?: Week[] };

type ImportIssue = {
  code: string;
  severity: "INFO" | "WARNING" | "ERROR";
  message: string;
};

type DuplicateMatch = {
  question_id: string;
  question_text: string;
  similarity: number;
  exact: boolean;
};

type Candidate = {
  candidate_id: string;
  source_page: number | null;
  question_text: string;
  options: Array<{ label: string; option_text: string; is_correct: boolean }>;
  explanation: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  marks: number;
  extraction_confidence: number;
  topic_confidence: number;
  status: "VALID" | "NEEDS_REVIEW" | "INVALID";
  issues: ImportIssue[];
  duplicate: DuplicateMatch | null;
  approved?: boolean;
  reuse_question_id?: string;
  allow_topic_override?: boolean;
  allow_duplicate?: boolean;
};

type Inspection = {
  original_filename: string;
  file_sha256: string;
  file_size: number;
  page_count: number;
  extraction_method: string;
  extraction_confidence: number;
  status: string;
  previously_published_from_same_file: number;
  topic: { id: string; name: string };
  summary?: {
    extracted: number;
    valid: number;
    needs_review: number;
    invalid: number;
    duplicates: number;
  };
  issues: ImportIssue[];
  candidates: Candidate[];
};

type PublishResult = {
  created: number;
  reused: number;
  skipped: number;
};

function flattenTopics(course: Course | null) {
  if (!course?.weeks) return [] as Array<Topic & { path: string }>;
  return course.weeks.flatMap((week) =>
    (week.lectures || []).flatMap((lecture) =>
      (lecture.topics || []).map((topic) => ({
        ...topic,
        path: `${week.title || `Week ${week.weekNumber}`} · ${lecture.title}`,
      })),
    ),
  );
}

function percent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function statusClass(status: Candidate["status"]) {
  if (status === "VALID") return "good";
  if (status === "NEEDS_REVIEW") return "warning";
  return "bad";
}

export function QuestionImportPage() {
  const { user, loading: authLoading, request } = useAuth();
  const { notify } = useUx();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [course, setCourse] = useState<Course | null>(null);
  const [topicId, setTopicId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [copyrightConfirmed, setCopyrightConfirmed] = useState(false);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspecting, setInspecting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    if (!user || user.role === "STUDENT") return;
    setLoading(true);
    try {
      const result = await request<PageResponse<Course>>("/academic/courses?limit=100");
      setCourses(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load courses.");
    } finally {
      setLoading(false);
    }
  }, [request, user]);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  async function chooseCourse(id: string) {
    setCourseId(id);
    setCourse(null);
    setTopicId("");
    setInspection(null);
    setCandidates([]);
    if (!id) return;
    try {
      setCourse(await request<Course>(`/academic/courses/${id}`));
    } catch (cause) {
      notify({
        title: "Could not load course structure",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    }
  }

  async function inspect(event: FormEvent) {
    event.preventDefault();
    if (!file || !topicId) return;
    setInspecting(true);
    setError(null);
    setInspection(null);
    setCandidates([]);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("topic_id", topicId);
      body.append("copyright_confirmed", String(copyrightConfirmed));
      const result = await request<Inspection>("/questions/imports/inspect", {
        method: "POST",
        body,
      });
      setInspection(result);
      setCandidates(
        result.candidates.map((candidate) => ({
          ...candidate,
          approved: candidate.status === "VALID" && !candidate.duplicate,
          allow_topic_override: false,
          allow_duplicate: false,
        })),
      );
      if (result.status === "NEEDS_OCR") {
        notify({
          title: "OCR required",
          description: "This PDF does not expose a safe text layer yet, so nothing was published.",
          tone: "info",
        });
      } else {
        notify({
          title: "PDF inspection complete",
          description: `${result.candidates.length} candidate question(s) are ready for instructor review.`,
          tone: "success",
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not inspect PDF.");
    } finally {
      setInspecting(false);
    }
  }

  function updateCandidate(index: number, updater: (candidate: Candidate) => Candidate) {
    setCandidates((current) =>
      current.map((candidate, candidateIndex) =>
        candidateIndex === index ? updater(candidate) : candidate,
      ),
    );
  }

  function setCorrectOption(candidateIndex: number, optionIndex: number) {
    updateCandidate(candidateIndex, (candidate) => ({
      ...candidate,
      options: candidate.options.map((option, index) => ({
        ...option,
        is_correct: index === optionIndex,
      })),
    }));
  }

  async function publishApproved() {
    if (!inspection) return;
    const approved = candidates.filter((candidate) => candidate.approved);
    if (!approved.length) {
      notify({ title: "Nothing approved", description: "Approve at least one reviewed question first.", tone: "info" });
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const result = await request<PublishResult>("/questions/imports/publish", {
        method: "POST",
        body: {
          topic_id: inspection.topic.id,
          original_filename: inspection.original_filename,
          file_sha256: inspection.file_sha256,
          copyright_confirmed: copyrightConfirmed,
          candidates: candidates.map((candidate) => ({
            approved: Boolean(candidate.approved),
            question_text: candidate.question_text.trim(),
            explanation: candidate.explanation?.trim() || undefined,
            difficulty: candidate.difficulty,
            marks: Number(candidate.marks),
            options: candidate.options.map((option) => ({
              option_text: option.option_text.trim(),
              is_correct: option.is_correct,
            })),
            source_page: candidate.source_page ?? undefined,
            reuse_question_id: candidate.reuse_question_id || undefined,
            allow_topic_override: Boolean(candidate.allow_topic_override),
            allow_duplicate: Boolean(candidate.allow_duplicate),
          })),
        },
      });
      notify({
        title: "Question bank updated",
        description: `${result.created} created · ${result.reused} reused · ${result.skipped} skipped.`,
        tone: "success",
      });
      setInspection(null);
      setCandidates([]);
      setFile(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not publish approved questions.");
    } finally {
      setPublishing(false);
    }
  }

  const topics = useMemo(() => flattenTopics(course), [course]);
  const approvedCount = candidates.filter((candidate) => candidate.approved).length;

  if (authLoading || loading) {
    return <ProductShell><main className="pp-page"><PageSkeleton variant="workspace" label="Loading question importer" /></main></ProductShell>;
  }
  if (!user || user.role === "STUDENT") {
    return <ProductShell><main className="pp-page"><Panel title="Instructor access required"><p>PDF question inspection is restricted to instructors and system administrators.</p></Panel></main></ProductShell>;
  }

  return <ProductShell search="Search question imports">
    <main className="pp-page question-import-page">
      <header className="question-import-heading">
        <div>
          <Link href={user.role === "SYSTEM_ADMIN" ? "/admin/questions" : "/instructor/questions"} className="question-import-back"><FiArrowLeft /> Question bank</Link>
          <span className="page-eyebrow">INSTRUCTOR · CONTROLLED INGESTION</span>
          <h1>PDF Question Inspector</h1>
          <p>Extract MCQs into a review queue first. Nothing reaches students until you explicitly approve and publish it.</p>
        </div>
        <div className="question-import-trust"><FiShield /><span><strong>Human approval required</strong><small>Parsing is not medical verification.</small></span></div>
      </header>

      <Panel className="question-import-upload-panel">
        <form onSubmit={inspect} className="question-import-upload-form">
          <div className="question-import-fields">
            <label><span>Course</span><select required value={courseId} onChange={(event) => void chooseCourse(event.target.value)}><option value="">Select course…</option>{courses.map((item) => <option value={item.id} key={item.id}>{item.courseCode} · {item.courseName}</option>)}</select></label>
            <label><span>Destination topic</span><select required value={topicId} disabled={!course} onChange={(event) => { setTopicId(event.target.value); setInspection(null); setCandidates([]); }}><option value="">Select exact topic…</option>{topics.map((topic) => <option value={topic.id} key={topic.id}>{topic.path} · {topic.topicName}</option>)}</select></label>
            <label className="question-import-file"><span>Question PDF</span><input required type="file" accept="application/pdf,.pdf" onChange={(event) => { setFile(event.target.files?.[0] || null); setInspection(null); setCandidates([]); }} /><small>Real PDF only · max 25 MB · max 200 pages. Fake extensions, encrypted files, and unreadable structures are rejected.</small></label>
          </div>
          <label className="question-import-rights"><input type="checkbox" checked={copyrightConfirmed} onChange={(event) => setCopyrightConfirmed(event.target.checked)} /><span>I confirm I have permission to use and publish questions from this material.</span></label>
          <div className="question-import-upload-actions"><button type="submit" className="pp-button" disabled={inspecting || !file || !topicId || !copyrightConfirmed}>{inspecting ? <><FiRefreshCw className="spin" /> Inspecting PDF…</> : <><FiUploadCloud /> Inspect PDF</>}</button></div>
        </form>
      </Panel>

      {error && <p className="form-error" role="alert">{error}</p>}

      {inspection && <>
        <section className="question-import-summary" aria-label="Import summary">
          <Panel><small>FILE</small><strong>{inspection.original_filename}</strong><span>{inspection.page_count} page(s) · {(inspection.file_size / 1024 / 1024).toFixed(2)} MB</span></Panel>
          <Panel><small>EXTRACTION</small><strong>{percent(inspection.extraction_confidence)}</strong><span>{inspection.extraction_method.replaceAll("_", " ")}</span></Panel>
          <Panel><small>QUESTIONS</small><strong>{inspection.summary?.extracted ?? 0}</strong><span>{inspection.summary ? `${inspection.summary.valid} valid · ${inspection.summary.needs_review} review · ${inspection.summary.invalid} invalid` : inspection.status.replaceAll("_", " ")}</span></Panel>
          <Panel><small>REUSE</small><strong>{inspection.summary?.duplicates ?? 0}</strong><span>{inspection.previously_published_from_same_file} already published from this exact PDF</span></Panel>
        </section>

        {inspection.issues.length > 0 && <Panel title="Batch checks" className="question-import-batch-issues">{inspection.issues.map((issue) => <div className={`question-import-issue ${issue.severity.toLowerCase()}`} key={`${issue.code}-${issue.message}`}><span>{issue.severity === "ERROR" ? <FiXCircle /> : <FiAlertTriangle />}</span><div><strong>{issue.code.replaceAll("_", " ")}</strong><p>{issue.message}</p></div></div>)}</Panel>}

        {candidates.length > 0 && <section className="question-import-review">
          <div className="question-import-review-heading"><div><span className="page-eyebrow">REVIEW QUEUE</span><h2>Inspect every extracted question</h2><p>Edit the stem, options, correct answer, explanation, and classification before approval.</p></div><div><strong>{approvedCount}</strong><span>approved</span></div></div>

          {candidates.map((candidate, candidateIndex) => <article className={`question-import-candidate ${candidate.approved ? "approved" : ""}`} key={candidate.candidate_id}>
            <header>
              <div className="question-import-candidate-number"><span>{candidateIndex + 1}</span><div><strong>Candidate {candidateIndex + 1}</strong><small>{candidate.source_page ? `Source page ${candidate.source_page}` : "Source page unresolved"}</small></div></div>
              <div className="question-import-candidate-status"><span className={`role-status ${statusClass(candidate.status)}`}>{candidate.status.replaceAll("_", " ")}</span><span>Parse {percent(candidate.extraction_confidence)}</span><span>Topic {percent(candidate.topic_confidence)}</span></div>
            </header>

            {candidate.issues.length > 0 && <div className="question-import-inline-issues">{candidate.issues.map((issue) => <span className={issue.severity.toLowerCase()} key={issue.code} title={issue.message}>{issue.severity === "ERROR" ? <FiXCircle /> : <FiAlertTriangle />}{issue.message}</span>)}</div>}

            {candidate.duplicate && <div className="question-import-duplicate"><FiSearch /><div><strong>{candidate.duplicate.exact ? "Exact question already exists" : `Possible duplicate · ${percent(candidate.duplicate.similarity)}`}</strong><p>{candidate.duplicate.question_text}</p></div><div className="question-import-duplicate-actions"><button type="button" onClick={() => updateCandidate(candidateIndex, (current) => ({ ...current, reuse_question_id: current.duplicate?.question_id, allow_duplicate: false, approved: true }))}><FiCheckCircle /> Reuse existing</button><button type="button" onClick={() => updateCandidate(candidateIndex, (current) => ({ ...current, reuse_question_id: undefined, allow_duplicate: true }))}>Create separate copy</button></div></div>}

            <label className="question-import-stem"><span>Question stem</span><textarea value={candidate.question_text} onChange={(event) => updateCandidate(candidateIndex, (current) => ({ ...current, question_text: event.target.value, reuse_question_id: undefined }))} /></label>

            <div className="question-import-options"><span>Answer options</span>{candidate.options.map((option, optionIndex) => <label className={option.is_correct ? "correct" : ""} key={`${candidate.candidate_id}-${option.label}`}><input type="radio" name={`correct-${candidate.candidate_id}`} checked={option.is_correct} onChange={() => setCorrectOption(candidateIndex, optionIndex)} /><strong>{option.label}</strong><input value={option.option_text} onChange={(event) => updateCandidate(candidateIndex, (current) => ({ ...current, reuse_question_id: undefined, options: current.options.map((value, index) => index === optionIndex ? { ...value, option_text: event.target.value } : value) }))} /></label>)}</div>

            <label><span>Explanation</span><textarea value={candidate.explanation || ""} placeholder="Tutor-mode explanation shown after grading" onChange={(event) => updateCandidate(candidateIndex, (current) => ({ ...current, explanation: event.target.value }))} /></label>

            <div className="question-import-meta-controls"><label>Difficulty<select value={candidate.difficulty} onChange={(event) => updateCandidate(candidateIndex, (current) => ({ ...current, difficulty: event.target.value as Candidate["difficulty"] }))}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label><label>Marks<input type="number" min="0.01" max="999.99" step="0.01" value={candidate.marks} onChange={(event) => updateCandidate(candidateIndex, (current) => ({ ...current, marks: Number(event.target.value) }))} /></label></div>

            {candidate.topic_confidence < 0.08 && <label className="question-import-confirm"><input type="checkbox" checked={Boolean(candidate.allow_topic_override)} onChange={(event) => updateCandidate(candidateIndex, (current) => ({ ...current, allow_topic_override: event.target.checked }))} /><span>I reviewed this mismatch and confirm this question belongs to <strong>{inspection.topic.name}</strong>.</span></label>}

            <footer><label className="question-import-approve"><input type="checkbox" checked={Boolean(candidate.approved)} onChange={(event) => updateCandidate(candidateIndex, (current) => ({ ...current, approved: event.target.checked }))} /><span>{candidate.reuse_question_id ? "Approve reuse" : "Approve for publication"}</span></label>{candidate.reuse_question_id && <span className="question-import-reuse-chip"><FiCheckCircle /> Existing question will be reused; no duplicate will be created.</span>}</footer>
          </article>)}

          <div className="question-import-publish-bar"><div><strong>{approvedCount} approved</strong><span>Publication re-validates option structure, topic mismatch overrides, duplicate policy, and access permissions on the server.</span></div><button type="button" className="pp-button" onClick={() => void publishApproved()} disabled={publishing || approvedCount === 0}>{publishing ? <><FiRefreshCw className="spin" /> Publishing…</> : <><FiCheck /> Publish approved</>}</button></div>
        </section>}
      </>}
    </main>
  </ProductShell>;
}
