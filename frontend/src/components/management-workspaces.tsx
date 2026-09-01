"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiBookOpen,
  FiChevronRight,
  FiClipboard,
  FiEdit3,
  FiFileText,
  FiLayers,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiTrash2,
  FiUserCheck,
  FiUsers,
  FiX,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import { PageSkeleton } from "./async-state";
import { useAuth, type UserRole } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";
import "./role-workspace.css";

type PageResponse<T> = {
  data: T[];
  page?: number;
  limit?: number;
  total?: number;
  total_pages?: number;
};

type DashboardStats = Record<string, string | number>;

type ManagedUser = {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  role: UserRole;
  status: "ACTIVE" | "PENDING_VERIFICATION" | "SUSPENDED" | "DEACTIVATED";
  email_verified: boolean;
  last_login_at: string | null;
  created_at: string;
  forensic_code?: string | null;
  student_number?: string | null;
  current_semester?: number | null;
  specialization?: string | null;
  office_location?: string | null;
  employee_number?: string | null;
  is_super_admin?: boolean | null;
};

type Semester = {
  id: string;
  semesterNumber: number;
  title: string | null;
  description: string | null;
};

type Topic = {
  id: string;
  topicName: string;
  description: string | null;
  displayOrder: number;
};

type LectureResource = { id: string; resourceName: string; resourceType: string; originalFilename: string | null; mimeType: string | null; uploadStatus: string };

type Lecture = {
  id: string;
  lectureNumber: number;
  title: string;
  description: string | null;
  estimatedDurationMinutes: number | null;
  isPublished: boolean;
  topics?: Topic[];
  resources?: LectureResource[];
};

type Week = {
  id: string;
  weekNumber: number;
  title: string | null;
  description: string | null;
  lectures?: Lecture[];
};

type Course = {
  id: string;
  semesterId: string;
  courseCode: string;
  courseName: string;
  slug: string;
  description: string | null;
  creditHours: number | null;
  isActive: boolean;
  semester?: Semester;
  weeks?: Week[];
};

type AuditLog = {
  id: string;
  action: string;
  entity_name?: string;
  entityName?: string;
  entity_id?: string | null;
  entityId?: string | null;
  description: string;
  ip_address?: string | null;
  ipAddress?: string | null;
  created_at?: string;
  createdAt?: string;
  user?: { fullName?: string; email?: string } | null;
};

type QuickLink = {
  title: string;
  description: string;
  href: string;
  Icon: IconType;
  tone?: "teal" | "violet" | "orange" | "red";
};

const adminLinks: QuickLink[] = [
  { title: "User administration", description: "Create accounts, manage roles, suspend access, and trigger password resets.", href: "/admin/users", Icon: FiUsers },
  { title: "Academic structure", description: "Build semesters, courses, weeks, lectures, topics, and instructor ownership.", href: "/admin/academics", Icon: FiBookOpen, tone: "violet" },
  { title: "Question bank", description: "Moderate and create MCQ and essay content across the platform.", href: "/admin/questions", Icon: FiEdit3, tone: "orange" },
  { title: "Assessments", description: "Create, publish, and monitor tests and their attempts.", href: "/admin/assessments", Icon: FiClipboard },
  { title: "Flashcard studio", description: "Manage teaching decks and cards for any course or lecture.", href: "/admin/flashcards", Icon: FiLayers, tone: "violet" },
  { title: "Audit trail", description: "Inspect privileged actions and operational changes.", href: "/admin/audit", Icon: FiShield, tone: "red" },
];

const instructorLinks: QuickLink[] = [
  { title: "Course studio", description: "Structure your courses into weeks, lectures, topics, and resources.", href: "/instructor/courses", Icon: FiBookOpen },
  { title: "Question bank", description: "Write MCQs and essays, configure answers, and reuse questions.", href: "/instructor/questions", Icon: FiEdit3, tone: "violet" },
  { title: "Assessment builder", description: "Create tests, add questions, publish, and review attempts.", href: "/instructor/assessments", Icon: FiClipboard, tone: "orange" },
  { title: "Flashcard studio", description: "Build and publish decks linked to courses, topics, or lectures.", href: "/instructor/flashcards", Icon: FiLayers, tone: "violet" },
  { title: "Bundle manager", description: "Package courses, weeks, and tests and control student access.", href: "/bundles", Icon: FiFileText },
];

