"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiCheck,
  FiCheckCircle,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiTrash2,
  FiUploadCloud,
  FiXCircle,
} from "react-icons/fi";
import { PageSkeleton } from "./async-state";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";
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
  question_number?: number;
  source_page: number | null;
  answer_key_label?: string | null;
  answer_key_page?: number | null;
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

type PublishResult = { created: number; reused: number; skipped: number };

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function reindexOptions(options: Array<{ label: string; option_text: string; is_correct: boolean }>) {
  return options.map((opt, i) => ({
    ...opt,
    label: OPTION_LABELS[i] || String.fromCharCode(65 + i),
  }));
}

function recalculateCandidate(candidate: Candidate): Candidate {
  const issues = (candidate.issues || []).filter(
    (issue) =>
      !["EMPTY_STEM", "INVALID_OPTIONS_COUNT", "NO_CORRECT_OPTION", "MULTIPLE_CORRECT_OPTIONS", "EMPTY_OPTION"].includes(
        issue.code,
      ),
  );

  const stem = (candidate.question_text || "").trim();
  if (stem.length < 8) {
    issues.push({
      code: "EMPTY_STEM",
      severity: "ERROR",
      message: "Question stem must be at least 8 characters.",
    });
  }
  if (candidate.options.length !== 5) {
    issues.push({
      code: "INVALID_OPTIONS_COUNT",
      severity: "ERROR",
      message: `MCQ requires exactly 5 options (currently ${candidate.options.length}).`,
    });
  }
  const hasEmptyOption = candidate.options.some((o) => !o.option_text || !o.option_text.trim());
  if (hasEmptyOption) {
    issues.push({
      code: "EMPTY_OPTION",
      severity: "WARNING",
      message: "One or more answer options are empty.",
    });
  }
  const correctCount = candidate.options.filter((o) => o.is_correct).length;
  if (correctCount === 0) {
    issues.push({
      code: "NO_CORRECT_OPTION",
      severity: "ERROR",
      message: "Select the single correct answer option.",
    });
  } else if (correctCount > 1) {
    issues.push({
      code: "MULTIPLE_CORRECT_OPTIONS",
      severity: "ERROR",
      message: "Only one option can be marked as correct.",
    });
  }

  const hasErrors = issues.some((i) => i.severity === "ERROR");
  const hasWarnings =
    issues.some((i) => i.severity === "WARNING") ||
    candidate.topic_confidence < 0.08 ||
    Boolean(candidate.duplicate);

  const status: "VALID" | "NEEDS_REVIEW" | "INVALID" = hasErrors
    ? "INVALID"
    : hasWarnings
      ? "NEEDS_REVIEW"
      : "VALID";

  return {
    ...candidate,
    status,
    issues,
  };
}

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
  return `${Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100)}%`;
}

function statusClass(status: Candidate["status"]) {
  if (status === "VALID") return "good";
  if (status === "NEEDS_REVIEW") return "warning";
  return "bad";
}

function inspectionErrorMessage(cause: unknown) {
  if (cause instanceof DOMException && (cause.name === "TimeoutError" || cause.name === "AbortError")) {
    return "PDF inspection timed out after 90 seconds. Check the backend/OpenAI connection, then try again.";
  }
  return cause instanceof Error ? cause.message : "Could not inspect PDF.";
}

function hasLegacyInspectorContract(result: Inspection) {
  const messages = [
    ...(result.issues || []).map((issue) => issue.message),
    ...result.candidates.flatMap((candidate) => candidate.issues.map((issue) => issue.message)),
  ];
  return messages.some((message) =>
    /between two and four answer options/i.test(message) ||
    /no explanation was detected\. add one before publishing/i.test(message) ||
    /none will be generated automatically/i.test(message),
  );
}

