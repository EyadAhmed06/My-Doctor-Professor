"use client";

import Link from "next/link";
import { FormEvent, memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
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

type AiMetadata = {
  provider?: string;
  model?: string;
  prompt_version?: string;
  content_hash?: string;
  confidence?: number;
  answer_consistency?: string;
  status?: "GENERATED" | "CACHED" | "STALE" | "FAILED" | "FAILED_RETRYABLE" | "FAILED_VALIDATION" | "DEFERRED_BILLING";
};

type CandidateOption = {
  label: string;
  option_text: string;
  is_correct: boolean;
  explanation?: string | null;
};

type Candidate = {
  candidate_id: string;
  question_number?: number;
  source_page: number | null;
  answer_key_label?: string | null;
  answer_key_page?: number | null;
  source_section?: string | null;
  question_text: string;
  options: CandidateOption[];
  explanation: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  marks: number;
  extraction_confidence: number;
  topic_confidence: number;
  status: "VALID" | "NEEDS_REVIEW" | "INVALID";
  issues: ImportIssue[];
  duplicate: DuplicateMatch | null;
  ai_enrichment?: AiMetadata | null;
  approved?: boolean;
  reuse_question_id?: string;
  allow_topic_override?: boolean;
  allow_duplicate?: boolean;
  allow_four_options?: boolean;
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
  inspector_contract_version?: number;
  enrichment_contract?: string;
  summary?: {
    expected?: number | null;
    extracted: number;
    missing?: number;
    structurally_complete?: boolean | null;
    valid: number;
    needs_review: number;
    invalid: number;
    duplicates: number;
  };
  sections?: Array<{
    title: string;
    questions: number;
    expected_questions?: number | null;
    missing_question_numbers?: number[];
    unexpected_question_numbers?: number[];
    duplicate_question_numbers?: number[];
    answer_key_conflicts?: Array<{ questionNumber: number; labels: string[] }>;
    completeness?: number | null;
  }>;
  pages?: Array<{
    page: number;
    source: "TEXT_LAYER" | "OCR" | "EMPTY";
    confidence: number;
    text_length: number;
    ocr_attempted: boolean;
    layout_reflowed: boolean;
  }>;
  extraction_breakdown?: {
    text_layer_pages: number;
    ocr_pages: number;
    empty_pages: number;
  };
  issues: ImportIssue[];
  candidates: Candidate[];
};

type EnrichmentResponse = {
  enrichment_contract: string;
  candidates: Candidate[];
  issues: ImportIssue[];
  enrichment_summary?: {
    generated: number;
    cached: number;
    failed: number;
    billing_deferred: number;
  };
};

type PublishResult = { created: number; reused: number; skipped: number };

const OPTION_LABELS = ["A", "B", "C", "D", "E"] as const;
const MIN_MCQ_OPTIONS = 4;
const MAX_MCQ_OPTIONS = 5;
const EDITABLE_OPTION_LABELS = ["A", "B", "C", "D", "E", "F"] as const;
const EXPLANATION_MAX_LENGTH = 220;
const EXPLANATION_MAX_SENTENCES = 2;
const ENRICHMENT_BATCH_SIZE = 10;

function relabelOptions(options: CandidateOption[]) {
  return options.map((option, index) => ({
    ...option,
    label: EDITABLE_OPTION_LABELS[index] ?? option.label,
  }));
}

function normalizeOptions(options: CandidateOption[]) {
  return relabelOptions(options.slice(0, EDITABLE_OPTION_LABELS.length));
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

function hasSupportedOptionCount(count: number) {
  return count >= MIN_MCQ_OPTIONS && count <= MAX_MCQ_OPTIONS;
}

function hasSequentialOptionLabels(candidate: Candidate) {
  return candidate.options
    .map((option) => option.label.toUpperCase())
    .join(",") === OPTION_LABELS.slice(0, candidate.options.length).join(",");
}

function statusClass(status: Candidate["status"]) {
  if (status === "VALID") return "good";
  if (status === "NEEDS_REVIEW") return "warning";
  return "bad";
}

function aiStatus(candidate: Candidate) {
  if (candidate.ai_enrichment?.status) return candidate.ai_enrichment.status;
  if (candidate.explanation || candidate.options.some((option) => option.explanation)) return "STALE" as const;
  return "NOT_GENERATED" as const;
}

function isAiEligible(candidate: Candidate) {
  return candidate.status !== "INVALID"
    && candidate.question_text.trim().length >= 8
    && hasSupportedOptionCount(candidate.options.length)
    && hasSequentialOptionLabels(candidate)
    && (candidate.options.length !== MIN_MCQ_OPTIONS || Boolean(candidate.allow_four_options))
    && candidate.options.every((option) => option.option_text.trim().length > 0)
    && candidate.options.filter((option) => option.is_correct).length === 1;
}

function explanationSentenceCount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const terminated = trimmed.match(/[.!?؟]+(?=\s|$)/g)?.length ?? 0;
  return terminated + (/[.!?؟]+$/.test(trimmed) ? 0 : 1);
}

function isExplanationValid(value: string | null | undefined) {
  const text = value ?? "";
  return text.length <= EXPLANATION_MAX_LENGTH
    && explanationSentenceCount(text) <= EXPLANATION_MAX_SENTENCES;
}

function hasCompleteExplanations(candidate: Candidate) {
  return Boolean(candidate.explanation?.trim())
    && isExplanationValid(candidate.explanation)
    && hasSupportedOptionCount(candidate.options.length)
    && candidate.options.every((option) => Boolean(option.explanation?.trim()) && isExplanationValid(option.explanation));
}

function hasAnyExplanation(candidate: Candidate) {
  return Boolean(candidate.explanation?.trim())
    || candidate.options.some((option) => Boolean(option.explanation?.trim()));
}

function candidateIsPublishable(candidate: Candidate) {
  if (candidate.reuse_question_id) return candidate.status !== "INVALID";
  const anyExplanation = hasAnyExplanation(candidate);
  const explanationStateReady = !anyExplanation
    || (hasCompleteExplanations(candidate) && candidate.ai_enrichment?.status !== "STALE");
  return candidate.status !== "INVALID"
    && candidate.question_text.trim().length >= 8
    && hasSupportedOptionCount(candidate.options.length)
    && (candidate.options.length !== MIN_MCQ_OPTIONS || Boolean(candidate.allow_four_options))
    && candidate.options.every((option) => option.option_text.trim())
    && candidate.options.filter((option) => option.is_correct).length === 1
    && explanationStateReady
    && (candidate.topic_confidence >= 0.08 || Boolean(candidate.allow_topic_override))
    && (!candidate.duplicate || Boolean(candidate.allow_duplicate));
}

function recalculateCandidate(candidate: Candidate): Candidate {
  const structuralCodes = new Set([
    "EMPTY_STEM",
    "INVALID_OPTIONS_COUNT",
    "INVALID_OPTION_COUNT",
    "FOUR_OPTION_MCQ",
    "FOUR_OPTION_MCQ_CONFIRMED",
    "NO_CORRECT_OPTION",
    "MULTIPLE_CORRECT_OPTIONS",
    "EMPTY_OPTION",
    "INVALID_QUESTION_EXPLANATION",
    "INVALID_OPTION_EXPLANATION",
  ]);
  const issues = (candidate.issues || []).filter((issue) => !structuralCodes.has(issue.code));
  if (candidate.question_text.trim().length < 8) {
    issues.push({ code: "EMPTY_STEM", severity: "ERROR", message: "Question stem must be at least 8 characters." });
  }
  if (candidate.options.length === MIN_MCQ_OPTIONS) {
    issues.push(candidate.allow_four_options
      ? { code: "FOUR_OPTION_MCQ_CONFIRMED", severity: "INFO", message: "Instructor confirmed that this MCQ intentionally contains four answer choices (A–D)." }
      : { code: "FOUR_OPTION_MCQ", severity: "WARNING", message: "This MCQ has four answer choices. Confirm that A–D is intentional rather than a missing fifth choice." });
  } else if (!hasSupportedOptionCount(candidate.options.length)) {
    issues.push({ code: "INVALID_OPTIONS_COUNT", severity: "ERROR", message: "Every MCQ must contain four or five answer options." });
  }
  if (candidate.options.some((option) => !option.option_text.trim())) {
    issues.push({ code: "EMPTY_OPTION", severity: "WARNING", message: "One or more answer options are empty." });
  }
  const correctCount = candidate.options.filter((option) => option.is_correct).length;
  if (correctCount === 0) issues.push({ code: "NO_CORRECT_OPTION", severity: "ERROR", message: "Select the single correct answer." });
  if (correctCount > 1) issues.push({ code: "MULTIPLE_CORRECT_OPTIONS", severity: "ERROR", message: "Only one option can be correct." });
  if (candidate.explanation && !isExplanationValid(candidate.explanation)) {
    issues.push({ code: "INVALID_QUESTION_EXPLANATION", severity: "ERROR", message: "Question explanation must be at most 2 sentences and 220 characters." });
  }
  if (candidate.options.some((option) => option.explanation && !isExplanationValid(option.explanation))) {
    issues.push({ code: "INVALID_OPTION_EXPLANATION", severity: "ERROR", message: "Each option explanation must be at most 2 sentences and 220 characters." });
  }

  const hasError = issues.some((issue) => issue.severity === "ERROR");
  const hasWarning = issues.some((issue) => issue.severity === "WARNING")
    || candidate.topic_confidence < 0.08
    || Boolean(candidate.duplicate);
  return {
    ...candidate,
    issues,
    status: hasError ? "INVALID" : hasWarning ? "NEEDS_REVIEW" : "VALID",
  };
}

function markSourceChanged(candidate: Candidate): Candidate {
  const generated = candidate.ai_enrichment?.status === "GENERATED" || hasCompleteExplanations(candidate);
  return {
    ...candidate,
    approved: false,
    ai_enrichment: generated
      ? { ...candidate.ai_enrichment, status: "STALE" }
      : candidate.ai_enrichment,
  };
}

function enrichmentPayload(candidate: Candidate) {
  return {
    candidate_id: candidate.candidate_id,
    question_text: candidate.question_text,
    source_section: candidate.source_section || undefined,
    allow_four_options: Boolean(candidate.allow_four_options),
    difficulty: candidate.difficulty,
    explanation: candidate.explanation?.trim() || undefined,
    options: candidate.options.map((option) => ({
      label: option.label,
      option_text: option.option_text,
      is_correct: option.is_correct,
      explanation: option.explanation?.trim() || undefined,
    })),
    ai_enrichment: candidate.ai_enrichment || undefined,
  };
}

function inspectionErrorMessage(cause: unknown) {
  if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) {
    return "PDF inspection took too long. The server may still be processing OCR; please try again.";
  }
  return cause instanceof Error ? cause.message : "The request failed.";
}


