"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FiBookOpen,
  FiCheck,
  FiCheckCircle,
  FiChevronRight,
  FiClipboard,
  FiCopy,
  FiEdit3,
  FiLayers,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { PageSkeleton } from "./async-state";
import { useAuth, type UserRole } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./role-workspace.css";

type PageResponse<T> = { data: T[]; total?: number; page?: number; limit?: number; total_pages?: number };
type Course = { id: string; courseCode: string; courseName: string; weeks?: Week[] };
type Week = { id: string; weekNumber: number; title: string | null; lectures?: Lecture[] };
type Lecture = { id: string; lectureNumber: number; title: string; topics?: Topic[] };
type Topic = { id: string; topicName: string };
type Question = {
  id: string;
  topicId: string;
  questionType: "MCQ" | "ESSAY";
  title: string | null;
  questionText: string;
  explanation: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  marks: string;
  isActive: boolean;
  topic?: Topic;
  creator?: { fullName?: string };
};
type Test = {
  id: string;
  title: string;
  description: string | null;
  testType: "LECTURE" | "WEEK" | "COURSE" | "CUSTOM" | "QUESTION_BANK";
  courseId: string | null;
  durationMinutes: number | null;
  totalMarks: string | null;
  passingMarks: string | null;
  isPublished: boolean;
  createdAt: string;
  course?: Course | null;
};
type TestQuestion = {
  id?: string;
  questionId?: string;
  question_id?: string;
  displayOrder?: number;
  marks?: string;
  question?: Question;
};
type Attempt = {
  id: string;
  status: string;
  score: string | null;
  submittedAt?: string | null;
  submitted_at?: string | null;
  student?: { user?: { fullName?: string; email?: string }; studentNumber?: string };
};
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
type Deck = {
  id: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  displayOrder: number;
  course?: Course | null;
  topic?: Topic | null;
  lecture?: Lecture | null;
};
type Card = {
  id: string;
  title: string;
  frontContent: string;
  backContent: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  isActive: boolean;
};

function RoleBoundary({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading || !user) return <ProductShell><main className="pp-page"><PageSkeleton variant="workspace" label="Loading teaching workspace" /></main></ProductShell>;
  if (user.role === "STUDENT") return <ProductShell><main className="pp-page"><Panel title="Instructor access required"><p>This workspace is available to instructors and system administrators.</p></Panel></main></ProductShell>;
  return <>{children}</>;
}

function Heading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="pp-title hero role-heading"><div><small className="page-eyebrow">{eyebrow}</small><h1>{title}</h1><p>{description}</p></div>{actions && <div className="role-heading-actions">{actions}</div>}</div>;
}