function isBulkPublishable(candidate: Candidate) {
  const cleanOptions = candidate.options.length === 5
    && candidate.options.every((option) => option.option_text.trim().length > 0)
    && candidate.options.filter((option) => option.is_correct).length === 1;
  const topicResolved = candidate.topic_confidence >= 0.08 || Boolean(candidate.allow_topic_override);
  const duplicateResolved = !candidate.duplicate || Boolean(candidate.reuse_question_id) || Boolean(candidate.allow_duplicate);
  return candidate.status !== "INVALID"
    && candidate.question_text.trim().length > 0
    && cleanOptions
    && topicResolved
    && duplicateResolved;
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
  const [candidateSearch, setCandidateSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Candidate["status"]>("ALL");

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

  useEffect(() => { void loadCourses(); }, [loadCourses]);

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
      notify({ title: "Could not load course structure", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  async function inspect(event: FormEvent) {
    event.preventDefault();
    if (!courseId) {
      notify({ title: "Choose a course first", description: "Select the course that owns these questions.", tone: "info" });
      return;
    }
    if (!topicId) {
      notify({ title: "Choose a destination topic", description: "The inspector needs the exact topic before it can analyse the PDF.", tone: "info" });
      return;
    }
    if (!file) {
      notify({ title: "Choose a PDF", description: "Select the question PDF you want to inspect.", tone: "info" });
      return;
    }
    if (!copyrightConfirmed) {
      notify({ title: "Permission confirmation required", description: "Confirm that you have permission to use this question material before inspection.", tone: "info" });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      notify({ title: "PDF is too large", description: "Question PDFs are limited to 25 MB.", tone: "error" });
      return;
    }
    if (!/\.pdf$/i.test(file.name)) {
      notify({ title: "A real PDF is required", description: "Choose a file with a .pdf filename.", tone: "error" });
      return;
    }

    setInspecting(true);
    setError(null);
    setInspection(null);
    setCandidates([]);
    notify({ title: "Inspecting PDF", description: `Parsing, matching answer keys, validating, and enriching ${file.name}…`, tone: "info" });

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("topic_id", topicId);
      body.append("copyright_confirmed", String(copyrightConfirmed));
      const result = await request<Inspection>("/questions/imports/inspect", {
        method: "POST",
        body,
        signal: AbortSignal.timeout(90_000),
      });

      if (hasLegacyInspectorContract(result)) {
        const message = "The running backend is using the old PDF inspector contract (4-option/manual-explanation parser). Restart the backend after pulling this branch, then inspect the PDF again. This stale result was blocked so it cannot be reviewed or published.";
        setError(message);
        setInspection(null);
        setCandidates([]);
        notify({ title: "Outdated PDF inspector detected", description: message, tone: "error" });
        return;
      }

      setInspection(result);
      setCandidates(result.candidates.map((candidate) => ({
        ...candidate,
        approved: candidate.status === "VALID" && !candidate.duplicate,
        allow_topic_override: false,
        allow_duplicate: false,
      })));

      if (result.status === "NEEDS_OCR") {
        notify({ title: "OCR required", description: "This PDF does not expose a safe text layer yet, so nothing was published.", tone: "info" });
      } else if (result.status === "NO_QUESTIONS") {
        notify({ title: "No supported MCQs detected", description: "The PDF was read, but no supported numbered A–F MCQs were found. See the batch checks below.", tone: "info" });
      } else {
        notify({
          title: "PDF inspection complete",
          description: `${result.summary?.valid ?? 0} ready · ${result.summary?.needs_review ?? 0} need attention · ${result.summary?.invalid ?? 0} invalid. Review exceptions, then publish.`,
          tone: "success",
        });
      }
    } catch (cause) {
      const message = inspectionErrorMessage(cause);
      setError(message);
      notify({ title: "PDF inspection failed", description: message, tone: "error" });
    } finally {
      setInspecting(false);
    }
  }

  function updateCandidate(index: number, updater: (candidate: Candidate) => Candidate) {
    setCandidates((current) =>
      current.map((candidate, candidateIndex) =>
        candidateIndex === index ? recalculateCandidate(updater(candidate)) : candidate,
      ),
    );
  }

  function setCorrectOption(candidateIndex: number, optionIndex: number) {
    updateCandidate(candidateIndex, (candidate) => ({
      ...candidate,
      options: candidate.options.map((option, index) => ({ ...option, is_correct: index === optionIndex })),
    }));
  }

  function addOption(candidateIndex: number) {
    updateCandidate(candidateIndex, (candidate) => {
      if (candidate.options.length >= 8) return candidate;
      const nextLetter =
        OPTION_LABELS[candidate.options.length] || String.fromCharCode(65 + candidate.options.length);
      const options = reindexOptions([
        ...candidate.options,
        { label: nextLetter, option_text: "", is_correct: false },
      ]);
      return { ...candidate, options };
    });
  }

  function removeOption(candidateIndex: number, optionIndex: number) {
    updateCandidate(candidateIndex, (candidate) => {
      if (candidate.options.length <= 2) return candidate;
      const remaining = candidate.options.filter((_, idx) => idx !== optionIndex);
      if (candidate.options[optionIndex]?.is_correct && remaining.length > 0) {
        remaining[0].is_correct = true;
      }
      return { ...candidate, options: reindexOptions(remaining) };
    });
  }

  function removeCandidate(candidateIndex: number) {
    setCandidates((current) => current.filter((_, idx) => idx !== candidateIndex));
    notify({
      title: "Question removed",
      description: "Question removed from this import batch.",
      tone: "info",
    });
  }

  function addManualCandidate() {
    const newCandidate: Candidate = recalculateCandidate({
      candidate_id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      question_number: candidates.length + 1,
      source_page: null,
      answer_key_label: null,
      answer_key_page: null,
      question_text: "",
      options: [
        { label: "A", option_text: "", is_correct: true },
        { label: "B", option_text: "", is_correct: false },
        { label: "C", option_text: "", is_correct: false },
        { label: "D", option_text: "", is_correct: false },
        { label: "E", option_text: "", is_correct: false },
      ],
      explanation: null,
      difficulty: "MEDIUM",
      marks: 1,
      extraction_confidence: 1,
      topic_confidence: 1,
      status: "INVALID",
      issues: [],
      duplicate: null,
      approved: true,
      allow_topic_override: true,
      allow_duplicate: false,
    });
    setCandidates((current) => [...current, newCandidate]);
    notify({
      title: "New question added",
      description: "Added a new MCQ template. Fill the stem and 5 options.",
      tone: "info",
    });
  }

  function approveAllForPublication() {
    setCandidates((current) =>
      current.map((candidate) => {
        let options = [...candidate.options];
        while (options.length < 5) {
          options.push({
            label: OPTION_LABELS[options.length] || String.fromCharCode(65 + options.length),
            option_text: "",
            is_correct: false,
          });
        }
        options = reindexOptions(options);
        if (!options.some((o) => o.is_correct) && options.length > 0) {
          options[0].is_correct = true;
        }
        return recalculateCandidate({
          ...candidate,
          options,
          approved: true,
          allow_topic_override: true,
          allow_duplicate: candidate.duplicate ? true : candidate.allow_duplicate,
        });
      }),
    );
    notify({
      title: "All questions approved for publication",
      description: `All ${candidates.length} questions are approved for publication with topic overrides confirmed.`,
      tone: "success",
    });
  }

  function toggleApproveAll(approved: boolean) {
    if (approved) {
      approveAllForPublication();
    } else {
      setCandidates((current) => current.map((c) => ({ ...c, approved: false })));
      notify({
        title: "Approvals cleared",
        description: "Unchecked approval for all candidate questions.",
        tone: "info",
      });
    }
  }

  async function publishApproved() {
    if (!inspection) return;
    const approved = candidates.filter((candidate) => candidate.approved);
    if (!approved.length) {
      notify({
        title: "Nothing approved",
        description: "Approve at least one ready/reviewed question first.",
        tone: "info",
      });
      return;
    }

    for (let i = 0; i < approved.length; i++) {
      const c = approved[i];
      if (c.question_text.trim().length < 8) {
        notify({
          title: "Question stem too short",
          description: `Question ${i + 1} stem must be at least 8 characters.`,
          tone: "error",
        });
        return;
      }
      if (c.options.length !== 5) {
        notify({
          title: "Invalid options count",
          description: `Question ${i + 1} must have exactly 5 options (currently ${c.options.length}). Click "Add option" or delete extra options.`,
          tone: "error",
        });
        return;
      }
      if (c.options.some((o) => !o.option_text.trim())) {
        notify({
          title: "Empty option",
          description: `Question ${i + 1} contains empty answer options. Fill all 5 options before publishing.`,
          tone: "error",
        });
        return;
      }
      if (c.options.filter((o) => o.is_correct).length !== 1) {
        notify({
          title: "Correct option required",
          description: `Question ${i + 1} must have exactly one correct option selected.`,
          tone: "error",
        });
        return;
      }
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
            marks: Math.max(1, Math.round(Number(candidate.marks) || 1)),
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
  const exceptionCount = candidates.filter(
    (candidate) => candidate.status !== "VALID" || Boolean(candidate.duplicate),
  ).length;
  const statusCounts = useMemo(() => ({
    ALL: candidates.length,
    VALID: candidates.filter((candidate) => candidate.status === "VALID").length,
    NEEDS_REVIEW: candidates.filter((candidate) => candidate.status === "NEEDS_REVIEW").length,
    INVALID: candidates.filter((candidate) => candidate.status === "INVALID").length,
  }), [candidates]);
  const visibleCandidates = useMemo(() => {
    const query = candidateSearch.trim().toLowerCase();
    return candidates
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => {
        if (statusFilter !== "ALL" && candidate.status !== statusFilter) return false;
        if (!query) return true;
        const correct = candidate.options.find((option) => option.is_correct);
        return [
          candidate.question_number,
          candidate.question_text,
          candidate.status,
          candidate.answer_key_label,
          correct?.label,
          correct?.option_text,
          ...candidate.options.map((option) => option.option_text),
          ...candidate.issues.flatMap((issue) => [issue.code, issue.message]),
        ].some((value) => String(value ?? "").toLowerCase().includes(query));
      });
  }, [candidateSearch, candidates, statusFilter]);

  if (authLoading || loading) {
    return (
      <ProductShell>
        <main className="pp-page">
          <PageSkeleton variant="workspace" label="Loading question importer" />
        </main>
      </ProductShell>
    );
  }
  if (!user || user.role === "STUDENT") {
    return (
      <ProductShell>
        <main className="pp-page">
          <Panel title="Instructor access required">
            <p>PDF question inspection is restricted to instructors and system administrators.</p>
          </Panel>
        </main>
      </ProductShell>
    );
  }

  return (
    <ProductShell search="Search question imports">
      <main className="pp-page question-import-page">
        <header className="question-import-heading">
          <div>
            <Link
              href={user.role === "SYSTEM_ADMIN" ? "/admin/questions" : "/instructor/questions"}
              className="question-import-back"
            >
              <FiArrowLeft /> Question bank
            </Link>
            <span className="page-eyebrow">INSTRUCTOR · AUTOMATED INGESTION</span>
            <h1>PDF Question Inspector</h1>
            <p>
              Extract and validate MCQs automatically, match source answer keys, then edit every stem, answer option, correct answer, explanation, difficulty, and mark before publication.
            </p>
          </div>
          <div className="question-import-trust">
            <FiShield />
            <span>
              <strong>Editable before publication</strong>
              <small>Source answer keys stay authoritative. Nothing is published until instructor approval.</small>
            </span>
          </div>
        </header>

        <Panel className="question-import-upload-panel">
          <form onSubmit={inspect} className="question-import-upload-form" noValidate>
            <div className="question-import-fields">
              <label>
                <span>Course</span>
                <select value={courseId} onChange={(event) => void chooseCourse(event.target.value)}>
                  <option value="">Select course…</option>
                  {courses.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.courseCode} · {item.courseName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Destination topic</span>
                <select
                  value={topicId}
                  disabled={!course}
                  onChange={(event) => {
                    setTopicId(event.target.value);
                    setInspection(null);
                    setCandidates([]);
                  }}
                >
                  <option value="">Select exact topic…</option>
                  {topics.map((topic) => (
                    <option value={topic.id} key={itemKey(topic.id, topic.path)}>
                      {topic.path} · {topic.topicName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="question-import-file">
                <span>Question PDF</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] || null);
                    setInspection(null);
                    setCandidates([]);
                  }}
                />
                <small>Real PDF only · max 25 MB · max 200 pages. Every MCQ must contain exactly 5 options (A–E).</small>
              </label>
            </div>
            <label className="question-import-rights">
              <input
                type="checkbox"
                checked={copyrightConfirmed}
                onChange={(event) => setCopyrightConfirmed(event.target.checked)}
              />
              <span>I confirm I have permission to use and publish questions from this material.</span>
            </label>
            <div className="question-import-upload-actions">
              <button type="submit" className="pp-button" disabled={inspecting} aria-busy={inspecting}>
                {inspecting ? (
                  <>
                    <FiRefreshCw className="spin" /> Inspecting PDF…
                  </>
                ) : (
                  <>
                    <FiUploadCloud /> Inspect PDF
                  </>
                )}
              </button>
              {inspecting && (
                <span role="status" aria-live="polite">
                  Parsing PDF, matching answers, validating questions, and generating concise explanations/difficulty estimates.
                </span>
              )}
            </div>
          </form>
        </Panel>

        {error && <p className="form-error" role="alert">{error}</p>}

        {inspection && (
          <>
            <section className="question-import-summary" aria-label="Import summary">
              <Panel>
                <small>FILE</small>
                <strong>{inspection.original_filename}</strong>
                <span>
                  {inspection.page_count} page(s) · {(inspection.file_size / 1024 / 1024).toFixed(2)} MB
                </span>
              </Panel>
              <Panel>
                <small>EXTRACTION</small>
                <strong>{percent(inspection.extraction_confidence)}</strong>
                <span>{inspection.extraction_method.replaceAll("_", " ")}</span>
              </Panel>
              <Panel>
                <small>QUESTIONS</small>
                <strong>{inspection.summary?.extracted ?? candidates.length}</strong>
                <span>
                  {inspection.summary
                    ? `${inspection.summary.valid} ready · ${inspection.summary.needs_review} review · ${inspection.summary.invalid} invalid`
                    : inspection.status.replaceAll("_", " ")}
                </span>
              </Panel>
              <Panel>
                <small>REUSE</small>
                <strong>{inspection.summary?.duplicates ?? 0}</strong>
                <span>{inspection.previously_published_from_same_file} already published from this exact PDF</span>
              </Panel>
            </section>

            {inspection.issues.length > 0 && (
              <Panel title="Batch checks" className="question-import-batch-issues">
                {inspection.issues.map((issue, issueIndex) => (
                  <div className={`question-import-issue ${issue.severity.toLowerCase()}`} key={`${issue.code}-${issueIndex}`}>
                    <span>{issue.severity === "ERROR" ? <FiXCircle /> : <FiAlertTriangle />}</span>
                    <div>
                      <strong>{issue.code.replaceAll("_", " ")}</strong>
                      <p>{issue.message}</p>
                    </div>
                  </div>
                ))}
              </Panel>
            )}

            {candidates.length > 0 && (
              <section className="question-import-review">
                <div className="question-import-review-heading">
                  <div>
                    <span className="page-eyebrow">REVIEW & EDIT</span>
                    <h2>Edit inspected MCQs before publication</h2>
                    <p>
                      Every extracted stem, option, correct answer, explanation, difficulty, and mark is editable. Add or delete options, remove unwanted questions, or use bulk approval before publication.
                    </p>
                  </div>
                  <div className="question-import-bulk-actions">
                    <strong>{approvedCount} / {candidates.length}</strong>
                    <span>ready to publish</span>
                    <label className="question-import-approve-all-toggle" title="Toggle approval for all questions">
                      <input
                        type="checkbox"
                        checked={candidates.length > 0 && candidates.every((c) => c.approved)}
                        onChange={(event) => toggleApproveAll(event.target.checked)}
                      />
                      <span>Approve all for publication</span>
                    </label>
                    <button
                      type="button"
                      className="pp-button secondary"
                      onClick={approveAllForPublication}
                    >
                      <FiCheckCircle /> Approve all for publication
                    </button>
                  </div>
                </div>

                <div className="question-import-filterbar">
                  <label className="question-import-search">
                    <FiSearch />
                    <input
                      type="search"
                      value={candidateSearch}
                      onChange={(event) => setCandidateSearch(event.target.value)}
                      placeholder="Search question number, text, option, answer, issue…"
                      aria-label="Search inspected questions"
                    />
                  </label>
                  <div className="question-import-status-filters" role="group" aria-label="Filter by review status">
                    {([
                      ["ALL", "All"],
                      ["VALID", "Ready"],
                      ["NEEDS_REVIEW", "Needs review"],
                      ["INVALID", "Invalid"],
                    ] as const).map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={statusFilter === value ? "active" : ""}
                        onClick={() => setStatusFilter(value)}
                      >
                        {label} <span>{statusCounts[value]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="question-import-add-question-bar">
                  <button type="button" className="question-import-add-question-btn" onClick={addManualCandidate}>
                    <FiPlus /> Add MCQ question manually
                  </button>
                </div>

                {visibleCandidates.length === 0 && (
                  <div className="question-import-empty-filter">No questions match this search and status filter.</div>
                )}
                {visibleCandidates.map(({ candidate, index: candidateIndex }) => (
                  <article
                    className={`question-import-candidate ${candidate.approved ? "approved" : ""}`}
                    key={`${candidate.candidate_id}-${candidateIndex}`}
                  >
                    <header>
                      <div className="question-import-candidate-number">
                        <span>{candidate.question_number ?? candidateIndex + 1}</span>
                        <div>
                          <strong>Question {candidate.question_number ?? candidateIndex + 1}</strong>
                          <small>
                            {candidate.source_page ? `Question page ${candidate.source_page}` : "Question page unresolved"}
                            {candidate.answer_key_label ? ` · Answer key ${candidate.question_number ?? candidateIndex + 1} → ${candidate.answer_key_label}${candidate.answer_key_page ? ` (page ${candidate.answer_key_page})` : ""}` : " · Answer key not mapped"}
                          </small>
                        </div>
                      </div>
                      <div className="question-import-candidate-status">
                        <span className={`role-status ${statusClass(candidate.status)}`}>
                          {candidate.status === "VALID" ? "READY" : candidate.status.replaceAll("_", " ")}
                        </span>
                        <span>Parse {percent(candidate.extraction_confidence)}</span>
                        <span>Topic {percent(candidate.topic_confidence)}</span>
                        <button
                          type="button"
                          className="question-import-remove-btn"
                          title="Remove this question from the import batch"
                          onClick={() => removeCandidate(candidateIndex)}
                        >
                          <FiTrash2 /> Remove
                        </button>
                      </div>
                    </header>

                    {candidate.issues.length > 0 && (
                      <div className="question-import-inline-issues">
                        {candidate.issues.map((issue, issueIndex) => (
                          <span
                            className={issue.severity.toLowerCase()}
                            key={`${candidate.candidate_id}-${issue.code}-${issueIndex}`}
                            title={issue.message}
                          >
                            {issue.severity === "ERROR" ? <FiXCircle /> : <FiAlertTriangle />}
                            {issue.message}
                          </span>
                        ))}
                      </div>
                    )}

                    {candidate.duplicate && (
                      <div className="question-import-duplicate">
                        <FiSearch />
                        <div>
                          <strong>
                            {candidate.duplicate.exact
                              ? "Exact question already exists"
                              : `Possible duplicate · ${percent(candidate.duplicate.similarity)}`}
                          </strong>
                          <p>{candidate.duplicate.question_text}</p>
                        </div>
                        <div className="question-import-duplicate-actions">
                          <button
                            type="button"
                            onClick={() =>
                              updateCandidate(candidateIndex, (current) => ({
                                ...current,
                                reuse_question_id: current.duplicate?.question_id,
                                allow_duplicate: false,
                                approved: true,
                              }))
                            }
                          >
                            <FiCheckCircle /> Reuse existing
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateCandidate(candidateIndex, (current) => ({
                                ...current,
                                reuse_question_id: undefined,
                                allow_duplicate: true,
                              }))
                            }
                          >
                            Create separate copy
                          </button>
                        </div>
                      </div>
                    )}

                    <label className="question-import-stem">
                      <span>Question stem · editable</span>
                      <textarea
                        value={candidate.question_text}
                        placeholder="Enter question stem…"
                        onChange={(event) =>
                          updateCandidate(candidateIndex, (current) => ({
                            ...current,
                            question_text: event.target.value,
                            reuse_question_id: undefined,
                          }))
                        }
                      />
                    </label>

                    <div className="question-import-options">
                      <div className="question-import-options-header">
                        <span>Answer options · edit text and select the single correct answer ({candidate.options.length}/5)</span>
                        <button
                          type="button"
                          className="question-import-add-option-btn"
                          onClick={() => addOption(candidateIndex)}
                          disabled={candidate.options.length >= 8}
                          title={candidate.options.length >= 8 ? "Maximum 8 options reached" : "Add an option to this question"}
                        >
                          <FiPlus /> Add option
                        </button>
                      </div>
                      {candidate.options.map((option, optionIndex) => (
                        <label
                          className={`question-import-option-row ${option.is_correct ? "correct" : ""}`}
                          key={`${candidate.candidate_id}-${candidateIndex}-${option.label}-${optionIndex}`}
                        >
                          <input
                            type="radio"
                            name={`correct-${candidateIndex}-${candidate.candidate_id}`}
                            checked={option.is_correct}
                            onChange={() => setCorrectOption(candidateIndex, optionIndex)}
                            aria-label={`Mark option ${option.label} as correct`}
                          />
                          <strong>{option.label}</strong>
                          <input
                            type="text"
                            value={option.option_text}
                            placeholder={`Enter option ${option.label} text…`}
                            onChange={(event) =>
                              updateCandidate(candidateIndex, (current) => ({
                                ...current,
                                reuse_question_id: undefined,
                                options: current.options.map((value, index) =>
                                  index === optionIndex ? { ...value, option_text: event.target.value } : value,
                                ),
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="question-import-option-delete-btn"
                            title={`Delete option ${option.label}`}
                            onClick={(event) => {
                              event.preventDefault();
                              removeOption(candidateIndex, optionIndex);
                            }}
                            disabled={candidate.options.length <= 2}
                          >
                            <FiTrash2 />
                          </button>
                        </label>
                      ))}
                    </div>

                    <label>
                      <span>Explanation · editable</span>
                      <textarea
                        value={candidate.explanation || ""}
                        placeholder="Add or edit explanation here…"
                        onChange={(event) =>
                          updateCandidate(candidateIndex, (current) => ({
                            ...current,
                            explanation: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <div className="question-import-meta-controls">
                      <label>
                        Estimated difficulty
                        <select
                          value={candidate.difficulty}
                          onChange={(event) =>
                            updateCandidate(candidateIndex, (current) => ({
                              ...current,
                              difficulty: event.target.value as Candidate["difficulty"],
                            }))
                          }
                        >
                          <option value="EASY">Easy</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HARD">Hard</option>
                        </select>
                      </label>
                      <label>
                        Marks
                        <input
                          type="number"
                          min="1"
                          max="999"
                          step="1"
                          value={Math.round(Number(candidate.marks) || 1)}
                          onChange={(event) =>
                            updateCandidate(candidateIndex, (current) => ({
                              ...current,
                              marks: Math.max(1, Math.round(Number(event.target.value) || 1)),
                            }))
                          }
                        />
                      </label>
                    </div>

                    {candidate.topic_confidence < 0.08 && (
                      <label className="question-import-confirm">
                        <input
                          type="checkbox"
                          checked={Boolean(candidate.allow_topic_override)}
                          onChange={(event) =>
                            updateCandidate(candidateIndex, (current) => ({
                              ...current,
                              allow_topic_override: event.target.checked,
                            }))
                          }
                        />
                        <span>
                          I reviewed this mismatch and confirm this question belongs to <strong>{inspection.topic.name}</strong>.
                        </span>
                      </label>
                    )}

                    <footer>
                      <label className="question-import-approve">
                        <input
                          type="checkbox"
                          checked={Boolean(candidate.approved)}
                          onChange={(event) =>
                            updateCandidate(candidateIndex, (current) => ({
                              ...current,
                              approved: event.target.checked,
                            }))
                          }
                        />
                        <span>{candidate.reuse_question_id ? "Approve reuse" : "Approve for publication"}</span>
                      </label>
                      {candidate.reuse_question_id && (
                        <span className="question-import-reuse-chip">
                          <FiCheckCircle /> Existing question will be reused; no duplicate will be created.
                        </span>
                      )}
                    </footer>
                  </article>
                ))}

                <div className="question-import-add-question-bar">
                  <button type="button" className="question-import-add-question-btn" onClick={addManualCandidate}>
                    <FiPlus /> Add MCQ question manually
                  </button>
                </div>

                <div className="question-import-publish-bar">
                  <div>
                    <strong>{approvedCount} of {candidates.length} ready to publish</strong>
                    <span>
                      Publication re-validates exactly 5 options (A–E), one correct answer, topic overrides, duplicate policy, and access permissions on the server.
                    </span>
                  </div>
                  <div className="question-import-publish-actions">
                    <button
                      type="button"
                      className="pp-button secondary"
                      onClick={approveAllForPublication}
                    >
                      <FiCheckCircle /> Approve all for publication
                    </button>
                    <button
                      type="button"
                      className="pp-button"
                      onClick={() => void publishApproved()}
                      disabled={publishing || approvedCount === 0}
                    >
                      {publishing ? (
                        <>
                          <FiRefreshCw className="spin" /> Publishing…
                        </>
                      ) : (
                        <>
                          <FiCheck /> Publish approved questions ({approvedCount})
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </ProductShell>
  );
}

function itemKey(id: string, context: string) {
  return `${id}-${context}`;
}
