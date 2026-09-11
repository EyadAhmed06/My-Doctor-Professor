"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiClipboard,
  FiCopy,
  FiEdit3,
  FiEye,
  FiMoreVertical,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { EmptyState, ErrorState, PageSkeleton } from "./async-state";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";
import "./role-workspace.css";
import "./flashcard-studio-scope.css";

type PageResponse<T> = { data: T[]; total?: number; page?: number; limit?: number; total_pages?: number };
type AssessmentLecture = { id: string; title: string; lectureNumber: number };
type AssessmentWeek = { id: string; weekNumber: number; title: string | null; lectures?: AssessmentLecture[] };
type Course = { id: string; courseCode: string; courseName: string; weeks?: AssessmentWeek[] };
type QuestionOption = { id: string; optionText?: string; option_text?: string; isCorrect?: boolean; is_correct?: boolean };
type Question = {
  id: string;
  questionType: "MCQ" | "ESSAY";
  title: string | null;
  questionText: string;
  explanation: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  marks: string;
  isActive: boolean;
  options?: QuestionOption[];
};
type Test = {
  id: string;
  title: string;
  description: string | null;
  testType: "LECTURE" | "WEEK" | "COURSE" | "CUSTOM" | "QUESTION_BANK";
  courseId: string | null;
  weekId: string | null;
  lectureId: string | null;
  durationMinutes: number | null;
  totalMarks: string | null;
  passingMarks: string | null;
  isPublished: boolean;
  availableFrom?: string | null;
  availableUntil?: string | null;
  createdAt: string;
  updatedAt?: string;
  course?: Course | null;
};
type TestQuestion = {
  id: string;
  questionId: string;
  displayOrder: number;
  marks: string;
  timeLimitSeconds: number | null;
  question: Question;
};
type Attempt = {
  id: string;
  status: string;
  score: string | null;
  submittedAt?: string | null;
  submitted_at?: string | null;
  student?: { user?: { fullName?: string; email?: string }; studentNumber?: string };
};
type ValidationIssue = { code: string; severity: "ERROR" | "WARNING"; message: string };
type AuthoringState = {
  validation: { publishable: boolean; issues: ValidationIssue[]; question_count: number; total_marks: number };
  permissions: { mutable: boolean; can_unpublish: boolean; can_delete: boolean; can_duplicate: boolean };
  activity: Array<{ type: string; at: string; label: string }>;
};
type DraftForm = {
  title: string;
  description: string;
  test_type: Test["testType"];
  course_id: string;
  week_id: string;
  lecture_id: string;
  duration_minutes: number;
  passing_marks: number;
};

const initialDraft: DraftForm = {
  title: "",
  description: "",
  test_type: "CUSTOM",
  course_id: "",
  week_id: "",
  lecture_id: "",
  duration_minutes: 60,
  passing_marks: 50,
};