const numberValue = (value: string | number | undefined) => Number(value || 0);
const displayDate = (value?: string | null) => value ? new Date(value).toLocaleString() : "Never";
const humanize = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());

function RoleBoundary({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading || !user) {
    return <ProductShell><main className="pp-page"><PageSkeleton variant="workspace" label="Loading management workspace" /></main></ProductShell>;
  }
  if (!roles.includes(user.role)) {
    return <ProductShell><main className="pp-page"><Panel title="Access restricted"><p>This workspace is not available for your current role.</p></Panel></main></ProductShell>;
  }
  return <>{children}</>;
}

function WorkspaceHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="pp-title hero role-heading"><div><small className="page-eyebrow">{eyebrow}</small><h1>{title}</h1><p>{description}</p></div>{actions && <div className="role-heading-actions">{actions}</div>}</div>;
}

function LoadingBlock({ label }: { label: string }) {
  return <Panel><PageSkeleton variant="list" label={label} /></Panel>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="role-empty"><span><FiActivity /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function Modal({ title, open, onClose, children, wide = false }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return <div className="role-modal-backdrop" role="presentation" onMouseDown={onClose}><section className={`role-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}><header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog"><FiX /></button></header>{children}</section></div>;
}

function StatusPill({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = normalized.includes("active") || normalized.includes("published") || normalized.includes("complete") ? "good" : normalized.includes("suspend") || normalized.includes("deactiv") || normalized.includes("failed") ? "bad" : "pending";
  return <span className={`role-status ${tone}`}>{humanize(value)}</span>;
}

export function RoleDashboardPage() {
  const { user, request } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || user.role === "STUDENT") return;
    setLoading(true);
    setError(null);
    try {
      setStats(await request<DashboardStats>(user.role === "SYSTEM_ADMIN" ? "/dashboard/admin" : "/dashboard/instructor"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [request, user]);

  useEffect(() => { void load(); }, [load]);

  const isAdmin = user?.role === "SYSTEM_ADMIN";
  const links = isAdmin ? adminLinks : instructorLinks;
  const name = user?.fullName || user?.full_name || user?.email || (isAdmin ? "Administrator" : "Instructor");
  const firstName = name.split(/\s+/)[0];

  return <RoleBoundary roles={["INSTRUCTOR", "SYSTEM_ADMIN"]}><ProductShell search={isAdmin ? "Search users, courses, or platform records" : "Search courses, questions, or assessments"}><main className="pp-page role-workspace"><WorkspaceHeading eyebrow={isAdmin ? "SYSTEM CONTROL CENTER" : "TEACHING CONTROL CENTER"} title={`Welcome back, ${firstName}`} description={isAdmin ? "Operate the platform from one role-aware workspace. Every card below opens a complete management workflow." : "Plan content, publish learning material, assess students, and close the grading loop from one workspace."} actions={<button className="pp-button secondary" type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button>} />
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <LoadingBlock label="Loading live dashboard totals" /> : <div className="role-metric-grid">{Object.entries(stats || {}).filter(([label]) => isAdmin || label !== "pending_essay_answers").map(([label, value]) => <Panel className="role-metric-card" key={label}><span><FiActivity /></span><div><b>{value}</b><small>{humanize(label)}</small></div></Panel>)}</div>}
    <section className="role-command-grid">{links.map(({ title, description, href, Icon, tone = "teal" }) => <Link href={href} className={`role-command-card ${tone}`} key={href}><span><Icon /></span><div><h2>{title}</h2><p>{description}</p><b>Open workflow <FiChevronRight /></b></div></Link>)}</section>
    {isAdmin && <div className="role-dashboard-lower"><Panel title={isAdmin ? "Administrative operating loop" : "Instructor operating loop"}><ol className="role-steps">{(isAdmin ? ["Create or import accounts", "Build academic structure", "Assign instructors and control access", "Review platform content", "Inspect audit evidence"] : ["Structure the course", "Create questions and teaching decks", "Assemble and publish assessments", "Monitor attempts", "Grade essays and release feedback"]).map((step, index) => <li key={step}><span>{index + 1}</span><div><b>{step}</b><small>{index === 0 ? "Start here when setting up new work." : "The previous stage feeds this one."}</small></div></li>)}</ol></Panel>
      <Panel title="Live backend coverage"><div className="role-coverage"><div><b>{isAdmin ? "Platform" : "Teaching"}</b><span>{isAdmin ? "Users · academics · content · audit" : "Courses · questions · tests · grading · bundles"}</span></div><div><b>RBAC</b><span>Navigation and actions are restricted by authenticated role.</span></div><div><b>Source</b><span>Every total and list is loaded from current backend records.</span></div></div></Panel></div>}
  </main></ProductShell></RoleBoundary>;
}

const initialUserForm = {
  full_name: "",
  email: "",
  password: "",
  phone_number: "",
  role: "STUDENT" as UserRole,
  student_number: "",
  current_semester: 1,
  specialization: "",
  office_location: "",
  employee_number: "",
  is_super_admin: false,
};

export function AdminUsersPage() {
  const { user, request } = useAuth();
  const { notify } = useUx();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialUserForm);

  const load = useCallback(async () => {
    if (user?.role !== "SYSTEM_ADMIN") return;
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ page: "1", limit: "100" });
    if (search.trim()) query.set("search", search.trim());
    if (role) query.set("role", role);
    if (status) query.set("status", status);
    try {
      setUsers((await request<PageResponse<ManagedUser>>(`/admin/users?${query}`)).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, [request, role, search, status, user]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer); }, [load]);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone_number: form.phone_number.trim(),
        role: form.role,
      };
      if (form.role === "STUDENT") {
        body.student_number = form.student_number.trim();
        body.current_semester = Number(form.current_semester);
      }
      if (form.role === "INSTRUCTOR") {
        body.specialization = form.specialization.trim() || undefined;
        body.office_location = form.office_location.trim() || undefined;
      }
      if (form.role === "SYSTEM_ADMIN") {
        body.employee_number = form.employee_number.trim();
        body.is_super_admin = form.is_super_admin;
      }
      await request("/admin/users", { method: "POST", body });
      notify({ title: "Account created", description: `${form.full_name} can now use the platform.`, tone: "success" });
      setForm(initialUserForm);
      setCreateOpen(false);
      await load();
    } catch (cause) {
      notify({ title: "Could not create account", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(target: ManagedUser, nextStatus: ManagedUser["status"]) {
    if (target.status === nextStatus) return;
    try {
      await request(`/admin/users/${target.id}/status`, { method: "PATCH", body: { status: nextStatus } });
      notify({ title: "Account status updated", description: `${target.full_name} is now ${humanize(nextStatus).toLowerCase()}.`, tone: "success" });
      await load();
    } catch (cause) {
      notify({ title: "Could not update status", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  async function resetPassword(target: ManagedUser) {
    if (!window.confirm(`Send password-reset instructions to ${target.email}?`)) return;
    try {
      await request(`/admin/users/${target.id}/reset-password`, { method: "POST" });
      notify({ title: "Password reset initiated", description: `Existing sessions for ${target.email} were revoked.`, tone: "success" });
    } catch (cause) {
      notify({ title: "Could not initiate reset", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  async function removeUser(target: ManagedUser) {
    if (!window.confirm(`Permanently remove ${target.full_name}? This cannot be undone.`)) return;
    try {
      await request(`/admin/users/${target.id}`, { method: "DELETE" });
      notify({ title: "Account removed", tone: "success" });
      await load();
    } catch (cause) {
      notify({ title: "Could not remove account", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  return <RoleBoundary roles={["SYSTEM_ADMIN"]}><ProductShell search="Search platform users"><main className="pp-page role-workspace"><WorkspaceHeading eyebrow="ADMIN · IDENTITY & ACCESS" title="User administration" description="Create role-specific accounts, search the directory, control access, and trigger secure recovery workflows." actions={<><button className="pp-button secondary" type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button><button className="pp-button" type="button" onClick={() => setCreateOpen(true)}><FiPlus /> New account</button></>} />
    <Panel className="role-filter-panel"><div className="role-filters"><label><span>Search</span><div className="role-search"><FiSearch /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, email, or phone" /></div></label><label><span>Role</span><select value={role} onChange={event => setRole(event.target.value)}><option value="">All roles</option><option value="STUDENT">Students</option><option value="INSTRUCTOR">Instructors</option><option value="SYSTEM_ADMIN">Administrators</option></select></label><label><span>Status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="PENDING_VERIFICATION">Pending verification</option><option value="SUSPENDED">Suspended</option><option value="DEACTIVATED">Deactivated</option></select></label></div></Panel>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <LoadingBlock label="Loading users" /> : users.length ? <Panel title={`${users.length} accounts`} className="role-table-panel"><div className="role-table-scroll"><table className="role-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Role profile</th><th>Last login</th><th>Actions</th></tr></thead><tbody>{users.map(target => <tr key={target.id}><td><div className="role-person"><span>{target.full_name.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span><div><b>{target.full_name}</b><small>{target.email}<br />{target.phone_number}</small></div></div></td><td><StatusPill value={target.role} /></td><td><select className="role-inline-select" value={target.status} disabled={target.id === user?.id} onChange={event => void changeStatus(target, event.target.value as ManagedUser["status"])}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="DEACTIVATED">Deactivated</option>{target.status === "PENDING_VERIFICATION" && <option value="PENDING_VERIFICATION">Pending verification</option>}</select></td><td><small>{target.role === "STUDENT" ? `${target.student_number || "No number"} · Semester ${target.current_semester || "—"}` : target.role === "INSTRUCTOR" ? `${target.specialization || "No specialization"}${target.office_location ? ` · ${target.office_location}` : ""}` : `${target.employee_number || "No employee number"}${target.is_super_admin ? " · Super admin" : ""}`}{target.forensic_code ? ` · ${target.forensic_code}` : ""}</small></td><td><small>{displayDate(target.last_login_at)}</small></td><td><div className="role-row-actions"><button type="button" onClick={() => void resetPassword(target)} title="Reset password"><FiShield /></button><button type="button" className="danger" disabled={target.id === user?.id} onClick={() => void removeUser(target)} title="Delete user"><FiTrash2 /></button></div></td></tr>)}</tbody></table></div></Panel> : <EmptyState title="No accounts match these filters" description="Adjust the filters or create a new account." action={<button className="pp-button" type="button" onClick={() => setCreateOpen(true)}><FiPlus /> New account</button>} />}
    <Modal title="Create managed account" open={createOpen} onClose={() => setCreateOpen(false)} wide><form className="role-form" onSubmit={createUser}><div className="role-form-grid"><label>Full name<input required value={form.full_name} onChange={event => setForm(current => ({ ...current, full_name: event.target.value }))} /></label><label>Email<input required type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></label><label>Phone number<input required placeholder="+201000000000" value={form.phone_number} onChange={event => setForm(current => ({ ...current, phone_number: event.target.value }))} /></label><label>Initial password<input required minLength={12} type="password" value={form.password} onChange={event => setForm(current => ({ ...current, password: event.target.value }))} /></label><label>Role<select value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value as UserRole }))}><option value="STUDENT">Student</option><option value="INSTRUCTOR">Instructor</option><option value="SYSTEM_ADMIN">System administrator</option></select></label>{form.role === "STUDENT" && <><label>Student number<input required value={form.student_number} onChange={event => setForm(current => ({ ...current, student_number: event.target.value }))} /></label><label>Current semester<input required min={1} type="number" value={form.current_semester} onChange={event => setForm(current => ({ ...current, current_semester: Number(event.target.value) }))} /></label></>}{form.role === "INSTRUCTOR" && <><label>Specialization<input value={form.specialization} onChange={event => setForm(current => ({ ...current, specialization: event.target.value }))} /></label><label>Office location<input value={form.office_location} onChange={event => setForm(current => ({ ...current, office_location: event.target.value }))} /></label></>}{form.role === "SYSTEM_ADMIN" && <><label>Employee number<input required value={form.employee_number} onChange={event => setForm(current => ({ ...current, employee_number: event.target.value }))} /></label><label className="role-checkbox"><input type="checkbox" checked={form.is_super_admin} onChange={event => setForm(current => ({ ...current, is_super_admin: event.target.checked }))} /> Grant super-administrator authority</label></>}</div><footer><button className="pp-button secondary" type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="pp-button" disabled={saving} type="submit">{saving ? "Creating…" : "Create account"}</button></footer></form></Modal>
  </main></ProductShell></RoleBoundary>;
}

type AcademicAction = { kind: "semester" | "course" | "week" | "lecture" | "topic" | "instructor"; parentId?: string; label?: string } | null;

function AcademicWorkspace({ adminMode }: { adminMode: boolean }) {
  const { user, request } = useAuth();
  const { notify } = useUx();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [instructors, setInstructors] = useState<ManagedUser[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseDetail, setCourseDetail] = useState<Course | null>(null);
  const [action, setAction] = useState<AcademicAction>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | number>>({});

  const load = useCallback(async () => {
    if (!user || user.role === "STUDENT") return;
    setLoading(true);
    setError(null);
    try {
      const [semesterData, courseData] = await Promise.all([
        request<Semester[]>("/academic/semesters"),
        request<PageResponse<Course>>("/academic/courses?limit=100"),
      ]);
      setSemesters(semesterData);
      setCourses(courseData.data);
      if (adminMode) {
        setInstructors((await request<PageResponse<ManagedUser>>("/admin/users?role=INSTRUCTOR&status=ACTIVE&limit=100")).data);
      }
      if (!selectedCourseId && courseData.data[0]) setSelectedCourseId(courseData.data[0].id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load academic structure.");
    } finally {
      setLoading(false);
    }
  }, [adminMode, request, selectedCourseId, user]);

  const loadCourse = useCallback(async (courseId: string) => {
    setDetailLoading(true);
    try {
      setCourseDetail(await request<Course>(`/academic/courses/${courseId}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load course structure.");
    } finally {
      setDetailLoading(false);
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selectedCourseId) void loadCourse(selectedCourseId); }, [loadCourse, selectedCourseId]);

  function openAction(next: NonNullable<AcademicAction>) {
    setForm({});
    setAction(next);
  }

  async function submitAcademicAction(event: FormEvent) {
    event.preventDefault();
    if (!action) return;
    try {
      if (action.kind === "semester") {
        await request("/academic/semesters", { method: "POST", body: { semester_number: Number(form.semester_number), title: String(form.title || "") || undefined, description: String(form.description || "") || undefined } });
      }
      if (action.kind === "course") {
        await request(`/academic/semesters/${action.parentId}/courses`, { method: "POST", body: { course_code: String(form.course_code || ""), course_name: String(form.course_name || ""), slug: String(form.slug || ""), description: String(form.description || "") || undefined, credit_hours: form.credit_hours ? Number(form.credit_hours) : undefined, display_order: form.display_order ? Number(form.display_order) : undefined } });
      }
      if (action.kind === "week") {
        await request(`/academic/courses/${action.parentId}/weeks`, { method: "POST", body: { week_number: Number(form.week_number), title: String(form.title || "") || undefined, description: String(form.description || "") || undefined, display_order: form.display_order ? Number(form.display_order) : undefined } });
      }
      if (action.kind === "lecture") {
        await request(`/academic/weeks/${action.parentId}/lectures`, { method: "POST", body: { lecture_number: Number(form.lecture_number), title: String(form.title || ""), description: String(form.description || "") || undefined, estimated_duration_minutes: form.estimated_duration_minutes ? Number(form.estimated_duration_minutes) : undefined, display_order: form.display_order ? Number(form.display_order) : undefined } });
      }
      if (action.kind === "topic") {
        await request(`/academic/lectures/${action.parentId}/topics`, { method: "POST", body: { topic_name: String(form.topic_name || ""), description: String(form.description || "") || undefined, display_order: form.display_order ? Number(form.display_order) : undefined } });
      }
      if (action.kind === "instructor") {
        await request(`/academic/courses/${action.parentId}/instructors/${form.instructor_id}`, { method: "POST" });
      }
      notify({ title: "Academic structure updated", tone: "success" });
      setAction(null);
      await load();
      if (selectedCourseId) await loadCourse(selectedCourseId);
    } catch (cause) {
      notify({ title: "Could not update academic structure", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  async function viewLectureFile(resource: LectureResource) {
    try {
      const blob = await request<Blob>(`/academic/resources/${resource.id}/file`, { responseType: "blob" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      notify({ title: "Could not open lecture file", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  async function toggleLecture(lecture: Lecture) {
    try {
      await request(`/academic/lectures/${lecture.id}`, { method: "PUT", body: { is_published: !lecture.isPublished } });
      notify({ title: lecture.isPublished ? "Lecture returned to draft" : "Lecture published", tone: "success" });
      if (selectedCourseId) await loadCourse(selectedCourseId);
    } catch (cause) {
      notify({ title: "Could not update lecture", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  const roles: UserRole[] = adminMode ? ["SYSTEM_ADMIN"] : ["INSTRUCTOR", "SYSTEM_ADMIN"];
  return <RoleBoundary roles={roles}><ProductShell search="Search courses and curriculum"><main className="pp-page role-workspace"><WorkspaceHeading eyebrow={adminMode ? "ADMIN · ACADEMIC CONTROL" : "INSTRUCTOR · COURSE STUDIO"} title={adminMode ? "Academic structure" : "Course studio"} description={adminMode ? "Create the platform hierarchy and assign active instructors to the courses they manage." : "Build the teaching hierarchy from course to week, lecture, and topic. New lectures remain drafts until you publish them."} actions={<><button className="pp-button secondary" type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button>{adminMode && <button className="pp-button" type="button" onClick={() => openAction({ kind: "semester" })}><FiPlus /> Semester</button>}</>} />
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <LoadingBlock label="Loading academic structure" /> : <div className="role-academic-layout"><aside className="role-course-list"><header><div><small>COURSES</small><b>{courses.length}</b></div></header>{courses.map(course => <button className={selectedCourseId === course.id ? "active" : ""} type="button" key={course.id} onClick={() => setSelectedCourseId(course.id)}><span>{course.courseCode}</span><div><b>{course.courseName}</b><small>Semester {course.semester?.semesterNumber ?? semesters.find(item => item.id === course.semesterId)?.semesterNumber ?? "—"}</small></div><FiChevronRight /></button>)}{!courses.length && <p>No courses yet.</p>}</aside><section className="role-academic-main"><Panel title="Create course" className="role-create-strip"><div className="role-course-create"><select aria-label="Semester for new course" defaultValue="" onChange={event => event.target.value && openAction({ kind: "course", parentId: event.target.value, label: semesters.find(item => item.id === event.target.value)?.title || `Semester ${semesters.find(item => item.id === event.target.value)?.semesterNumber}` })}><option value="" disabled>Select a semester…</option>{semesters.map(semester => <option key={semester.id} value={semester.id}>{semester.title || `Semester ${semester.semesterNumber}`}</option>)}</select><small>{adminMode ? "Administrators can create courses in any semester." : "Courses you create are automatically assigned to you."}</small></div></Panel>{detailLoading ? <LoadingBlock label="Loading course hierarchy" /> : courseDetail ? <><Panel className="role-course-hero"><div><small>{courseDetail.courseCode} · {courseDetail.isActive ? "ACTIVE" : "INACTIVE"}</small><h2>{courseDetail.courseName}</h2><p>{courseDetail.description || "No course description yet."}</p></div><div className="role-hero-actions"><button className="pp-button" type="button" onClick={() => openAction({ kind: "week", parentId: courseDetail.id })}><FiPlus /> Add week</button>{adminMode && <button className="pp-button secondary" type="button" onClick={() => openAction({ kind: "instructor", parentId: courseDetail.id })}><FiUserCheck /> Assign instructor</button>}</div></Panel><div className="role-hierarchy">{courseDetail.weeks?.length ? courseDetail.weeks.map(week => <section className="role-week" key={week.id}><header><div><span>W{week.weekNumber}</span><div><b>{week.title || `Week ${week.weekNumber}`}</b><small>{week.description || "No description"}</small></div></div><button type="button" onClick={() => openAction({ kind: "lecture", parentId: week.id, label: week.title || `Week ${week.weekNumber}` })}><FiPlus /> Lecture</button></header><div className="role-lecture-list">{week.lectures?.length ? week.lectures.map(lecture => <article key={lecture.id}><div className="role-lecture-top"><span><FiBookOpen /></span><div><b>{lecture.lectureNumber}. {lecture.title}</b><small>{lecture.estimatedDurationMinutes ? `${lecture.estimatedDurationMinutes} minutes` : "Duration not set"}</small></div><StatusPill value={lecture.isPublished ? "PUBLISHED" : "DRAFT"} /></div><p>{lecture.description || "No lecture description."}</p>{lecture.resources?.length ? <div className="role-topic-list">{lecture.resources.map(resource => <button type="button" key={resource.id} onClick={() => void viewLectureFile(resource)}><FiFileText /> View {resource.resourceName || resource.originalFilename || "lecture file"}</button>)}</div> : <small>No lecture files uploaded.</small>}<div className="role-topic-list">{lecture.topics?.map(topic => <span key={topic.id}>{topic.topicName}</span>)}<button type="button" onClick={() => openAction({ kind: "topic", parentId: lecture.id, label: lecture.title })}><FiPlus /> Topic</button></div><footer><Link className="pp-button secondary" href={`/resources/upload?lecture_id=${encodeURIComponent(lecture.id)}`}><FiFileText /> Lecture file</Link><button className="pp-button secondary" type="button" onClick={() => void toggleLecture(lecture)}>{lecture.isPublished ? "Return to draft" : "Publish lecture"}</button></footer></article>) : <EmptyState title="No lectures" description="Add the first lecture to this week." action={<button className="pp-button" type="button" onClick={() => openAction({ kind: "lecture", parentId: week.id })}><FiPlus /> Add lecture</button>} />}</div></section>) : <EmptyState title="This course has no weeks" description="Create a week, then add lectures and topics underneath it." action={<button className="pp-button" type="button" onClick={() => openAction({ kind: "week", parentId: courseDetail.id })}><FiPlus /> Add week</button>} />}</div></> : <EmptyState title="Select a course" description="Choose a course from the left to inspect and manage its hierarchy." />}</section></div>}
    <Modal title={action ? humanize(`create ${action.kind}`) : "Academic action"} open={Boolean(action)} onClose={() => setAction(null)} wide><form className="role-form" onSubmit={submitAcademicAction}><div className="role-form-grid">{action?.kind === "semester" && <><label>Semester number<input required min={1} type="number" onChange={event => setForm(current => ({ ...current, semester_number: event.target.value }))} /></label><label>Title<input onChange={event => setForm(current => ({ ...current, title: event.target.value }))} /></label><label className="wide">Description<textarea rows={3} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label></>}{action?.kind === "course" && <><label>Course code<input required placeholder="MED101" onChange={event => setForm(current => ({ ...current, course_code: event.target.value }))} /></label><label>Course name<input required onChange={event => setForm(current => ({ ...current, course_name: event.target.value }))} /></label><label>Slug<input required placeholder="clinical-foundations" onChange={event => setForm(current => ({ ...current, slug: event.target.value }))} /></label><label>Credit hours<input min={1} type="number" onChange={event => setForm(current => ({ ...current, credit_hours: event.target.value }))} /></label><label className="wide">Description<textarea rows={3} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label></>}{action?.kind === "week" && <><label>Week number<input required min={1} type="number" onChange={event => setForm(current => ({ ...current, week_number: event.target.value }))} /></label><label>Title<input onChange={event => setForm(current => ({ ...current, title: event.target.value }))} /></label><label className="wide">Description<textarea rows={3} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label></>}{action?.kind === "lecture" && <><label>Lecture number<input required min={1} type="number" onChange={event => setForm(current => ({ ...current, lecture_number: event.target.value }))} /></label><label>Title<input required onChange={event => setForm(current => ({ ...current, title: event.target.value }))} /></label><label>Estimated minutes<input min={1} type="number" onChange={event => setForm(current => ({ ...current, estimated_duration_minutes: event.target.value }))} /></label><label className="wide">Description<textarea rows={3} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label></>}{action?.kind === "topic" && <><label>Topic name<input required onChange={event => setForm(current => ({ ...current, topic_name: event.target.value }))} /></label><label>Display order<input min={1} type="number" onChange={event => setForm(current => ({ ...current, display_order: event.target.value }))} /></label><label className="wide">Description<textarea rows={3} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label></>}{action?.kind === "instructor" && <label className="wide">Active instructor<select required defaultValue="" onChange={event => setForm({ instructor_id: event.target.value })}><option value="" disabled>Select instructor…</option>{instructors.map(instructor => <option key={instructor.id} value={instructor.id}>{instructor.full_name} · {instructor.specialization || instructor.email}</option>)}</select></label>}</div><footer><button className="pp-button secondary" type="button" onClick={() => setAction(null)}>Cancel</button><button className="pp-button" type="submit">Save</button></footer></form></Modal>
  </main></ProductShell></RoleBoundary>;
}

export function AdminAcademicsPage() { return <AcademicWorkspace adminMode />; }
export function InstructorCoursesPage() { return <AcademicWorkspace adminMode={false} />; }

export function AdminAuditPage() {
  const { user, request } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (user?.role !== "SYSTEM_ADMIN") return;
    setLoading(true);
    setError(null);
    try {
      const response = await request<PageResponse<AuditLog> | AuditLog[]>("/audit-logs?limit=100");
      setLogs(Array.isArray(response) ? response : response.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load audit records.");
    } finally {
      setLoading(false);
    }
  }, [request, user]);

  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return logs;
    return logs.filter(log => [log.action, log.entity_name, log.entityName, log.description, log.user?.fullName, log.user?.email].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [logs, search]);

  return <RoleBoundary roles={["SYSTEM_ADMIN"]}><ProductShell search="Search audit events"><main className="pp-page role-workspace"><WorkspaceHeading eyebrow="ADMIN · GOVERNANCE" title="Audit trail" description="Review privileged actions, affected entities, actors, network origin, and timestamps without editing immutable evidence." actions={<button className="pp-button secondary" type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button>} />
    <Panel className="role-filter-panel"><label><span>Filter audit events</span><div className="role-search"><FiSearch /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Action, entity, description, or actor" /></div></label></Panel>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <LoadingBlock label="Loading audit records" /> : visible.length ? <div className="role-audit-list">{visible.map(log => <Panel key={log.id} className="role-audit-card"><div className="role-audit-icon"><FiShield /></div><div><header><StatusPill value={log.action} /><small>{displayDate(log.created_at || log.createdAt)}</small></header><h2>{log.description}</h2><p>{humanize(log.entity_name || log.entityName || "platform")} {log.entity_id || log.entityId ? `· ${log.entity_id || log.entityId}` : ""}</p><footer><span>{log.user?.fullName || log.user?.email || "System process"}</span><span>{log.ip_address || log.ipAddress || "No IP recorded"}</span></footer></div></Panel>)}</div> : <EmptyState title="No audit events match" description="The audit log is empty or the current filter excludes all records." />}
  </main></ProductShell></RoleBoundary>;
}