function useMobileQuestionReview() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  return mobile;
}

type CandidateEditorProps = {
  candidate: Candidate;
  displayNumber: number;
  topicName: string;
  structurallyBlocked: boolean;
  enriching: boolean;
  onUpdate: (candidateId: string, updater: (candidate: Candidate) => Candidate) => void;
  onEditSource: (candidateId: string, updater: (candidate: Candidate) => Candidate) => void;
  onAddChoice: (candidateId: string) => void;
  onRemoveChoice: (candidateId: string, optionLabel: string) => void;
  onRemove: (candidateId: string) => void;
  onGenerate: (targets: Candidate[], force: boolean) => Promise<void>;
};

const CandidateEditor = memo(function CandidateEditor({
  candidate,
  displayNumber,
  topicName,
  structurallyBlocked,
  enriching,
  onUpdate,
  onEditSource,
  onAddChoice,
  onRemoveChoice,
  onRemove,
  onGenerate,
}: CandidateEditorProps) {
  const currentAiStatus = aiStatus(candidate);
  const publishable = candidateIsPublishable(candidate);

  return (
    <article className={`question-import-candidate ${candidate.approved ? "approved" : ""}`}>
      <header>
        <div className="question-import-candidate-number">
          <span>{candidate.question_number ?? displayNumber}</span>
          <div>
            <strong>Question {candidate.question_number ?? displayNumber}</strong>
            <small>{candidate.source_page ? `Page ${candidate.source_page}` : "Manual"}{candidate.answer_key_label ? ` · Source answer ${candidate.answer_key_label}` : ""}</small>
          </div>
        </div>
        <div className="question-import-candidate-status">
          <span className={`role-status ${statusClass(candidate.status)}`}>{candidate.status === "VALID" ? "READY" : candidate.status.replaceAll("_", " ")}</span>
          <span>AI {currentAiStatus.replaceAll("_", " ")}</span>
          <button type="button" className="question-import-remove-btn" onClick={() => onRemove(candidate.candidate_id)}><FiTrash2 /> Remove</button>
        </div>
      </header>

      {candidate.issues.length > 0 && (
        <div className="question-import-inline-issues">
          {candidate.issues.map((issue, index) => (
            <span className={issue.severity.toLowerCase()} key={`${issue.code}-${index}`}>
              {issue.severity === "ERROR" ? <FiXCircle /> : <FiAlertTriangle />}{issue.message}
            </span>
          ))}
        </div>
      )}

      {candidate.duplicate && (
        <div className="question-import-duplicate">
          <FiSearch />
          <div>
            <strong>{candidate.duplicate.exact ? "Exact question already exists" : `Possible duplicate · ${percent(candidate.duplicate.similarity)}`}</strong>
            <p>{candidate.duplicate.question_text}</p>
          </div>
          <div className="question-import-duplicate-actions">
            <button type="button" onClick={() => onUpdate(candidate.candidate_id, (current) => ({ ...current, reuse_question_id: current.duplicate?.question_id, allow_duplicate: false, approved: false }))}><FiCheckCircle /> Reuse existing</button>
            <button type="button" onClick={() => onUpdate(candidate.candidate_id, (current) => ({ ...current, reuse_question_id: undefined, allow_duplicate: true, approved: false }))}>Create separate copy</button>
          </div>
        </div>
      )}

      <label className="question-import-stem">
        <span>Question stem</span>
        <textarea value={candidate.question_text} onChange={(event) => onEditSource(candidate.candidate_id, (current) => ({ ...current, question_text: event.target.value, reuse_question_id: undefined }))} />
      </label>

      <div className="question-import-options">
        <div className="question-import-options-header">
          <span>Four or five answer options supported · currently {candidate.options.length}</span>
          <button type="button" className="question-import-add-option-btn" disabled={candidate.options.length >= OPTION_LABELS.length} onClick={() => onAddChoice(candidate.candidate_id)}><FiPlus /> Add choice</button>
        </div>

        {candidate.options.length === MIN_MCQ_OPTIONS && (
          <label className="question-import-confirm">
            <input
              type="checkbox"
              checked={Boolean(candidate.allow_four_options)}
              onChange={(event) => onUpdate(candidate.candidate_id, (current) => ({
                ...current,
                allow_four_options: event.target.checked,
                approved: false,
              }))}
            />
            <span>I confirm this question intentionally has four answer choices (A–D).</span>
          </label>
        )}

        {candidate.options.map((option, optionIndex) => (
          <div key={`${candidate.candidate_id}-${option.label}-${optionIndex}`} className="question-import-option-block">
            <div className={`question-import-option-row ${option.is_correct ? "correct" : ""}`}>
              <input aria-label={`Mark choice ${option.label} as correct`} type="radio" name={`correct-${candidate.candidate_id}`} checked={option.is_correct} onChange={() => onEditSource(candidate.candidate_id, (current) => ({ ...current, options: current.options.map((value, index) => ({ ...value, is_correct: index === optionIndex })) }))} />
              <strong>{option.label}</strong>
              <input aria-label={`Choice ${option.label}`} type="text" value={option.option_text} onChange={(event) => onEditSource(candidate.candidate_id, (current) => ({ ...current, reuse_question_id: undefined, options: current.options.map((value, index) => index === optionIndex ? { ...value, option_text: event.target.value } : value) }))} />
              <button
                type="button"
                className="question-import-option-delete-btn"
                aria-label={`Remove choice ${option.label}`}
                title={`Remove choice ${option.label}`}
                data-phase5-confirmed="true"
                disabled={candidate.options.length <= 2}
                onClick={() => onRemoveChoice(candidate.candidate_id, option.label)}
              ><FiTrash2 /></button>
            </div>
            <label className="question-import-option-explanation">
              <span style={{ fontSize: "0.82rem", opacity: 0.78 }}>{option.is_correct ? "Why this is correct" : "Why this is incorrect"} · max 2 short sentences</span>
              <textarea rows={2} maxLength={EXPLANATION_MAX_LENGTH} value={option.explanation || ""} placeholder="Concise reason…" onChange={(event) => onUpdate(candidate.candidate_id, (current) => ({ ...current, approved: false, options: current.options.map((value, index) => index === optionIndex ? { ...value, explanation: event.target.value } : value) }))} />
              <small style={{ justifySelf: "end" }}>{(option.explanation || "").length}/{EXPLANATION_MAX_LENGTH}</small>
            </label>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: "0.75rem", padding: "0.9rem", border: "1px solid var(--border, #d9e0e8)", borderRadius: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
          <div>
            <strong>AI explanation</strong>
            <div style={{ fontSize: "0.82rem", opacity: 0.76 }}>{candidate.ai_enrichment?.model || "Muse Spark 1.3"} · {currentAiStatus.replaceAll("_", " ")}{candidate.ai_enrichment?.confidence != null ? ` · ${Math.round(candidate.ai_enrichment.confidence * 100)}% confidence` : ""}</div>
          </div>
          <button type="button" className="pp-button secondary" disabled={enriching || structurallyBlocked || !isAiEligible(candidate)} onClick={() => void onGenerate([candidate], currentAiStatus !== "NOT_GENERATED" && currentAiStatus !== "DEFERRED_BILLING")}>
            {enriching ? <><FiRefreshCw className="spin" /> Generating…</> : currentAiStatus === "NOT_GENERATED" ? "Generate explanation" : "Regenerate explanation"}
          </button>
        </div>
        {currentAiStatus === "STALE" && <p className="form-error">Question content changed after generation. Regenerate before publication.</p>}
        <label>
          <span>Question-level takeaway · max 2 short sentences</span>
          <textarea rows={2} maxLength={EXPLANATION_MAX_LENGTH} value={candidate.explanation || ""} placeholder="Summarized learning point…" onChange={(event) => onUpdate(candidate.candidate_id, (current) => ({ ...current, approved: false, explanation: event.target.value }))} />
          <small style={{ float: "right" }}>{(candidate.explanation || "").length}/{EXPLANATION_MAX_LENGTH}</small>
        </label>
      </div>

      <div className="question-import-meta-controls">
        <label>Difficulty<select value={candidate.difficulty} onChange={(event) => onUpdate(candidate.candidate_id, (current) => ({ ...current, difficulty: event.target.value as Candidate["difficulty"] }))}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label>
        <label>Marks<input type="number" min="1" max="999" value={candidate.marks} onChange={(event) => onUpdate(candidate.candidate_id, (current) => ({ ...current, marks: Math.max(1, Math.round(Number(event.target.value) || 1)) }))} /></label>
      </div>

      {candidate.topic_confidence < 0.08 && (
        <label className="question-import-confirm">
          <input type="checkbox" checked={Boolean(candidate.allow_topic_override)} onChange={(event) => onUpdate(candidate.candidate_id, (current) => ({ ...current, allow_topic_override: event.target.checked, approved: false }))} />
          <span>I reviewed the topic mismatch and confirm this belongs to <strong>{topicName}</strong>.</span>
        </label>
      )}

      <footer>
        <label className="question-import-approve">
          <input type="checkbox" checked={Boolean(candidate.approved)} disabled={!publishable} onChange={(event) => onUpdate(candidate.candidate_id, (current) => ({ ...current, approved: event.target.checked }))} />
          <span>{candidate.reuse_question_id ? "Approve reuse" : "Approve for publication"}</span>
        </label>
        {!publishable && !candidate.reuse_question_id && <span style={{ fontSize: "0.82rem", opacity: 0.76 }}>AI is not required for approval. If any explanation is present, complete the question explanation plus every supplied option explanation (or regenerate them) before approval.</span>}
      </footer>
    </article>
  );
});

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
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Candidate["status"]>("ALL");
  const isMobileReview = useMobileQuestionReview();
  const [mobileCandidateId, setMobileCandidateId] = useState<string | null>(null);

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
    if (!courseId || !topicId || !file || !copyrightConfirmed) {
      notify({ title: "Complete the import details", description: "Choose course, topic and PDF, then confirm permission to use the material.", tone: "info" });
      return;
    }
    if (file.size > 50 * 1024 * 1024 || !/\.pdf$/i.test(file.name)) {
      notify({ title: "Invalid PDF", description: "Use a .pdf file no larger than 50 MB.", tone: "error" });
      return;
    }

    setInspecting(true);
    setError(null);
    setInspection(null);
    setCandidates([]);
    notify({ title: "Inspecting PDF", description: "Extracting Unicode text, matching section-scoped answer keys and validating A–D / A–E MCQs.", tone: "info" });
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("topic_id", topicId);
      body.append("copyright_confirmed", "true");
      const result = await request<Inspection>("/questions/imports/inspect", {
        method: "POST",
        body,
        signal: AbortSignal.timeout(300_000),
      });
      if ((result.inspector_contract_version ?? 0) < 7) {
        throw new Error("The running backend uses an outdated MCQ Inspector contract. Update/restart the backend before using this importer.");
      }
      setInspection(result);
      setCandidates(result.candidates.map((candidate) => recalculateCandidate({
        ...candidate,
        options: normalizeOptions(candidate.options),
        ai_enrichment: candidate.ai_enrichment ?? null,
        approved: false,
        allow_topic_override: false,
        allow_duplicate: false,
        allow_four_options: false,
      })));
      notify({
        title: "PDF inspection complete",
        description: `${result.candidates.length} MCQ candidate(s) extracted. Generate concise explanations, review, then publish.`,
        tone: "success",
      });
    } catch (cause) {
      const message = inspectionErrorMessage(cause);
      setError(message);
      notify({ title: "PDF inspection failed", description: message, tone: "error" });
    } finally {
      setInspecting(false);
    }
  }

  const updateCandidate = useCallback((candidateId: string, updater: (candidate: Candidate) => Candidate) => {
    setCandidates((current) => current.map((candidate) =>
      candidate.candidate_id === candidateId ? recalculateCandidate(updater(candidate)) : candidate,
    ));
  }, []);

  const editSource = useCallback((candidateId: string, updater: (candidate: Candidate) => Candidate) => {
    updateCandidate(candidateId, (candidate) => markSourceChanged(updater(candidate)));
  }, [updateCandidate]);

  const addChoice = useCallback((candidateId: string) => {
    editSource(candidateId, (candidate) => {
      if (candidate.options.length >= OPTION_LABELS.length) return candidate;
      return {
        ...candidate,
        reuse_question_id: undefined,
        allow_four_options: false,
        options: relabelOptions([
          ...candidate.options,
          {
            label: "",
            option_text: "",
            is_correct: false,
            explanation: null,
          },
        ]),
      };
    });
  }, [editSource]);

  const removeChoice = useCallback((candidateId: string, optionLabel: string) => {
    // Route removals through the same candidate-id based source-edit pipeline as
    // add/edit operations. The updater receives the latest committed candidate,
    // so a rapid add -> remove sequence cannot act on a stale rendered array.
    editSource(candidateId, (candidate) => {
      const normalizedLabel = optionLabel.trim().toUpperCase();
      const optionIndex = candidate.options.findIndex(
        (option) => option.label.trim().toUpperCase() === normalizedLabel,
      );
      if (candidate.options.length <= 2 || optionIndex < 0) return candidate;

      const options = relabelOptions(
        candidate.options.filter((_, index) => index !== optionIndex),
      );

      // Deleting an option changes the source question. In particular, a
      // five-choice MCQ becoming A-D must require explicit four-choice
      // confirmation again before it can be published.
      return {
        ...candidate,
        reuse_question_id: undefined,
        allow_four_options: false,
        options,
      };
    });
  }, [editSource]);

  const removeCandidate = useCallback((candidateId: string) => {
    setCandidates((current) => current.filter((candidate) => candidate.candidate_id !== candidateId));
  }, []);

  const mergeEnriched = useCallback((batch: Candidate[]) => {
    const byId = new Map(batch.map((candidate) => [candidate.candidate_id, candidate]));
    setCandidates((current) => current.map((candidate) => {
      const enriched = byId.get(candidate.candidate_id);
      if (!enriched) return candidate;
      return recalculateCandidate({
        ...candidate,
        explanation: enriched.explanation,
        difficulty: enriched.difficulty,
        options: candidate.options.map((option, index) => ({
          ...option,
          explanation: enriched.options[index]?.explanation ?? option.explanation ?? null,
        })),
        ai_enrichment: enriched.ai_enrichment,
        issues: enriched.issues,
        status: enriched.status,
        approved: false,
      });
    }));
  }, []);

  const generateExplanations = useCallback(async (targets: Candidate[], force: boolean) => {
    if (!inspection || targets.length === 0) return;
    if (inspection.summary?.structurally_complete === false) {
      notify({
        title: "Extraction is incomplete",
        description: "Resolve missing, duplicate, or conflicting questions before generating explanations.",
        tone: "error",
      });
      return;
    }
    const eligible = targets.filter(isAiEligible);
    if (!eligible.length) {
      notify({ title: "No eligible questions", description: "Each question needs a valid stem, four or five sequential choices, one source-correct answer, and four-choice confirmation when applicable before AI generation.", tone: "info" });
      return;
    }

    setEnrichingIds((current) => new Set([...current, ...eligible.map((candidate) => candidate.candidate_id)]));
    let generated = 0;
    let reused = 0;
    let failedQuestions = 0;
    let billingDeferred = 0;
    let failedBatches = 0;
    let firstFailure = "";
    try {
      for (let offset = 0; offset < eligible.length; offset += ENRICHMENT_BATCH_SIZE) {
        const batch = eligible.slice(offset, offset + ENRICHMENT_BATCH_SIZE);
        try {
          const result = await request<EnrichmentResponse>("/questions/imports/enrich", {
            method: "POST",
            body: {
              topic_name: inspection.topic.name,
              force,
              candidates: batch.map(enrichmentPayload),
            },
            signal: AbortSignal.timeout(240_000),
          });
          mergeEnriched(result.candidates);
          const failedCandidates = result.candidates.filter((candidate) => ["FAILED", "FAILED_RETRYABLE", "FAILED_VALIDATION"].includes(candidate.ai_enrichment?.status || ""));
          const deferredCandidates = result.candidates.filter((candidate) => candidate.ai_enrichment?.status === "DEFERRED_BILLING");
          generated += result.enrichment_summary?.generated ?? result.candidates.filter((candidate) => candidate.ai_enrichment?.status === "GENERATED").length;
          reused += result.enrichment_summary?.cached ?? result.candidates.filter((candidate) => candidate.ai_enrichment?.status === "CACHED").length;
          failedQuestions += result.enrichment_summary?.failed ?? failedCandidates.length;
          billingDeferred += result.enrichment_summary?.billing_deferred ?? deferredCandidates.length;
          if (!firstFailure) {
            firstFailure = [...deferredCandidates, ...failedCandidates]
              .flatMap((candidate) => candidate.issues || [])
              .find((issue) => issue.code.startsWith("AI_ENRICHMENT_FAILED") || issue.code === "AI_ENRICHMENT_DEFERRED_BILLING")?.message || "";
          }
          if (deferredCandidates.length > 0) {
            const remaining = eligible.slice(offset + batch.length);
            billingDeferred += remaining.length;
            const message = firstFailure || "OpenRouter has insufficient usable credit. Add credits or raise the key limit, then retry these questions.";
            const remainingIds = new Set(remaining.map((candidate) => candidate.candidate_id));
            setCandidates((current) => current.map((candidate) => remainingIds.has(candidate.candidate_id)
              ? recalculateCandidate({
                ...candidate,
                approved: false,
                status: "NEEDS_REVIEW",
                ai_enrichment: { ...candidate.ai_enrichment, status: "DEFERRED_BILLING" },
                issues: [
                  ...candidate.issues.filter((issue) => issue.code !== "AI_ENRICHMENT_DEFERRED_BILLING"),
                  { code: "AI_ENRICHMENT_DEFERRED_BILLING", severity: "WARNING", message },
                ],
              })
              : candidate));
            break;
          }
        } catch (cause) {
          failedBatches += 1;
          failedQuestions += batch.length;
          const message = inspectionErrorMessage(cause);
          if (!firstFailure) firstFailure = message;
          setError(message);
        } finally {
          setEnrichingIds((current) => {
            const next = new Set(current);
            batch.forEach((candidate) => next.delete(candidate.candidate_id));
            return next;
          });
        }
      }
      const hadFailures = failedQuestions > 0 || failedBatches > 0;
      const billingBlocked = billingDeferred > 0;
      const completeFailure = generated === 0 && reused === 0 && (hadFailures || billingBlocked);
      if (completeFailure && firstFailure) setError(firstFailure);
      notify({
        title: completeFailure
          ? billingBlocked ? "Explanation generation paused for billing" : "Explanation generation failed"
          : billingBlocked
            ? "Explanation generation paused for billing"
            : hadFailures
            ? "Explanation generation partially completed"
            : "Explanations ready for review",
        description: completeFailure
          ? billingBlocked
            ? `0 generated · ${reused} reused · ${billingDeferred} deferred. ${firstFailure || "Add OpenRouter credit and retry."}`
            : `0 generated · ${failedQuestions || eligible.length} question(s) failed. ${firstFailure || "Check the configured AI provider and try again."}`
          : `${generated} generated · ${reused} reused${billingBlocked ? ` · ${billingDeferred} deferred because OpenRouter credit is unavailable` : hadFailures ? ` · ${failedQuestions} failed` : ""}.`,
        tone: completeFailure && !billingBlocked ? "error" : billingBlocked || hadFailures ? "info" : "success",
      });
    } finally {
      setEnrichingIds((current) => {
        const next = new Set(current);
        eligible.forEach((candidate) => next.delete(candidate.candidate_id));
        return next;
      });
    }
  }, [inspection, mergeEnriched, notify, request]);

  function addManualCandidate() {
    const candidate: Candidate = recalculateCandidate({
      candidate_id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      question_number: candidates.length + 1,
      source_page: null,
      answer_key_label: null,
      answer_key_page: null,
      question_text: "",
      options: OPTION_LABELS.map((label, index) => ({
        label,
        option_text: "",
        is_correct: index === 0,
        explanation: null,
      })),
      explanation: null,
      difficulty: "MEDIUM",
      marks: 1,
      extraction_confidence: 1,
      topic_confidence: 1,
      status: "INVALID",
      issues: [],
      duplicate: null,
      ai_enrichment: null,
      approved: false,
      allow_topic_override: true,
      allow_duplicate: false,
      allow_four_options: false,
    });
    setCandidates((current) => [...current, candidate]);
  }

  function confirmAllFourChoiceQuestions() {
    const pending = candidates.filter(
      (candidate) => candidate.options.length === MIN_MCQ_OPTIONS && !candidate.allow_four_options,
    );
    if (!pending.length) {
      notify({
        title: "Four-choice MCQs already confirmed",
        description: "There are no unconfirmed four-choice questions in this inspection.",
        tone: "info",
      });
      return;
    }
    const ids = new Set(pending.map((candidate) => candidate.candidate_id));
    setCandidates((current) => current.map((candidate) =>
      ids.has(candidate.candidate_id)
        ? recalculateCandidate({ ...candidate, allow_four_options: true, approved: false })
        : candidate,
    ));
    notify({
      title: "Four-choice MCQs confirmed",
      description: `${pending.length} question(s) marked as intentionally containing A–D choices.`,
      tone: "success",
    });
  }

  function approveAllReady() {
    if (inspection?.summary?.structurally_complete === false) {
      notify({
        title: "Extraction is incomplete",
        description: "Resolve the missing/duplicate question or answer-key errors before bulk approval.",
        tone: "error",
      });
      return;
    }
    let approved = 0;
    setCandidates((current) => current.map((candidate) => {
      const reviewedCandidate = {
        ...candidate,
        allow_topic_override: candidate.topic_confidence < 0.08 ? true : candidate.allow_topic_override,
      };
      const ready = candidateIsPublishable(reviewedCandidate);
      if (ready) approved += 1;
      return { ...reviewedCandidate, approved: ready };
    }));
    notify({
      title: approved ? "Ready questions approved" : "No questions are ready yet",
      description: approved
        ? `${approved} question(s) approved. AI explanations are optional; incomplete or stale explanation sets still need review.`
        : "Fix structural errors, duplicates, or partial/stale explanations before approval.",
      tone: approved ? "success" : "info",
    });
  }

  async function publishApproved() {
    if (!inspection) return;
    if (inspection.summary?.structurally_complete === false) {
      notify({
        title: "Cannot publish an incomplete extraction",
        description: "The section answer keys prove that questions are missing, duplicated, or conflicting. Fix the extraction and inspect again.",
        tone: "error",
      });
      return;
    }
    const approved = candidates.filter((candidate) => candidate.approved);
    if (!approved.length) {
      notify({ title: "Nothing approved", description: "Approve at least one reviewed question first.", tone: "info" });
      return;
    }
    const blocked = approved.find((candidate) => !candidateIsPublishable(candidate));
    if (blocked) {
      const reason = aiStatus(blocked) === "STALE"
        ? "Its explanation is stale after the question/options changed. Regenerate it first."
        : "It needs four or five complete options, one correct answer, four-choice confirmation when applicable, and concise explanations for every supplied choice.";
      notify({ title: `Question ${blocked.question_number ?? ""} is not publishable`, description: reason, tone: "error" });
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
            marks: Math.max(1, Math.round(Number(candidate.marks) || 1)),
            options: candidate.options.map((option) => ({
              option_text: option.option_text.trim(),
              explanation: option.explanation?.trim() || undefined,
              is_correct: option.is_correct,
            })),
            source_page: candidate.source_page ?? undefined,
            reuse_question_id: candidate.reuse_question_id || undefined,
            allow_topic_override: Boolean(candidate.allow_topic_override),
            allow_duplicate: Boolean(candidate.allow_duplicate),
            allow_four_options: Boolean(candidate.allow_four_options),
          })),
        },
      });
      notify({ title: "Question bank updated", description: `${result.created} created · ${result.reused} reused · ${result.skipped} skipped.`, tone: "success" });
      setInspection(null);
      setCandidates([]);
      setFile(null);
    } catch (cause) {
      const message = inspectionErrorMessage(cause);
      setError(message);
      notify({ title: "Publication failed", description: message, tone: "error" });
    } finally {
      setPublishing(false);
    }
  }

  const topics = useMemo(() => flattenTopics(course), [course]);
  const approvedCount = candidates.filter((candidate) => candidate.approved).length;
  const fourChoiceCount = candidates.filter((candidate) => candidate.options.length === MIN_MCQ_OPTIONS).length;
  const unconfirmedFourChoiceCount = candidates.filter(
    (candidate) => candidate.options.length === MIN_MCQ_OPTIONS && !candidate.allow_four_options,
  ).length;
  const structurallyBlocked = inspection?.summary?.structurally_complete === false;
  const expectedQuestions = inspection?.summary?.expected ?? null;
  const statusCounts = useMemo(() => ({
    ALL: candidates.length,
    VALID: candidates.filter((candidate) => candidate.status === "VALID").length,
    NEEDS_REVIEW: candidates.filter((candidate) => candidate.status === "NEEDS_REVIEW").length,
    INVALID: candidates.filter((candidate) => candidate.status === "INVALID").length,
  }), [candidates]);
  const aiCounts = useMemo(() => ({
    generated: candidates.filter((candidate) => aiStatus(candidate) === "GENERATED").length,
    stale: candidates.filter((candidate) => aiStatus(candidate) === "STALE").length,
    failed: candidates.filter((candidate) => aiStatus(candidate) === "FAILED").length,
  }), [candidates]);
  const deferredCandidateSearch = useDeferredValue(candidateSearch.trim().toLowerCase());

  const searchableCandidates = useMemo(() => candidates.map((candidate, index) => ({
    candidate,
    index,
    searchText: [
      candidate.question_number,
      candidate.question_text,
      candidate.answer_key_label,
      candidate.explanation,
      ...candidate.options.flatMap((option) => [option.option_text, option.explanation]),
    ]
      .map((value) => String(value ?? "").toLowerCase())
      .join("\n"),
  })), [candidates]);

  const visibleCandidates = useMemo(() => searchableCandidates
    .filter(({ candidate, searchText }) => {
      if (statusFilter !== "ALL" && candidate.status !== statusFilter) return false;
      return !deferredCandidateSearch || searchText.includes(deferredCandidateSearch);
    })
    .map(({ candidate, index }) => ({ candidate, index })), [
      deferredCandidateSearch,
      searchableCandidates,
      statusFilter,
    ]);

  useEffect(() => {
    if (!isMobileReview) return;
    setMobileCandidateId((current) => {
      if (current && visibleCandidates.some(({ candidate }) => candidate.candidate_id === current)) return current;
      return visibleCandidates[0]?.candidate.candidate_id ?? null;
    });
  }, [isMobileReview, visibleCandidates]);

  const mobileCandidatePosition = useMemo(() => {
    if (!isMobileReview || !mobileCandidateId) return -1;
    return visibleCandidates.findIndex(({ candidate }) => candidate.candidate_id === mobileCandidateId);
  }, [isMobileReview, mobileCandidateId, visibleCandidates]);

  const mobileCandidate = mobileCandidatePosition >= 0
    ? visibleCandidates[mobileCandidatePosition]
    : null;

  const selectMobileCandidateAt = useCallback((position: number) => {
    const next = visibleCandidates[position];
    if (!next) return;
    setMobileCandidateId(next.candidate.candidate_id);
  }, [visibleCandidates]);

  if (authLoading || loading) {
    return <ProductShell><main className="pp-page"><PageSkeleton variant="workspace" label="Loading question importer" /></main></ProductShell>;
  }
  if (!user || user.role === "STUDENT") {
    return <ProductShell><main className="pp-page"><Panel title="Instructor access required"><p>PDF question inspection is restricted to instructors and system administrators.</p></Panel></main></ProductShell>;
  }

  return (
    <ProductShell search="Search question imports">
      <main className="pp-page question-import-page">
        <header className="question-import-heading">
          <div>
            <Link href={user.role === "SYSTEM_ADMIN" ? "/admin/questions" : "/instructor/questions"} className="question-import-back">
              <FiArrowLeft /> Question bank
            </Link>
            <span className="page-eyebrow">INSTRUCTOR · AUTOMATED INGESTION</span>
            <h1>PDF Question Inspector</h1>
            <p>Extract A–E MCQs first, then use Muse Spark 1.3 to generate concise, reviewable explanations without changing the source answer key.</p>
          </div>
          <div className="question-import-trust">
            <FiShield />
            <span><strong>Source answer stays authoritative</strong><small>AI may flag a questionable key, but it cannot silently replace it.</small></span>
          </div>
        </header>

        <Panel className="question-import-upload-panel">
          <form onSubmit={inspect} className="question-import-upload-form" noValidate>
            <div className="question-import-fields">
              <label><span>Course</span><select value={courseId} onChange={(event) => void chooseCourse(event.target.value)}><option value="">Select course…</option>{courses.map((item) => <option value={item.id} key={item.id}>{item.courseCode} · {item.courseName}</option>)}</select></label>
              <label><span>Destination topic</span><select value={topicId} disabled={!course} onChange={(event) => { setTopicId(event.target.value); setInspection(null); setCandidates([]); }}><option value="">Select exact topic…</option>{topics.map((topic) => <option value={topic.id} key={`${topic.id}-${topic.path}`}>{topic.path} · {topic.topicName}</option>)}</select></label>
              <label className="question-import-file"><span>Question PDF</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => { setFile(event.target.files?.[0] || null); setInspection(null); setCandidates([]); }} /><small>PDF · max 50 MB · canonical MCQs may contain A–D or A–E.</small></label>
            </div>
            <label className="question-import-rights"><input type="checkbox" checked={copyrightConfirmed} onChange={(event) => setCopyrightConfirmed(event.target.checked)} /><span>I confirm I have permission to use and publish this material.</span></label>
            <div className="question-import-upload-actions">
              <button type="submit" className="pp-button" disabled={inspecting}>{inspecting ? <><FiRefreshCw className="spin" /> Inspecting…</> : <><FiUploadCloud /> Inspect PDF</>}</button>
              {inspecting && <span role="status">Parsing the PDF and validating source answers. AI generation happens after inspection.</span>}
            </div>
          </form>
        </Panel>

        {error && <p className="form-error" role="alert">{error}</p>}

        {inspection && (
          <>
            <section className="question-import-summary" aria-label="Import summary">
              <Panel><small>FILE</small><strong>{inspection.original_filename}</strong><span>{inspection.page_count} page(s)</span></Panel>
              <Panel><small>EXTRACTION</small><strong>{percent(inspection.extraction_confidence)}</strong><span>{inspection.extraction_method.replaceAll("_", " ")}{inspection.extraction_breakdown?.ocr_pages ? ` · ${inspection.extraction_breakdown.ocr_pages} OCR page(s)` : ""}</span></Panel>
              <Panel><small>QUESTIONS</small><strong>{expectedQuestions == null ? candidates.length : `${candidates.length} / ${expectedQuestions}`}</strong><span>{inspection.summary?.missing ? `${inspection.summary.missing} missing · ` : ""}{statusCounts.VALID} ready · {statusCounts.NEEDS_REVIEW} review · {statusCounts.INVALID} invalid</span></Panel>
              <Panel><small>AI EXPLANATIONS</small><strong>{aiCounts.generated}</strong><span>{aiCounts.stale} stale · {aiCounts.failed} failed</span></Panel>
            </section>

            {inspection.issues.length > 0 && <Panel title="Batch checks" className="question-import-batch-issues">{inspection.issues.map((issue, index) => <div className={`question-import-issue ${issue.severity.toLowerCase()}`} key={`${issue.code}-${index}`}><span>{issue.severity === "ERROR" ? <FiXCircle /> : <FiAlertTriangle />}</span><div><strong>{issue.code.replaceAll("_", " ")}</strong><p>{issue.message}</p></div></div>)}</Panel>}

            {inspection.pages && inspection.pages.some((page) => page.source !== "TEXT_LAYER" || page.confidence < 0.7 || page.layout_reflowed) && (
              <Panel title="Page extraction diagnostics">
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {inspection.pages
                    .filter((page) => page.source !== "TEXT_LAYER" || page.confidence < 0.7 || page.layout_reflowed)
                    .map((page) => (
                      <span
                        key={page.page}
                        style={{
                          border: "1px solid var(--border, #d9e0e8)",
                          borderRadius: "999px",
                          padding: "0.4rem 0.65rem",
                          fontSize: "0.82rem",
                        }}
                        title={`${page.text_length} extracted characters${page.ocr_attempted ? " · OCR attempted" : ""}${page.layout_reflowed ? " · two-column layout reflowed" : ""}`}
                      >
                        Page {page.page} · {page.source.replaceAll("_", " ")} · {percent(page.confidence)}
                        {page.layout_reflowed ? " · reflowed" : ""}
                      </span>
                    ))}
                </div>
              </Panel>
            )}

            {inspection.sections && inspection.sections.length > 0 && (
              <Panel title="Section completeness">
                <div style={{ display: "grid", gap: "0.65rem" }}>
                  {inspection.sections.map((section, index) => {
                    const missing = section.missing_question_numbers || [];
                    const unexpected = section.unexpected_question_numbers || [];
                    const duplicates = section.duplicate_question_numbers || [];
                    const conflicts = section.answer_key_conflicts || [];
                    const complete = section.expected_questions != null
                      && missing.length === 0
                      && unexpected.length === 0
                      && duplicates.length === 0
                      && conflicts.length === 0
                      && section.questions === section.expected_questions;
                    return (
                      <div key={`${section.title}-${index}`} style={{ display: "grid", gridTemplateColumns: "minmax(160px,1fr) auto", gap: "0.4rem 1rem", padding: "0.7rem 0", borderBottom: "1px solid var(--border, #d9e0e8)" }}>
                        <strong>{section.title || `Section ${index + 1}`}</strong>
                        <span>{section.questions}{section.expected_questions != null ? ` / ${section.expected_questions}` : ""} {complete ? "✓" : "⚠"}</span>
                        {!complete && (
                          <small style={{ gridColumn: "1 / -1", opacity: 0.8 }}>
                            {missing.length ? `Missing: ${missing.join(", ")}. ` : ""}
                            {unexpected.length ? `Unexpected: ${unexpected.join(", ")}. ` : ""}
                            {duplicates.length ? `Duplicates: ${duplicates.join(", ")}. ` : ""}
                            {conflicts.length ? `Answer conflicts: ${conflicts.map((item) => item.questionNumber).join(", ")}.` : ""}
                          </small>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

            {candidates.length > 0 && (
              <section className="question-import-review">
                <div className="question-import-review-heading">
                  <div><span className="page-eyebrow">REVIEW · EXPLAIN · PUBLISH</span><h2>Review inspected MCQs</h2><p>Explanations are intentionally short: maximum two sentences / 220 characters. Edit anything before approval.</p></div>
                  <div className="question-import-bulk-actions">
                    <strong>{approvedCount} / {candidates.length}</strong><span>approved</span>
                    {fourChoiceCount > 0 && (
                      <button
                        type="button"
                        className="pp-button secondary"
                        disabled={unconfirmedFourChoiceCount === 0}
                        onClick={confirmAllFourChoiceQuestions}
                      >
                        <FiCheckCircle /> {unconfirmedFourChoiceCount > 0
                          ? `Confirm all 4-choice MCQs (${unconfirmedFourChoiceCount})`
                          : `All 4-choice MCQs confirmed (${fourChoiceCount})`}
                      </button>
                    )}
                    <button type="button" className="pp-button" disabled={enrichingIds.size > 0 || structurallyBlocked} onClick={() => void generateExplanations(candidates.filter((candidate) => !["GENERATED", "CACHED"].includes(aiStatus(candidate))), false)}>{enrichingIds.size ? <><FiRefreshCw className="spin" /> Generating…</> : <><FiRefreshCw /> Generate missing explanations</>}</button>
                    <button type="button" className="pp-button secondary" disabled={structurallyBlocked} onClick={approveAllReady}><FiCheckCircle /> Approve all ready</button>
                  </div>
                </div>

                <div className="question-import-filterbar">
                  <label className="question-import-search"><FiSearch /><input type="search" value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Search question, option, explanation…" /></label>
                  <div className="question-import-status-filters">{([ ["ALL", "All"], ["VALID", "Ready"], ["NEEDS_REVIEW", "Needs review"], ["INVALID", "Invalid"] ] as const).map(([value, label]) => <button type="button" key={value} className={statusFilter === value ? "active" : ""} onClick={() => setStatusFilter(value)}>{label} <span>{statusCounts[value]}</span></button>)}</div>
                </div>

                <div className="question-import-add-question-bar"><button type="button" className="question-import-add-question-btn" onClick={addManualCandidate}><FiPlus /> Add MCQ manually</button></div>

                {isMobileReview ? (
                  <div className="question-import-mobile-review">
                    <div className="question-import-mobile-list" role="list" aria-label="Inspected questions">
                      {visibleCandidates.map(({ candidate, index }) => {
                        const active = candidate.candidate_id === mobileCandidateId;
                        return (
                          <button
                            type="button"
                            role="listitem"
                            key={candidate.candidate_id}
                            className={active ? "active" : ""}
                            aria-current={active ? "true" : undefined}
                            onClick={() => setMobileCandidateId(candidate.candidate_id)}
                          >
                            <span className={`role-status ${statusClass(candidate.status)}`}>
                              {candidate.status === "VALID" ? "READY" : candidate.status === "NEEDS_REVIEW" ? "REVIEW" : "INVALID"}
                            </span>
                            <strong>Q{candidate.question_number ?? index + 1}</strong>
                            <span className="question-import-mobile-answer">{candidate.answer_key_label ? `Answer ${candidate.answer_key_label}` : "No key"}</span>
                            <span className="question-import-mobile-chevron" aria-hidden="true">›</span>
                          </button>
                        );
                      })}
                    </div>

                    {mobileCandidate ? (
                      <>
                        <div className="question-import-mobile-nav" aria-label="Question navigation">
                          <button type="button" className="pp-button secondary" disabled={mobileCandidatePosition <= 0} onClick={() => selectMobileCandidateAt(mobileCandidatePosition - 1)}>
                            Previous
                          </button>
                          <span>{mobileCandidatePosition + 1} / {visibleCandidates.length}</span>
                          <button type="button" className="pp-button secondary" disabled={mobileCandidatePosition >= visibleCandidates.length - 1} onClick={() => selectMobileCandidateAt(mobileCandidatePosition + 1)}>
                            Next
                          </button>
                        </div>

                        <CandidateEditor
                          key={mobileCandidate.candidate.candidate_id}
                          candidate={mobileCandidate.candidate}
                          displayNumber={mobileCandidate.index + 1}
                          topicName={inspection.topic.name}
                          structurallyBlocked={structurallyBlocked}
                          enriching={enrichingIds.has(mobileCandidate.candidate.candidate_id)}
                          onUpdate={updateCandidate}
                          onEditSource={editSource}
                          onAddChoice={addChoice}
                          onRemoveChoice={removeChoice}
                          onRemove={removeCandidate}
                          onGenerate={generateExplanations}
                        />
                      </>
                    ) : (
                      <div className="question-import-empty-filter">No questions match the current filter.</div>
                    )}
                  </div>
                ) : (
                  visibleCandidates.map(({ candidate, index }) => (
                    <CandidateEditor
                      key={candidate.candidate_id}
                      candidate={candidate}
                      displayNumber={index + 1}
                      topicName={inspection.topic.name}
                      structurallyBlocked={structurallyBlocked}
                      enriching={enrichingIds.has(candidate.candidate_id)}
                      onUpdate={updateCandidate}
                      onEditSource={editSource}
                      onAddChoice={addChoice}
                      onRemoveChoice={removeChoice}
                      onRemove={removeCandidate}
                      onGenerate={generateExplanations}
                    />
                  ))
                )}

                <div className="question-import-publish-bar">
                  <div><strong>{approvedCount} of {candidates.length} approved</strong><span>Server-side publication revalidates 4–5 choices, one correct answer, four-choice confirmation, permissions, duplicates, and explanation length.</span></div>
                  <div className="question-import-publish-actions"><button type="button" className="pp-button secondary" onClick={approveAllReady}><FiCheckCircle /> Approve all ready</button><button type="button" className="pp-button" disabled={publishing || approvedCount === 0 || enrichingIds.size > 0 || structurallyBlocked} onClick={() => void publishApproved()}>{publishing ? <><FiRefreshCw className="spin" /> Publishing…</> : <><FiCheck /> Publish approved ({approvedCount})</>}</button></div>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </ProductShell>
  );
}