function Modal({ title, open, onClose, children, wide = false }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return <div className="role-modal-backdrop" role="presentation" onMouseDown={onClose}><section className={`role-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}><header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog"><FiX /></button></header>{children}</section></div>;
}

function Empty({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="role-empty"><span><FiBookOpen /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = normalized.includes("publish") || normalized.includes("complete") || normalized.includes("active") ? "good" : normalized.includes("draft") || normalized.includes("pending") ? "pending" : "bad";
  return <span className={`role-status ${tone}`}>{value.replaceAll("_", " ")}</span>;
}

function flattenTopics(course: Course | null): Array<Topic & { path: string }> {
  if (!course?.weeks) return [];
  return course.weeks.flatMap(week => (week.lectures || []).flatMap(lecture => (lecture.topics || []).map(topic => ({ ...topic, path: `${week.title || `Week ${week.weekNumber}`} · ${lecture.title}` }))));
}

const initialQuestionForm = {
  course_id: "",
  topic_id: "",
  question_type: "MCQ" as "MCQ" | "ESSAY",
  title: "",
  question_text: "",
  explanation: "",
  difficulty: "MEDIUM" as "EASY" | "MEDIUM" | "HARD",
  marks: 1,
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  option_e: "",
  explanation_a: "",
  explanation_b: "",
  explanation_c: "",
  explanation_d: "",
  explanation_e: "",
  correct_option: "0",
  model_answer: "",
  grading_rubric: "",
};

export function QuestionBankPage({ admin = false }: { admin?: boolean }) {
  const { user, request } = useAuth();
  const { notify } = useUx();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseDetail, setCourseDetail] = useState<Course | null>(null);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialQuestionForm);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || user.role === "STUDENT") return;
    setLoading(true);
    const query = new URLSearchParams({ limit: "100" });
    if (search.trim()) query.set("search", search.trim());
    if (difficulty) query.set("difficulty", difficulty);
    if (type) query.set("question_type", type);
    try {
      const [questionData, courseData] = await Promise.all([
        request<PageResponse<Question>>(`/questions?${query}`),
        request<PageResponse<Course>>("/academic/courses?limit=100"),
      ]);
      setQuestions(questionData.data);
      setCourses(courseData.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load question bank.");
    } finally {
      setLoading(false);
    }
  }, [difficulty, request, search, type, user]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer); }, [load]);

  async function chooseCourse(courseId: string) {
    setForm(current => ({ ...current, course_id: courseId, topic_id: "" }));
    if (!courseId) { setCourseDetail(null); return; }
    try { setCourseDetail(await request<Course>(`/academic/courses/${courseId}`)); }
    catch (cause) { notify({ title: "Could not load course topics", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  async function createQuestion(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await request<Question>("/questions", { method: "POST", body: { topic_id: form.topic_id, question_type: form.question_type, title: form.title.trim() || undefined, question_text: form.question_text.trim(), explanation: form.explanation.trim() || undefined, difficulty: form.difficulty, marks: Number(form.marks) } });
      if (form.question_type === "MCQ") {
        const options = [
          { text: form.option_a, explanation: form.explanation_a },
          { text: form.option_b, explanation: form.explanation_b },
          { text: form.option_c, explanation: form.explanation_c },
          { text: form.option_d, explanation: form.explanation_d },
          { text: form.option_e, explanation: form.explanation_e },
        ];
        if (options.some(option => !option.text.trim() || !option.explanation.trim())) throw new Error("All five options and their explanations are required.");
        await Promise.all(options.map((option, index) => request(`/questions/${created.id}/options`, { method: "POST", body: { option_text: option.text.trim(), explanation: option.explanation.trim(), is_correct: index === Number(form.correct_option), display_order: index + 1 } })));
      } else if (form.model_answer.trim() || form.grading_rubric.trim()) {
        await request(`/questions/${created.id}/essay-configuration`, { method: "POST", body: { model_answer: form.model_answer.trim() || undefined, grading_rubric: form.grading_rubric.trim() || undefined } });
      }
      notify({ title: "Question created", description: form.question_type === "MCQ" ? "The answer options were saved with it." : "The essay configuration was saved.", tone: "success" });
      setForm(initialQuestionForm);
      setCourseDetail(null);
      setCreateOpen(false);
      await load();
    } catch (cause) {
      notify({ title: "Could not create question", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function editQuestion(question: Question) {
    const title = window.prompt("Question title", question.title || "") ?? undefined;
    if (title === undefined) return;
    const questionText = window.prompt("Question text", question.questionText) ?? undefined;
    if (questionText === undefined || !questionText.trim()) return;
    const explanation = window.prompt("General explanation", question.explanation || "") ?? undefined;
    if (explanation === undefined) return;
    try {
      await request(`/questions/${question.id}`, { method: "PUT", body: { title: title.trim() || undefined, question_text: questionText.trim(), explanation: explanation.trim(), is_active: false } });
      notify({ title: "Question updated", description: question.isActive ? "The edited question was returned to inactive status for review." : undefined, tone: "success" });
      await load();
    } catch (cause) { notify({ title: "Could not edit question", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  async function duplicateQuestion(question: Question) {
    try {
      await request(`/questions/${question.id}/duplicate`, { method: "POST" });
      notify({ title: "Question duplicated", tone: "success" });
      await load();
    } catch (cause) { notify({ title: "Could not duplicate question", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  async function toggleQuestion(question: Question) {
    try {
      await request(`/questions/${question.id}`, { method: "PUT", body: { is_active: !question.isActive } });
      await load();
    } catch (cause) { notify({ title: "Could not update question", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  async function removeQuestion(question: Question) {
    if (!window.confirm("Delete this question permanently?")) return;
    try {
      await request(`/questions/${question.id}`, { method: "DELETE" });
      notify({ title: "Question deleted", tone: "success" });
      await load();
    } catch (cause) { notify({ title: "Could not delete question", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  const topics = flattenTopics(courseDetail);
  return <RoleBoundary><ProductShell search="Search questions and topics"><main className="pp-page role-workspace"><Heading eyebrow={admin ? "ADMIN · CONTENT CONTROL" : "INSTRUCTOR · QUESTION BANK"} title="Question bank" description="Create complete MCQ and essay records, reuse existing questions, and control whether each item is available for assessment building." actions={<><button className="pp-button secondary" onClick={() => void load()} type="button"><FiRefreshCw /> Refresh</button><button className="pp-button" onClick={() => setCreateOpen(true)} type="button"><FiPlus /> New question</button></>} />
    <Panel className="role-filter-panel"><div className="role-filters"><label><span>Search</span><div className="role-search"><FiSearch /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Question text or title" /></div></label><label><span>Type</span><select value={type} onChange={event => setType(event.target.value)}><option value="">All types</option><option value="MCQ">MCQ</option><option value="ESSAY">Essay</option></select></label><label><span>Difficulty</span><select value={difficulty} onChange={event => setDifficulty(event.target.value)}><option value="">All levels</option><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label></div></Panel>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <Panel><PageSkeleton variant="list" label="Loading questions" /></Panel> : questions.length ? <div className="role-content-grid">{questions.map(question => <Panel className="role-content-card" key={question.id}><header><div><Status value={question.questionType} /><Status value={question.difficulty} /></div><Status value={question.isActive ? "ACTIVE" : "INACTIVE"} /></header><h2>{question.title || question.questionText.slice(0, 90)}</h2><p>{question.questionText}</p><dl><div><dt>Topic</dt><dd>{question.topic?.topicName || question.topicId}</dd></div><div><dt>Marks</dt><dd>{question.marks}</dd></div><div><dt>Creator</dt><dd>{question.creator?.fullName || "Current instructor"}</dd></div></dl><footer><button type="button" onClick={() => void editQuestion(question)}><FiEdit3 /> Edit</button><button type="button" onClick={() => void duplicateQuestion(question)}><FiCopy /> Duplicate</button><button type="button" onClick={() => void toggleQuestion(question)}><FiCheck /> {question.isActive ? "Deactivate" : "Activate"}</button><button className="danger" type="button" onClick={() => void removeQuestion(question)}><FiTrash2 /> Delete</button></footer></Panel>)}</div> : <Empty title="No questions found" description="Create a question or adjust the current filters." action={<button className="pp-button" type="button" onClick={() => setCreateOpen(true)}><FiPlus /> New question</button>} />}
    <Modal title="Create question" open={createOpen} onClose={() => setCreateOpen(false)} wide><form className="role-form" onSubmit={createQuestion}><div className="role-form-grid"><label>Course<select required value={form.course_id} onChange={event => void chooseCourse(event.target.value)}><option value="">Select course…</option>{courses.map(course => <option value={course.id} key={course.id}>{course.courseCode} · {course.courseName}</option>)}</select></label><label>Topic<select required value={form.topic_id} disabled={!courseDetail} onChange={event => setForm(current => ({ ...current, topic_id: event.target.value }))}><option value="">Select topic…</option>{topics.map(topic => <option value={topic.id} key={topic.id}>{topic.path} · {topic.topicName}</option>)}</select></label><label>Question type<select value={form.question_type} onChange={event => setForm(current => ({ ...current, question_type: event.target.value as "MCQ" | "ESSAY" }))}><option value="MCQ">MCQ</option><option value="ESSAY">Essay</option></select></label><label>Difficulty<select value={form.difficulty} onChange={event => setForm(current => ({ ...current, difficulty: event.target.value as "EASY" | "MEDIUM" | "HARD" }))}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label><label>Title<input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} /></label><label>Marks<input required type="number" min="0.01" step="0.01" value={form.marks} onChange={event => setForm(current => ({ ...current, marks: Number(event.target.value) }))} /></label><label className="wide">Question text<textarea required rows={4} value={form.question_text} onChange={event => setForm(current => ({ ...current, question_text: event.target.value }))} /></label><label className="wide">Explanation<textarea rows={3} value={form.explanation} onChange={event => setForm(current => ({ ...current, explanation: event.target.value }))} /></label>{form.question_type === "MCQ" ? <><label>Option A<input required value={form.option_a} onChange={event => setForm(current => ({ ...current, option_a: event.target.value }))} /><textarea required placeholder="Why option A is correct or incorrect" value={form.explanation_a} onChange={event => setForm(current => ({ ...current, explanation_a: event.target.value }))} /></label><label>Option B<input required value={form.option_b} onChange={event => setForm(current => ({ ...current, option_b: event.target.value }))} /><textarea required placeholder="Why option B is correct or incorrect" value={form.explanation_b} onChange={event => setForm(current => ({ ...current, explanation_b: event.target.value }))} /></label><label>Option C<input required value={form.option_c} onChange={event => setForm(current => ({ ...current, option_c: event.target.value }))} /><textarea required placeholder="Why option C is correct or incorrect" value={form.explanation_c} onChange={event => setForm(current => ({ ...current, explanation_c: event.target.value }))} /></label><label>Option D<input required value={form.option_d} onChange={event => setForm(current => ({ ...current, option_d: event.target.value }))} /><textarea required placeholder="Why option D is correct or incorrect" value={form.explanation_d} onChange={event => setForm(current => ({ ...current, explanation_d: event.target.value }))} /></label><label>Option E<input required value={form.option_e} onChange={event => setForm(current => ({ ...current, option_e: event.target.value }))} /><textarea required placeholder="Why option E is correct or incorrect" value={form.explanation_e} onChange={event => setForm(current => ({ ...current, explanation_e: event.target.value }))} /></label><label>Correct option<select value={form.correct_option} onChange={event => setForm(current => ({ ...current, correct_option: event.target.value }))}><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option><option value="4">E</option></select></label></> : <><label className="wide">Model answer<textarea rows={4} value={form.model_answer} onChange={event => setForm(current => ({ ...current, model_answer: event.target.value }))} /></label><label className="wide">Grading rubric<textarea rows={4} value={form.grading_rubric} onChange={event => setForm(current => ({ ...current, grading_rubric: event.target.value }))} /></label></>}</div><footer><button className="pp-button secondary" type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="pp-button" disabled={saving} type="submit">{saving ? "Saving…" : "Create question"}</button></footer></form></Modal>
  </main></ProductShell></RoleBoundary>;
}

const initialTestForm = { title: "", description: "", test_type: "CUSTOM" as Test["testType"], course_id: "", duration_minutes: 60, passing_marks: 50 };

export function AssessmentsPage({ admin = false }: { admin?: boolean }) {
  const { user, request } = useAuth();
  const { notify } = useUx();
  const [tests, setTests] = useState<Test[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [form, setForm] = useState(initialTestForm);
  const [attach, setAttach] = useState({ question_id: "", marks: 1, display_order: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || user.role === "STUDENT") return;
    setLoading(true);
    try {
      const [testData, courseData, questionData] = await Promise.all([
        request<PageResponse<Test>>("/tests?limit=100"),
        request<PageResponse<Course>>("/academic/courses?limit=100"),
        request<PageResponse<Question>>("/questions?limit=100&is_active=true"),
      ]);
      setTests(testData.data);
      setCourses(courseData.data);
      setQuestions(questionData.data);
      if (!selectedId && testData.data[0]) setSelectedId(testData.data[0].id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load assessments."); }
    finally { setLoading(false); }
  }, [request, selectedId, user]);

  const loadSelection = useCallback(async (testId: string) => {
    try {
      const [items, attemptData] = await Promise.all([request<TestQuestion[]>(`/tests/${testId}/questions`), request<Attempt[]>(`/tests/${testId}/attempts`)]);
      setTestQuestions(items);
      setAttempts(attemptData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load assessment details."); }
  }, [request]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selectedId) void loadSelection(selectedId); }, [loadSelection, selectedId]);
  const selected = tests.find(test => test.id === selectedId) || null;

  async function createTest(event: FormEvent) {
    event.preventDefault();
    try {
      await request("/tests", { method: "POST", body: { title: form.title.trim(), description: form.description.trim() || undefined, test_type: form.test_type, course_id: form.course_id || undefined, duration_minutes: Number(form.duration_minutes), passing_marks: Number(form.passing_marks) } });
      notify({ title: "Assessment created", description: "It remains a draft until you publish it.", tone: "success" });
      setCreateOpen(false);
      setForm(initialTestForm);
      await load();
    } catch (cause) { notify({ title: "Could not create assessment", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  async function togglePublish(test: Test) {
    try {
      await request(`/tests/${test.id}`, { method: "PUT", body: { is_published: !test.isPublished } });
      notify({ title: test.isPublished ? "Assessment returned to draft" : "Assessment published", tone: "success" });
      await load();
    } catch (cause) { notify({ title: "Could not update assessment", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  async function removeTest(test: Test) {
    if (!window.confirm(`Delete ${test.title}?`)) return;
    try { await request(`/tests/${test.id}`, { method: "DELETE" }); setSelectedId(null); await load(); }
    catch (cause) { notify({ title: "Could not delete assessment", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  async function attachQuestion(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    try {
      await request(`/tests/${selected.id}/questions`, { method: "POST", body: { question_id: attach.question_id, marks: Number(attach.marks), display_order: Number(attach.display_order) } });
      setAttachOpen(false);
      setAttach({ question_id: "", marks: 1, display_order: testQuestions.length + 2 });
      await loadSelection(selected.id);
    } catch (cause) { notify({ title: "Could not add question", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  async function detachQuestion(item: TestQuestion) {
    if (!selected) return;
    const questionId = item.question?.id || item.questionId || item.question_id;
    if (!questionId) return;
    try { await request(`/tests/${selected.id}/questions/${questionId}`, { method: "DELETE" }); await loadSelection(selected.id); }
    catch (cause) { notify({ title: "Could not remove question", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  return <RoleBoundary><ProductShell search="Search assessments"><main className="pp-page role-workspace"><Heading eyebrow={admin ? "ADMIN · ASSESSMENT CONTROL" : "INSTRUCTOR · ASSESSMENT BUILDER"} title="Assessment builder" description="Create assessment shells, assemble questions, publish deliberately, and monitor the resulting attempt stream." actions={<><button className="pp-button secondary" type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button><button className="pp-button" type="button" onClick={() => setCreateOpen(true)}><FiPlus /> New assessment</button></>} />
    {error && <p className="form-error">{error}</p>}
    {loading ? <Panel><PageSkeleton variant="list" label="Loading assessments" /></Panel> : <div className="role-master-detail"><aside className="role-master-list"><header><b>{tests.length}</b><small>ASSESSMENTS</small></header>{tests.map(test => <button className={selectedId === test.id ? "active" : ""} type="button" key={test.id} onClick={() => setSelectedId(test.id)}><div><b>{test.title}</b><small>{test.testType} · {test.course?.courseName || "No course"}</small></div><Status value={test.isPublished ? "PUBLISHED" : "DRAFT"} /></button>)}</aside><section className="role-detail">{selected ? <><Panel className="role-course-hero"><div><Status value={selected.isPublished ? "PUBLISHED" : "DRAFT"} /><h2>{selected.title}</h2><p>{selected.description || "No assessment description."}</p><small>{selected.durationMinutes || "—"} minutes · {selected.totalMarks || 0} marks · pass {selected.passingMarks || 0}</small></div><div className="role-hero-actions"><button className="pp-button" type="button" onClick={() => setAttachOpen(true)}><FiPlus /> Add question</button><button className="pp-button secondary" type="button" onClick={() => void togglePublish(selected)}>{selected.isPublished ? "Return to draft" : "Publish"}</button><button className="role-icon-button danger" type="button" onClick={() => void removeTest(selected)}><FiTrash2 /></button></div></Panel><div className="role-two-column"><Panel title={`Questions (${testQuestions.length})`}>{testQuestions.length ? <div className="role-stack">{testQuestions.map((item, index) => <article className="role-stack-row" key={item.id || item.question?.id || index}><span>{index + 1}</span><div><b>{item.question?.title || item.question?.questionText || "Question"}</b><small>{item.question?.questionType || ""} · {item.marks || item.question?.marks || "—"} marks</small></div><button className="danger" type="button" onClick={() => void detachQuestion(item)}><FiTrash2 /></button></article>)}</div> : <Empty title="No questions attached" description="Add active questions from the question bank." />}</Panel><Panel title={`Attempts (${attempts.length})`}>{attempts.length ? <div className="role-stack">{attempts.slice(0, 20).map(attempt => <article className="role-stack-row" key={attempt.id}><span><FiClipboard /></span><div><b>{attempt.student?.user?.fullName || attempt.student?.user?.email || "Student attempt"}</b><small>{attempt.status} · score {attempt.score || "—"} · {attempt.submittedAt || attempt.submitted_at ? new Date(attempt.submittedAt || attempt.submitted_at || "").toLocaleString() : "Not submitted"}</small></div><FiChevronRight /></article>)}</div> : <Empty title="No attempts yet" description="Attempts appear here after students start this assessment." />}</Panel></div></> : <Empty title="Select an assessment" description="Choose an assessment to manage questions, publishing, and attempts." />}</section></div>}
    <Modal title="Create assessment" open={createOpen} onClose={() => setCreateOpen(false)} wide><form className="role-form" onSubmit={createTest}><div className="role-form-grid"><label>Title<input required value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} /></label><label>Type<select value={form.test_type} onChange={event => setForm(current => ({ ...current, test_type: event.target.value as Test["testType"] }))}>{["LECTURE", "WEEK", "COURSE", "CUSTOM", "QUESTION_BANK"].map(value => <option key={value}>{value}</option>)}</select></label><label>Course<select value={form.course_id} onChange={event => setForm(current => ({ ...current, course_id: event.target.value }))}><option value="">No course</option>{courses.map(course => <option value={course.id} key={course.id}>{course.courseCode} · {course.courseName}</option>)}</select></label><label>Duration minutes<input min={1} type="number" value={form.duration_minutes} onChange={event => setForm(current => ({ ...current, duration_minutes: Number(event.target.value) }))} /></label><label>Passing marks<input min={0} step="0.01" type="number" value={form.passing_marks} onChange={event => setForm(current => ({ ...current, passing_marks: Number(event.target.value) }))} /></label><label className="wide">Description<textarea rows={3} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label></div><footer><button className="pp-button secondary" type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="pp-button" type="submit">Create assessment</button></footer></form></Modal>
    <Modal title="Add question to assessment" open={attachOpen} onClose={() => setAttachOpen(false)} wide><form className="role-form" onSubmit={attachQuestion}><div className="role-form-grid"><label className="wide">Question<select required value={attach.question_id} onChange={event => setAttach(current => ({ ...current, question_id: event.target.value }))}><option value="">Select active question…</option>{questions.map(question => <option value={question.id} key={question.id}>{question.title || question.questionText.slice(0, 100)} · {question.difficulty}</option>)}</select></label><label>Marks<input required min="0.01" step="0.01" type="number" value={attach.marks} onChange={event => setAttach(current => ({ ...current, marks: Number(event.target.value) }))} /></label><label>Display order<input required min={1} type="number" value={attach.display_order} onChange={event => setAttach(current => ({ ...current, display_order: Number(event.target.value) }))} /></label></div><footer><button className="pp-button secondary" type="button" onClick={() => setAttachOpen(false)}>Cancel</button><button className="pp-button" type="submit">Add question</button></footer></form></Modal>
  </main></ProductShell></RoleBoundary>;
}

export function GradingPage({ admin = false }: { admin?: boolean }) {
  const { user, request } = useAuth();
  const { notify } = useUx();
  const [tests, setTests] = useState<Test[]>([]);
  const [selectedTestId, setSelectedTestId] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<Answer | null>(null);
  const [grade, setGrade] = useState({ awarded_marks: 0, feedback: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role === "STUDENT") return;
    void request<PageResponse<Test>>("/tests?limit=100").then(response => { setTests(response.data); if (response.data[0]) setSelectedTestId(response.data[0].id); }).finally(() => setLoading(false));
  }, [request, user]);

  useEffect(() => { if (!selectedTestId) return; void request<Attempt[]>(`/tests/${selectedTestId}/attempts`).then(setAttempts); }, [request, selectedTestId]);
  useEffect(() => { if (!selectedAttemptId) { setAnswers([]); return; } void request<Answer[]>(`/tests/attempts/${selectedAttemptId}/answers`).then(setAnswers); }, [request, selectedAttemptId]);

  async function submitGrade(event: FormEvent) {
    event.preventDefault();
    if (!selectedAnswer || !selectedAttemptId) return;
    try {
      await request(`/tests/attempts/${selectedAttemptId}/answers/${selectedAnswer.id}/grade`, { method: "PUT", body: { awarded_marks: Number(grade.awarded_marks), feedback: grade.feedback.trim() || undefined } });
      notify({ title: "Essay grade saved", tone: "success" });
      setSelectedAnswer(null);
      setAnswers(await request<Answer[]>(`/tests/attempts/${selectedAttemptId}/answers`));
    } catch (cause) { notify({ title: "Could not save grade", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  const pending = useMemo(() => answers.filter(answer => (answer.essayAnswer || answer.essay_answer) && answer.awardedMarks == null && answer.awarded_marks == null), [answers]);
  return <RoleBoundary><ProductShell search="Search attempts and essay answers"><main className="pp-page role-workspace"><Heading eyebrow={admin ? "ADMIN · GRADING OVERSIGHT" : "INSTRUCTOR · GRADING DESK"} title="Essay grading" description="Move from assessment to attempt to answer, then save marks and feedback against the exact submitted essay record." />
    {loading ? <Panel><PageSkeleton variant="list" label="Loading grading desk" /></Panel> : <div className="role-grading-layout"><Panel title="1. Assessment"><select value={selectedTestId} onChange={event => { setSelectedTestId(event.target.value); setSelectedAttemptId(""); }}><option value="">Choose assessment…</option>{tests.map(test => <option value={test.id} key={test.id}>{test.title}</option>)}</select><div className="role-stack compact">{attempts.map(attempt => <button className={`role-stack-row ${selectedAttemptId === attempt.id ? "selected" : ""}`} type="button" key={attempt.id} onClick={() => setSelectedAttemptId(attempt.id)}><span><FiClipboard /></span><div><b>{attempt.student?.user?.fullName || attempt.student?.user?.email || "Student"}</b><small>{attempt.status} · {attempt.score || "No score"}</small></div><FiChevronRight /></button>)}</div></Panel><Panel title={`2. Submitted answers · ${pending.length} pending`} className="role-grading-answers">{answers.length ? <div className="role-stack">{answers.map(answer => <article className="role-answer" key={answer.id}><header><div><Status value={(answer.essayAnswer || answer.essay_answer) ? "ESSAY" : "OBJECTIVE"} />{answer.awardedMarks != null || answer.awarded_marks != null ? <Status value="GRADED" /> : <Status value="PENDING" />}</div><b>{answer.awardedMarks ?? answer.awarded_marks ?? "—"} marks</b></header><h3>{answer.question?.title || answer.question?.questionText || "Answer"}</h3><p>{answer.essayAnswer || answer.essay_answer || "This answer is not an essay submission."}</p>{(answer.essayAnswer || answer.essay_answer) && <button className="pp-button secondary" type="button" onClick={() => { setSelectedAnswer(answer); setGrade({ awarded_marks: Number(answer.awardedMarks ?? answer.awarded_marks ?? 0), feedback: answer.gradingFeedback || answer.grading_feedback || "" }); }}><FiEdit3 /> Grade answer</button>}</article>)}</div> : <Empty title="Choose an attempt" description="Select an assessment and a student attempt to load its answers." />}</Panel></div>}
    <Modal title="Grade essay answer" open={Boolean(selectedAnswer)} onClose={() => setSelectedAnswer(null)} wide><form className="role-form" onSubmit={submitGrade}><Panel className="role-grade-preview"><h3>{selectedAnswer?.question?.title || selectedAnswer?.question?.questionText}</h3><p>{selectedAnswer?.essayAnswer || selectedAnswer?.essay_answer}</p></Panel><div className="role-form-grid"><label>Awarded marks<input required min={0} step="0.01" type="number" value={grade.awarded_marks} onChange={event => setGrade(current => ({ ...current, awarded_marks: Number(event.target.value) }))} /></label><label className="wide">Feedback<textarea rows={5} value={grade.feedback} onChange={event => setGrade(current => ({ ...current, feedback: event.target.value }))} /></label></div><footer><button className="pp-button secondary" type="button" onClick={() => setSelectedAnswer(null)}>Cancel</button><button className="pp-button" type="submit"><FiCheckCircle /> Save grade</button></footer></form></Modal>
  </main></ProductShell></RoleBoundary>;
}

const initialDeckForm = { course_id: "", title: "", description: "" };
const initialCardForm = { title: "", front_content: "", back_content: "", difficulty: "MEDIUM" as Card["difficulty"], explanation: "", hint: "" };

export function FlashcardStudioPage({ admin = false }: { admin?: boolean }) {
  const { user, request } = useAuth();
  const { notify } = useUx();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [deckOpen, setDeckOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [deckForm, setDeckForm] = useState(initialDeckForm);
  const [cardForm, setCardForm] = useState(initialCardForm);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || user.role === "STUDENT") return;
    setLoading(true);
    try {
      const [deckData, courseData] = await Promise.all([request<PageResponse<Deck>>("/flashcards/decks?limit=100"), request<PageResponse<Course>>("/academic/courses?limit=100")]);
      setDecks(deckData.data);
      setCourses(courseData.data);
      if (!selectedId && deckData.data[0]) setSelectedId(deckData.data[0].id);
    } finally { setLoading(false); }
  }, [request, selectedId, user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selectedId) void request<PageResponse<Card>>(`/flashcards/decks/${selectedId}/cards?limit=100`).then(response => setCards(response.data)); }, [request, selectedId]);
  const selected = decks.find(deck => deck.id === selectedId) || null;

  async function createDeck(event: FormEvent) {
    event.preventDefault();
    try {
      await request("/flashcards/decks", { method: "POST", body: { title: deckForm.title.trim(), description: deckForm.description.trim() || undefined, course_id: deckForm.course_id || undefined } });
      setDeckOpen(false); setDeckForm(initialDeckForm); await load(); notify({ title: "Deck created", tone: "success" });
    } catch (cause) { notify({ title: "Could not create deck", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  async function createCard(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    try {
      await request(`/flashcards/decks/${selected.id}/cards`, { method: "POST", body: { title: cardForm.title.trim(), front_content: cardForm.front_content.trim(), back_content: cardForm.back_content.trim(), difficulty: cardForm.difficulty, explanation: cardForm.explanation.trim() || undefined, hint: cardForm.hint.trim() || undefined } });
      setCardOpen(false); setCardForm(initialCardForm); setCards((await request<PageResponse<Card>>(`/flashcards/decks/${selected.id}/cards?limit=100`)).data); notify({ title: "Flashcard created", tone: "success" });
    } catch (cause) { notify({ title: "Could not create flashcard", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  async function toggleDeck(deck: Deck) {
    try { await request(`/flashcards/decks/${deck.id}`, { method: "PUT", body: { is_published: !deck.isPublished } }); await load(); }
    catch (cause) { notify({ title: "Could not update deck", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  async function editCard(card: Card) {
    const title = window.prompt("Flashcard title", card.title);
    if (title === null || !title.trim()) return;
    const front = window.prompt("Front", card.frontContent);
    if (front === null || !front.trim()) return;
    const back = window.prompt("Back", card.backContent);
    if (back === null || !back.trim()) return;
    const difficulty = window.prompt("Difficulty: EASY, MEDIUM, or HARD", card.difficulty)?.toUpperCase();
    if (!difficulty || !["EASY", "MEDIUM", "HARD"].includes(difficulty)) {
      notify({ title: "Invalid difficulty", description: "Choose EASY, MEDIUM, or HARD.", tone: "error" });
      return;
    }
    try {
      await request(`/flashcards/cards/${card.id}`, { method: "PUT", body: { title: title.trim(), front_content: front.trim(), back_content: back.trim(), difficulty } });
      if (selected) setCards((await request<PageResponse<Card>>(`/flashcards/decks/${selected.id}/cards?limit=100`)).data);
      notify({ title: "Flashcard updated", tone: "success" });
    } catch (cause) { notify({ title: "Could not edit flashcard", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  async function removeCard(card: Card) {
    if (!selected || !window.confirm("Delete this flashcard?")) return;
    try { await request(`/flashcards/cards/${card.id}`, { method: "DELETE" }); setCards((await request<PageResponse<Card>>(`/flashcards/decks/${selected.id}/cards?limit=100`)).data); }
    catch (cause) { notify({ title: "Could not delete flashcard", description: cause instanceof Error ? cause.message : undefined, tone: "error" }); }
  }

  return <RoleBoundary><ProductShell search="Search decks and cards"><main className="pp-page role-workspace"><Heading eyebrow={admin ? "ADMIN · FLASHCARD CONTROL" : "INSTRUCTOR · FLASHCARD STUDIO"} title="Flashcard studio" description="Create course-linked decks, populate them with teaching cards, and publish only when the deck is ready for learners." actions={<><button className="pp-button secondary" type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button><button className="pp-button" type="button" onClick={() => setDeckOpen(true)}><FiPlus /> New deck</button></>} />
    {loading ? <Panel><PageSkeleton variant="list" label="Loading flashcard studio" /></Panel> : <div className="role-master-detail"><aside className="role-master-list"><header><b>{decks.length}</b><small>DECKS</small></header>{decks.map(deck => <button className={selectedId === deck.id ? "active" : ""} type="button" key={deck.id} onClick={() => setSelectedId(deck.id)}><div><b>{deck.title}</b><small>{deck.course?.courseName || deck.topic?.topicName || deck.lecture?.title || "Unlinked deck"}</small></div><Status value={deck.isPublished ? "PUBLISHED" : "DRAFT"} /></button>)}</aside><section className="role-detail">{selected ? <><Panel className="role-course-hero"><div><Status value={selected.isPublished ? "PUBLISHED" : "DRAFT"} /><h2>{selected.title}</h2><p>{selected.description || "No deck description."}</p></div><div className="role-hero-actions"><button className="pp-button" type="button" onClick={() => setCardOpen(true)}><FiPlus /> Add card</button><button className="pp-button secondary" type="button" onClick={() => void toggleDeck(selected)}>{selected.isPublished ? "Return to draft" : "Publish deck"}</button></div></Panel>{cards.length ? <div className="role-card-grid">{cards.map(card => <Panel className="role-flashcard" key={card.id}><header><Status value={card.difficulty} /><span><button type="button" onClick={() => void editCard(card)}><FiEdit3 /> Edit</button><button className="danger" type="button" onClick={() => void removeCard(card)}><FiTrash2 /></button></span></header><h3>{card.title}</h3><div><small>FRONT</small><p>{card.frontContent}</p></div><div><small>BACK</small><p>{card.backContent}</p></div></Panel>)}</div> : <Empty title="No cards in this deck" description="Add the first teaching card, then publish the deck when it is complete." action={<button className="pp-button" type="button" onClick={() => setCardOpen(true)}><FiPlus /> Add card</button>} />}</> : <Empty title="Select a deck" description="Choose a deck to manage its publication state and cards." />}</section></div>}
    <Modal title="Create flashcard deck" open={deckOpen} onClose={() => setDeckOpen(false)}><form className="role-form" onSubmit={createDeck}><div className="role-form-grid"><label className="wide">Title<input required value={deckForm.title} onChange={event => setDeckForm(current => ({ ...current, title: event.target.value }))} /></label><label className="wide">Course<select value={deckForm.course_id} onChange={event => setDeckForm(current => ({ ...current, course_id: event.target.value }))}><option value="">No course link</option>{courses.map(course => <option key={course.id} value={course.id}>{course.courseCode} · {course.courseName}</option>)}</select></label><label className="wide">Description<textarea rows={4} value={deckForm.description} onChange={event => setDeckForm(current => ({ ...current, description: event.target.value }))} /></label></div><footer><button className="pp-button secondary" type="button" onClick={() => setDeckOpen(false)}>Cancel</button><button className="pp-button" type="submit">Create deck</button></footer></form></Modal>
    <Modal title="Add flashcard" open={cardOpen} onClose={() => setCardOpen(false)} wide><form className="role-form" onSubmit={createCard}><div className="role-form-grid"><label>Title<input required value={cardForm.title} onChange={event => setCardForm(current => ({ ...current, title: event.target.value }))} /></label><label>Difficulty<select value={cardForm.difficulty} onChange={event => setCardForm(current => ({ ...current, difficulty: event.target.value as Card["difficulty"] }))}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label><label className="wide">Front<textarea required rows={4} value={cardForm.front_content} onChange={event => setCardForm(current => ({ ...current, front_content: event.target.value }))} /></label><label className="wide">Back<textarea required rows={4} value={cardForm.back_content} onChange={event => setCardForm(current => ({ ...current, back_content: event.target.value }))} /></label><label className="wide">Explanation<textarea rows={3} value={cardForm.explanation} onChange={event => setCardForm(current => ({ ...current, explanation: event.target.value }))} /></label><label className="wide">Hint<textarea rows={2} value={cardForm.hint} onChange={event => setCardForm(current => ({ ...current, hint: event.target.value }))} /></label></div><footer><button className="pp-button secondary" type="button" onClick={() => setCardOpen(false)}>Cancel</button><button className="pp-button" type="submit">Create card</button></footer></form></Modal>
  </main></ProductShell></RoleBoundary>;
}