function Modal({ title, open, onClose, children, wide = false }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return <div className="role-modal-backdrop" role="presentation" onMouseDown={onClose}><section className={`role-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog"><FiX /></button></header>{children}</section></div>;
}

function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = normalized.includes("publish") || normalized.includes("complete") || normalized.includes("active") ? "good" : normalized.includes("draft") || normalized.includes("pending") ? "pending" : "bad";
  return <span className={`role-status ${tone}`}>{value.replaceAll("_", " ")}</span>;
}

export function AdvancedAssessmentsPage({ admin = false }: { admin?: boolean }) {
  const { user, request } = useAuth();
  const { notify, celebrate } = useUx();
  const [tests, setTests] = useState<Test[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [draftCourse, setDraftCourse] = useState<Course | null>(null);
  const [draftCourseLoading, setDraftCourseLoading] = useState(false);
  const [questionBank, setQuestionBank] = useState<Question[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [authoring, setAuthoring] = useState<AuthoringState | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [draft, setDraft] = useState<DraftForm>(initialDraft);
  const [editForm, setEditForm] = useState<DraftForm>(initialDraft);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [editCourseLoading, setEditCourseLoading] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [attachIds, setAttachIds] = useState<Set<string>>(new Set());
  const [selectedAttached, setSelectedAttached] = useState<Set<string>>(new Set());
  const [attachSearch, setAttachSearch] = useState("");
  const [attemptSearch, setAttemptSearch] = useState("");
  const [attemptStatus, setAttemptStatus] = useState("");
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autosaveTimer = useRef(0);
  const draftKey = `mdp:assessment-draft:${user?.id || "anonymous"}`;

  const load = useCallback(async () => {
    if (!user || user.role === "STUDENT") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [testData, courseData, questionData] = await Promise.all([
        request<PageResponse<Test>>("/tests?limit=100"),
        request<PageResponse<Course>>("/academic/courses?limit=100"),
        request<PageResponse<Question>>("/questions?limit=100&is_active=true"),
      ]);
      setTests(testData.data);
      setCourses(courseData.data);
      setQuestionBank(questionData.data);
      setSelectedId((current) => current && testData.data.some((test) => test.id === current) ? current : testData.data[0]?.id || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load assessments.");
    } finally {
      setLoading(false);
    }
  }, [request, user]);

  const loadSelection = useCallback(async (testId: string) => {
    setSelectionLoading(true);
    setError(null);
    try {
      const [items, attemptData, state] = await Promise.all([
        request<TestQuestion[]>(`/tests/${testId}/questions`),
        request<Attempt[]>(`/tests/${testId}/attempts`),
        request<AuthoringState>(`/tests/${testId}/authoring-state`),
      ]);
      setTestQuestions(items);
      setAttempts(attemptData);
      setAuthoring(state);
      setSelectedAttached(new Set());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load assessment details.");
    } finally {
      setSelectionLoading(false);
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selectedId) void loadSelection(selectedId); else { setTestQuestions([]); setAttempts([]); setAuthoring(null); } }, [loadSelection, selectedId]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<DraftForm>;
      setDraft({ ...initialDraft, ...parsed });
      setDraftRestored(true);
    } catch {
      localStorage.removeItem(draftKey);
    }
  }, [draftKey]);

  useEffect(() => {
    window.clearTimeout(autosaveTimer.current);
    if (JSON.stringify(draft) === JSON.stringify(initialDraft)) {
      localStorage.removeItem(draftKey);
      return;
    }
    autosaveTimer.current = window.setTimeout(() => {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    }, 350);
    return () => window.clearTimeout(autosaveTimer.current);
  }, [draft, draftKey]);

  useEffect(() => {
    if (!draft.course_id) {
      setDraftCourse(null);
      setDraftCourseLoading(false);
      return;
    }
    let active = true;
    setDraftCourseLoading(true);
    void request<Course>(`/academic/courses/${draft.course_id}`)
      .then((course) => { if (active) setDraftCourse(course); })
      .catch((cause) => {
        if (!active) return;
        setDraftCourse(null);
        notify({ title: "Could not load course structure", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
      })
      .finally(() => { if (active) setDraftCourseLoading(false); });
    return () => { active = false; };
  }, [draft.course_id, notify, request]);

  useEffect(() => {
    if (!editOpen || !editForm.course_id) {
      setEditCourse(null);
      setEditCourseLoading(false);
      return;
    }
    let active = true;
    setEditCourseLoading(true);
    void request<Course>(`/academic/courses/${editForm.course_id}`)
      .then((course) => { if (active) setEditCourse(course); })
      .catch((cause) => {
        if (!active) return;
        setEditCourse(null);
        notify({ title: "Could not load course structure", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
      })
      .finally(() => { if (active) setEditCourseLoading(false); });
    return () => { active = false; };
  }, [editForm.course_id, editOpen, notify, request]);

  const selected = tests.find((test) => test.id === selectedId) || null;
  const validationErrors = authoring?.validation.issues.filter((issue) => issue.severity === "ERROR") || [];
  const validationWarnings = authoring?.validation.issues.filter((issue) => issue.severity === "WARNING") || [];
  const draftWeeks = draftCourse?.weeks || [];
  const draftWeek = draftWeeks.find((week) => week.id === draft.week_id) || null;
  const draftLectures = draftWeek?.lectures || [];
  const scopedType = draft.test_type === "LECTURE" || draft.test_type === "WEEK" || draft.test_type === "COURSE";
  const editScopedType = editForm.test_type === "LECTURE" || editForm.test_type === "WEEK" || editForm.test_type === "COURSE";
  const editWeeks = editCourse?.weeks || [];
  const editWeek = editWeeks.find((week) => week.id === editForm.week_id) || null;
  const editLectures = editWeek?.lectures || [];
  const filteredBank = useMemo(() => {
    const needle = attachSearch.trim().toLowerCase();
    const attached = new Set(testQuestions.map((item) => item.questionId));
    return questionBank.filter((question) => !attached.has(question.id) && (!needle || `${question.title || ""} ${question.questionText} ${question.difficulty} ${question.questionType}`.toLowerCase().includes(needle)));
  }, [attachSearch, questionBank, testQuestions]);
  const filteredAttempts = useMemo(() => {
    const needle = attemptSearch.trim().toLowerCase();
    return attempts.filter((attempt) => {
      const name = attempt.student?.user?.fullName || attempt.student?.user?.email || attempt.student?.studentNumber || "";
      return (!attemptStatus || attempt.status === attemptStatus) && (!needle || name.toLowerCase().includes(needle));
    });
  }, [attemptSearch, attempts, attemptStatus]);

  async function createTest(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (scopedType && !draft.course_id) {
      notify({ title: "Choose a course", description: `${draft.test_type} assessments must be attached to the academic hierarchy.`, tone: "error" });
      return;
    }
    if ((draft.test_type === "LECTURE" || draft.test_type === "WEEK") && !draft.week_id) {
      notify({ title: "Choose a week", description: `${draft.test_type} assessments require a week.`, tone: "error" });
      return;
    }
    if (draft.test_type === "LECTURE" && !draft.lecture_id) {
      notify({ title: "Choose a lecture", description: "LECTURE assessments require the exact lecture they belong to.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const created = await request<Test>("/tests", {
        method: "POST",
        body: {
          title: draft.title.trim(),
          description: draft.description.trim() || undefined,
          test_type: draft.test_type,
          course_id: draft.course_id || undefined,
          week_id: draft.test_type === "LECTURE" || draft.test_type === "WEEK" ? draft.week_id || undefined : undefined,
          lecture_id: draft.test_type === "LECTURE" ? draft.lecture_id || undefined : undefined,
          duration_minutes: Number(draft.duration_minutes),
          passing_marks: Number(draft.passing_marks),
        },
      });
      localStorage.removeItem(draftKey);
      setDraft(initialDraft);
      setDraftRestored(false);
      setDraftCourse(null);
      setCreateOpen(false);
      await load();
      setSelectedId(created.id);
      notify({ title: "Assessment draft created", description: "Add questions, inspect validation, and preview it before publishing.", tone: "success" });
    } catch (cause) {
      notify({ title: "Could not create assessment", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function duplicateTest() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const copy = await request<Test>(`/tests/${selected.id}/duplicate`, { method: "POST" });
      await load();
      setSelectedId(copy.id);
      notify({ title: "Assessment duplicated", description: "A complete unpublished copy was created with the same questions and marks.", tone: "success" });
    } catch (cause) {
      notify({ title: "Could not duplicate assessment", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function beginAssessmentEdit() {
    if (!selected || !authoring?.permissions.mutable) return;
    setEditForm({
      title: selected.title,
      description: selected.description || "",
      test_type: selected.testType,
      course_id: selected.courseId || "",
      week_id: selected.weekId || "",
      lecture_id: selected.lectureId || "",
      duration_minutes: selected.durationMinutes || 60,
      passing_marks: Number(selected.passingMarks || 0),
    });
    setEditOpen(true);
  }

  async function saveAssessmentEdit(event: FormEvent) {
    event.preventDefault();
    if (!selected || busy) return;
    if (editScopedType && !editForm.course_id) {
      notify({ title: "Choose a course", description: `${editForm.test_type} assessments require an academic scope.`, tone: "error" });
      return;
    }
    if ((editForm.test_type === "LECTURE" || editForm.test_type === "WEEK") && !editForm.week_id) {
      notify({ title: "Choose a week", tone: "error" });
      return;
    }
    if (editForm.test_type === "LECTURE" && !editForm.lecture_id) {
      notify({ title: "Choose a lecture", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      await request(`/tests/${selected.id}`, {
        method: "PUT",
        body: {
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          test_type: editForm.test_type,
          course_id: editForm.course_id || null,
          week_id: editForm.test_type === "LECTURE" || editForm.test_type === "WEEK" ? editForm.week_id || null : null,
          lecture_id: editForm.test_type === "LECTURE" ? editForm.lecture_id || null : null,
          duration_minutes: Number(editForm.duration_minutes),
          passing_marks: Number(editForm.passing_marks),
        },
      });
      setEditOpen(false);
      await load();
      await loadSelection(selected.id);
      notify({ title: "Assessment updated", description: "Definition and academic scope were revalidated against the attached questions.", tone: "success" });
    } catch (cause) {
      notify({ title: "Could not edit assessment", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish() {
    if (!selected || busy) return;
    if (!selected.isPublished && !authoring?.validation.publishable) {
      notify({ title: "Assessment is not publishable", description: validationErrors[0]?.message || "Resolve the validation errors first.", tone: "error" });
      return;
    }
    if (selected.isPublished && !authoring?.permissions.can_unpublish) {
      notify({ title: "Cannot return to draft", description: "Attempts already exist, so the assessment definition is locked.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      await request(`/tests/${selected.id}`, { method: "PUT", body: { is_published: !selected.isPublished } });
      await load();
      await loadSelection(selected.id);
      notify({ title: selected.isPublished ? "Assessment returned to draft" : "Assessment published", tone: "success" });
      if (!selected.isPublished) celebrate({ id: `assessment-published-${selected.id}`, title: "Assessment published", description: `${selected.title} passed authoring validation.`, points: 30 });
    } catch (cause) {
      notify({ title: "Could not update assessment", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function removeTest() {
    if (!selected || busy || !authoring?.permissions.can_delete) return;
    if (!window.confirm(`Delete ${selected.title}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await request(`/tests/${selected.id}`, { method: "DELETE" });
      setSelectedId(null);
      await load();
      notify({ title: "Assessment deleted", tone: "success" });
    } catch (cause) {
      notify({ title: "Could not delete assessment", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function attachSelected() {
    if (!selected || !attachIds.size || busy) return;
    setBusy(true);
    try {
      let order = testQuestions.length + 1;
      for (const questionId of attachIds) {
        const question = questionBank.find((item) => item.id === questionId);
        await request(`/tests/${selected.id}/questions`, {
          method: "POST",
          body: { question_id: questionId, marks: Number(question?.marks || 1), display_order: order },
        });
        order += 1;
      }
      setAttachIds(new Set());
      setAttachOpen(false);
      await loadSelection(selected.id);
      notify({ title: "Questions attached", description: `${attachIds.size} question${attachIds.size === 1 ? "" : "s"} added in sequence.`, tone: "success" });
    } catch (cause) {
      notify({ title: "Could not attach all questions", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
      await loadSelection(selected.id);
    } finally {
      setBusy(false);
    }
  }

  async function detachQuestions(questionIds: string[]) {
    if (!selected || !questionIds.length || busy) return;
    setBusy(true);
    try {
      for (const questionId of questionIds) await request(`/tests/${selected.id}/questions/${questionId}`, { method: "DELETE" });
      await loadSelection(selected.id);
      notify({ title: "Questions removed", description: `${questionIds.length} question${questionIds.length === 1 ? "" : "s"} detached.`, tone: "success" });
    } catch (cause) {
      notify({ title: "Could not remove questions", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function persistOrder(next: TestQuestion[]) {
    if (!selected || busy || !authoring?.permissions.mutable) return;
    const normalized = next.map((item, index) => ({ ...item, displayOrder: index + 1 }));
    const previous = testQuestions;
    setTestQuestions(normalized);
    setBusy(true);
    try {
      const saved = await request<TestQuestion[]>(`/tests/${selected.id}/questions/reorder`, {
        method: "PUT",
        body: { items: normalized.map((item) => ({ question_id: item.questionId, display_order: item.displayOrder })) },
      });
      setTestQuestions(saved);
      setAuthoring(await request<AuthoringState>(`/tests/${selected.id}/authoring-state`));
    } catch (cause) {
      setTestQuestions(previous);
      notify({ title: "Could not reorder questions", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function moveQuestion(questionId: string, direction: -1 | 1) {
    const index = testQuestions.findIndex((item) => item.questionId === questionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= testQuestions.length) return;
    const next = [...testQuestions];
    [next[index], next[target]] = [next[target], next[index]];
    void persistOrder(next);
  }

  function dropQuestion(targetQuestionId: string) {
    if (!draggedQuestionId || draggedQuestionId === targetQuestionId) return;
    const from = testQuestions.findIndex((item) => item.questionId === draggedQuestionId);
    const to = testQuestions.findIndex((item) => item.questionId === targetQuestionId);
    if (from < 0 || to < 0) return;
    const next = [...testQuestions];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDraggedQuestionId(null);
    void persistOrder(next);
  }

  const allAttachedSelected = testQuestions.length > 0 && testQuestions.every((item) => selectedAttached.has(item.questionId));

  return <ProductShell search="Search assessments and questions"><main className="pp-page role-workspace advanced-assessments-page">
    <div className="pp-title hero role-heading"><div><small className="page-eyebrow">{admin ? "ADMIN · ASSESSMENT CONTROL" : "INSTRUCTOR · ASSESSMENT BUILDER"}</small><h1>Assessment builder</h1><p>Create safe drafts, assemble and reorder questions, preview the student experience, validate publishing, and monitor attempts.</p></div><div className="role-heading-actions"><button className="pp-button secondary" type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button><button className="pp-button" type="button" onClick={() => setCreateOpen(true)}><FiPlus /> New assessment</button></div></div>

    {error && <ErrorState description={error} onRetry={() => void load()} />}
    {selected && <div className="assessment-definition-actions"><button className="pp-button secondary" type="button" disabled={!authoring?.permissions.mutable || busy} onClick={beginAssessmentEdit} title={!authoring?.permissions.mutable ? "Return to draft first; assessments with attempts are locked" : "Edit assessment definition"}><FiEdit3 /> Edit assessment</button></div>}
    {user?.role === "STUDENT" ? <Panel title="Instructor access required"><p>This workspace is available to instructors and system administrators.</p></Panel> : loading ? <Panel><PageSkeleton variant="list" label="Loading assessments" /></Panel> : !tests.length ? <EmptyState title="No assessments yet" description="Create a draft assessment; the form is autosaved locally while you work." /> : <div className="role-master-detail assessment-authoring-layout">
      <aside className="role-master-list"><header><b>{tests.length}</b><small>ASSESSMENTS</small></header>{tests.map((test) => <button className={selectedId === test.id ? "active" : ""} type="button" key={test.id} onClick={() => setSelectedId(test.id)}><div><b>{test.title}</b><small>{test.testType} · {test.course?.courseName || "No course"}</small></div><Status value={test.isPublished ? "PUBLISHED" : "DRAFT"} /></button>)}</aside>

      <section className="role-detail">{selected ? <>
        <Panel className="role-course-hero assessment-hero"><div><div className="assessment-status-line"><Status value={selected.isPublished ? "PUBLISHED" : "DRAFT"} />{authoring?.validation.publishable ? <span className="publishable"><FiCheckCircle /> Publishable</span> : <span className="blocked"><FiAlertTriangle /> {validationErrors.length} blocking issue{validationErrors.length === 1 ? "" : "s"}</span>}</div><h2>{selected.title}</h2><p>{selected.description || "No assessment description."}</p><small>{selected.durationMinutes || "—"} minutes · {selected.totalMarks || 0} marks · pass {selected.passingMarks || 0} · {attempts.length} attempts</small></div><div className="role-hero-actions"><button className="pp-button" type="button" disabled={!authoring?.permissions.mutable || busy} onClick={() => setAttachOpen(true)}><FiPlus /> Add questions</button><button className="pp-button secondary" type="button" onClick={() => setPreviewOpen(true)}><FiEye /> Preview as student</button><button className="pp-button secondary" type="button" disabled={busy} onClick={() => void duplicateTest()}><FiCopy /> Duplicate</button><button className="pp-button secondary" type="button" disabled={busy || (selected.isPublished && !authoring?.permissions.can_unpublish) || (!selected.isPublished && !authoring?.validation.publishable)} onClick={() => void togglePublish()}>{selected.isPublished ? "Return to draft" : "Publish"}</button><button className="role-icon-button" type="button" onClick={() => setActivityOpen(true)} title="Activity"><FiActivity /></button><button className="role-icon-button danger" type="button" disabled={!authoring?.permissions.can_delete || busy} onClick={() => void removeTest()}><FiTrash2 /></button></div></Panel>

        <Panel title="Pre-publish validation" className={`assessment-validation ${authoring?.validation.publishable ? "valid" : "invalid"}`}><div className="validation-summary"><span>{authoring?.validation.publishable ? <FiCheckCircle /> : <FiAlertTriangle />}</span><div><h3>{authoring?.validation.publishable ? "Ready to publish" : "Publishing is blocked"}</h3><p>{authoring?.validation.publishable ? "The backend authoring checks passed. Warnings remain advisory." : "Resolve every error below before publishing."}</p></div><b>{authoring?.validation.question_count || 0} questions · {authoring?.validation.total_marks || 0} marks</b></div>{authoring?.validation.issues.length ? <ul>{authoring.validation.issues.map((issue) => <li className={issue.severity.toLowerCase()} key={issue.code}><Status value={issue.severity} /><span><b>{issue.code.replaceAll("_", " ")}</b><small>{issue.message}</small></span></li>)}</ul> : <p className="validation-clear"><FiCheck /> No errors or warnings.</p>}</Panel>

        <div className="role-two-column assessment-detail-columns">
          <Panel title={`Questions (${testQuestions.length})`} action={authoring?.permissions.mutable && testQuestions.length ? <button className="assessment-select-all" type="button" onClick={() => setSelectedAttached(allAttachedSelected ? new Set() : new Set(testQuestions.map((item) => item.questionId)))}>{allAttachedSelected ? "Clear selection" : "Select all"}</button> : undefined}>
            {selectedAttached.size > 0 && <div className="assessment-bulk-bar"><b>{selectedAttached.size} selected</b><button type="button" disabled={busy} onClick={() => void detachQuestions([...selectedAttached])}><FiTrash2 /> Remove</button><button type="button" onClick={() => setSelectedAttached(new Set())}><FiX /> Cancel</button></div>}
            {selectionLoading ? <PageSkeleton variant="list" label="Loading questions" /> : testQuestions.length ? <div className="role-stack assessment-question-stack">{testQuestions.map((item, index) => <article className={`role-stack-row draggable-question ${selectedAttached.has(item.questionId) ? "selected" : ""}`} draggable={Boolean(authoring?.permissions.mutable)} onDragStart={() => setDraggedQuestionId(item.questionId)} onDragOver={(event) => { if (draggedQuestionId) event.preventDefault(); }} onDrop={() => dropQuestion(item.questionId)} onDragEnd={() => setDraggedQuestionId(null)} key={item.id}>
              <button className="assessment-question-select" type="button" aria-label={`${selectedAttached.has(item.questionId) ? "Deselect" : "Select"} question ${index + 1}`} aria-pressed={selectedAttached.has(item.questionId)} onClick={() => setSelectedAttached((current) => { const next = new Set(current); if (next.has(item.questionId)) next.delete(item.questionId); else next.add(item.questionId); return next; })}>{selectedAttached.has(item.questionId) ? <FiCheckCircle /> : <span>{index + 1}</span>}</button>
              <FiMoreVertical className="drag-handle" aria-hidden="true" />
              <div className="assessment-question-copy"><b>{item.question.title || item.question.questionText}</b><small>{item.question.questionType} · {item.marks || item.question.marks} marks · {item.question.difficulty}</small></div>
              <div className="question-order-actions"><button type="button" aria-label={`Move question ${index + 1} up`} disabled={!authoring?.permissions.mutable || index === 0 || busy} onClick={() => moveQuestion(item.questionId, -1)}><FiChevronUp /></button><button type="button" aria-label={`Move question ${index + 1} down`} disabled={!authoring?.permissions.mutable || index === testQuestions.length - 1 || busy} onClick={() => moveQuestion(item.questionId, 1)}><FiChevronDown /></button><button className="danger" type="button" aria-label={`Remove question ${index + 1}`} disabled={!authoring?.permissions.mutable || busy} onClick={() => void detachQuestions([item.questionId])}><FiTrash2 /></button></div>
            </article>)}</div> : <EmptyState title="No questions attached" description="Add active questions from the question bank." />}
          </Panel>

          <Panel title={`Attempts (${filteredAttempts.length}/${attempts.length})`}><div className="attempt-filters"><div><FiSearch /><input value={attemptSearch} onChange={(event) => setAttemptSearch(event.target.value)} placeholder="Student name or email" /></div><select value={attemptStatus} onChange={(event) => setAttemptStatus(event.target.value)}><option value="">All statuses</option>{[...new Set(attempts.map((attempt) => attempt.status))].map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}</select></div>{filteredAttempts.length ? <div className="role-stack">{filteredAttempts.map((attempt) => <article className="role-stack-row" key={attempt.id}><span><FiClipboard /></span><div><b>{attempt.student?.user?.fullName || attempt.student?.user?.email || "Student attempt"}</b><small>{attempt.status} · score {attempt.score || "—"} · {attempt.submittedAt || attempt.submitted_at ? new Date(attempt.submittedAt || attempt.submitted_at || "").toLocaleString() : "Not submitted"}</small></div></article>)}</div> : <EmptyState title="No matching attempts" description={attempts.length ? "Adjust the attempt filters." : "Attempts appear after students start this assessment."} />}</Panel>
        </div>
      </> : <EmptyState title="Select an assessment" description="Choose an assessment to manage questions, validation, publishing, and attempts." />}</section>
    </div>}

    <Modal title="Create assessment draft" open={createOpen} onClose={() => setCreateOpen(false)} wide><form className="role-form" onSubmit={createTest}><div className="draft-autosave-status"><FiSave /><span><b>Autosaved locally</b><small>{draftRestored ? "A previous unfinished draft was restored." : "Your fields are saved in this browser while you type."}</small></span>{JSON.stringify(draft) !== JSON.stringify(initialDraft) && <button type="button" onClick={() => { setDraft(initialDraft); setDraftRestored(false); setDraftCourse(null); localStorage.removeItem(draftKey); }}>Clear draft</button>}</div><div className="role-form-grid"><label>Title<input required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label><label>Type<select value={draft.test_type} onChange={(event) => { const testType = event.target.value as Test["testType"]; setDraft((current) => ({ ...current, test_type: testType, week_id: "", lecture_id: "" })); }}>{["LECTURE", "WEEK", "COURSE", "CUSTOM", "QUESTION_BANK"].map((value) => <option key={value}>{value}</option>)}</select></label><label>{scopedType ? "Course" : "Course (optional)"}<select required={scopedType} value={draft.course_id} onChange={(event) => setDraft((current) => ({ ...current, course_id: event.target.value, week_id: "", lecture_id: "" }))}><option value="">{scopedType ? "Select course" : "No course"}</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.courseCode} · {course.courseName}</option>)}</select></label>{(draft.test_type === "LECTURE" || draft.test_type === "WEEK") && <label>Week<select required value={draft.week_id} disabled={!draft.course_id || draftCourseLoading} onChange={(event) => setDraft((current) => ({ ...current, week_id: event.target.value, lecture_id: "" }))}><option value="">{draftCourseLoading ? "Loading weeks…" : "Select week"}</option>{draftWeeks.map((week) => <option value={week.id} key={week.id}>Week {week.weekNumber}{week.title ? ` · ${week.title}` : ""}</option>)}</select></label>}{draft.test_type === "LECTURE" && <label>Lecture<select required value={draft.lecture_id} disabled={!draft.week_id || draftCourseLoading} onChange={(event) => setDraft((current) => ({ ...current, lecture_id: event.target.value }))}><option value="">Select lecture</option>{draftLectures.map((lecture) => <option value={lecture.id} key={lecture.id}>{lecture.lectureNumber}. {lecture.title}</option>)}</select></label>}<label>Duration minutes<input required min={1} type="number" value={draft.duration_minutes} onChange={(event) => setDraft((current) => ({ ...current, duration_minutes: Number(event.target.value) }))} /></label><label>Passing marks<input required min={0} step="0.01" type="number" value={draft.passing_marks} onChange={(event) => setDraft((current) => ({ ...current, passing_marks: Number(event.target.value) }))} /></label><label className="wide">Description<textarea rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label></div><footer><button className="pp-button secondary" type="button" onClick={() => setCreateOpen(false)}>Close</button><button className="pp-button" disabled={busy || draftCourseLoading} type="submit"><FiSave /> {busy ? "Creating…" : "Create draft"}</button></footer></form></Modal>

    <Modal title="Attach questions" open={attachOpen} onClose={() => setAttachOpen(false)} wide><div className="assessment-attach-workspace"><div className="role-search"><FiSearch /><input value={attachSearch} onChange={(event) => setAttachSearch(event.target.value)} placeholder="Search question bank" /></div><div className="assessment-bank-list">{filteredBank.length ? filteredBank.map((question) => <label className={attachIds.has(question.id) ? "selected" : ""} key={question.id}><input type="checkbox" checked={attachIds.has(question.id)} onChange={() => setAttachIds((current) => { const next = new Set(current); if (next.has(question.id)) next.delete(question.id); else next.add(question.id); return next; })} /><span><b>{question.title || question.questionText}</b><small>{question.questionType} · {question.difficulty} · {question.marks} marks</small></span></label>) : <EmptyState title="No available questions" description="Every active question is already attached or the search has no match." />}</div><footer><span>{attachIds.size} selected</span><button className="pp-button secondary" type="button" onClick={() => { setAttachIds(new Set()); setAttachOpen(false); }}>Cancel</button><button className="pp-button" type="button" disabled={!attachIds.size || busy} onClick={() => void attachSelected()}><FiPlus /> {busy ? "Adding…" : `Add ${attachIds.size || ""} question${attachIds.size === 1 ? "" : "s"}`}</button></footer></div></Modal>

    <Modal title="Student preview" open={previewOpen} onClose={() => setPreviewOpen(false)} wide><div className="assessment-student-preview"><header><small>STUDENT VIEW · NON-SUBMITTING PREVIEW</small><h2>{selected?.title}</h2><p>{selected?.description || "No description"}</p><div><span>{selected?.durationMinutes || "—"} min</span><span>{selected?.totalMarks || 0} marks</span><span>{testQuestions.length} questions</span></div></header>{testQuestions.length ? <ol>{testQuestions.map((item) => <li key={item.id}><div><span>{item.question.questionType}</span><b>{item.question.title || `Question ${item.displayOrder}`}</b><small>{item.marks} marks</small></div><p>{item.question.questionText}</p>{item.question.questionType === "MCQ" && <div className="preview-options">{item.question.options?.map((option) => <label key={option.id}><input type="radio" disabled name={`preview-${item.id}`} />{option.optionText || option.option_text}</label>)}</div>}{item.question.questionType === "ESSAY" && <textarea rows={4} disabled placeholder="Student essay response" />}</li>)}</ol> : <EmptyState title="No questions to preview" description="Attach questions before opening the student preview." />}</div></Modal>

    <Modal title="Assessment activity" open={activityOpen} onClose={() => setActivityOpen(false)}><div className="assessment-activity-timeline">{authoring?.activity.length ? authoring.activity.map((item, index) => <article key={`${item.type}-${item.at}-${index}`}><i /><div><b>{item.label}</b><small>{new Date(item.at).toLocaleString()} · {item.type.replaceAll("_", " ")}</small></div></article>) : <p>No authoring activity is available.</p>}</div></Modal>
    <Modal title="Edit assessment" open={editOpen} onClose={() => !busy && setEditOpen(false)} wide><form className="role-form" onSubmit={saveAssessmentEdit}><div className="role-form-grid"><label>Title<input required value={editForm.title} onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))} /></label><label>Type<select value={editForm.test_type} onChange={(event) => { const testType = event.target.value as Test["testType"]; setEditForm((current) => ({ ...current, test_type: testType, week_id: "", lecture_id: "" })); }}>{["LECTURE", "WEEK", "COURSE", "CUSTOM", "QUESTION_BANK"].map((value) => <option key={value}>{value}</option>)}</select></label><label>{editScopedType ? "Course" : "Course (optional)"}<select required={editScopedType} value={editForm.course_id} onChange={(event) => setEditForm((current) => ({ ...current, course_id: event.target.value, week_id: "", lecture_id: "" }))}><option value="">{editScopedType ? "Select course" : "No course"}</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.courseCode} · {course.courseName}</option>)}</select></label>{(editForm.test_type === "LECTURE" || editForm.test_type === "WEEK") && <label>Week<select required value={editForm.week_id} disabled={!editForm.course_id || editCourseLoading} onChange={(event) => setEditForm((current) => ({ ...current, week_id: event.target.value, lecture_id: "" }))}><option value="">{editCourseLoading ? "Loading weeks…" : "Select week"}</option>{editWeeks.map((week) => <option value={week.id} key={week.id}>Week {week.weekNumber}{week.title ? ` · ${week.title}` : ""}</option>)}</select></label>}{editForm.test_type === "LECTURE" && <label>Lecture<select required value={editForm.lecture_id} disabled={!editForm.week_id || editCourseLoading} onChange={(event) => setEditForm((current) => ({ ...current, lecture_id: event.target.value }))}><option value="">Select lecture</option>{editLectures.map((lecture) => <option value={lecture.id} key={lecture.id}>{lecture.lectureNumber}. {lecture.title}</option>)}</select></label>}<label>Duration minutes<input required min={1} type="number" value={editForm.duration_minutes} onChange={(event) => setEditForm((current) => ({ ...current, duration_minutes: Number(event.target.value) }))} /></label><label>Passing marks<input required min={0} step="0.01" type="number" value={editForm.passing_marks} onChange={(event) => setEditForm((current) => ({ ...current, passing_marks: Number(event.target.value) }))} /></label><label className="wide">Description<textarea rows={3} value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} /></label></div><p className="role-form-guidance">Changing scope is allowed only while the assessment is an unused draft. Attached questions must remain inside the selected course, week, or lecture.</p><footer><button className="pp-button secondary" type="button" disabled={busy} onClick={() => setEditOpen(false)}>Cancel</button><button className="pp-button" disabled={busy || editCourseLoading} type="submit"><FiSave /> {busy ? "Saving…" : "Save assessment"}</button></footer></form></Modal>
  </main></ProductShell>;
}
