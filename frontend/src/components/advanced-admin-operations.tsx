"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiFileText,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiTrash2,
  FiUpload,
  FiX,
} from "react-icons/fi";
import { apiBaseUrl } from "@/lib/api";
import { useAuth, type UserRole } from "./auth-provider";
import { EmptyState, ErrorState, PageSkeleton } from "./async-state";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";
import "./role-workspace.css";

type PageResponse<T> = { data: T[]; page: number; limit: number; total: number; total_pages: number };
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
type UserDraft = {
  full_name: string;
  email: string;
  password: string;
  phone_number: string;
  role: UserRole;
  student_number?: string;
  current_semester?: number;
  specialization?: string;
  office_location?: string;
  employee_number?: string;
  is_super_admin?: boolean;
};
type ImportResult = {
  created: ManagedUser[];
  errors: Array<{ index: number; email: string; error: string }>;
  created_count: number;
  error_count: number;
};
type AuditLog = {
  id: string;
  action: string;
  entity_name?: string | null;
  entityName?: string | null;
  entity_id?: string | null;
  entityId?: string | null;
  description: string;
  ip_address?: string | null;
  ipAddress?: string | null;
  created_at?: string;
  createdAt?: string;
  user?: { id?: string; fullName?: string; email?: string } | null;
};

type ModalProps = { title: string; open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean };
function Modal({ title, open, onClose, children, wide = false }: ModalProps) {
  if (!open) return null;
  return <div className="role-modal-backdrop" role="presentation" onMouseDown={onClose}><section className={`role-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog"><FiX /></button></header>{children}</section></div>;
}

function statusTone(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("active") || normalized.includes("create") || normalized.includes("update") || normalized.includes("publish")) return "good";
  if (normalized.includes("pending") || normalized.includes("read")) return "pending";
  return "bad";
}

function Status({ value }: { value: string }) {
  return <span className={`role-status ${statusTone(value)}`}>{value.replaceAll("_", " ")}</span>;
}

function Pagination({ page, totalPages, total, limit, onPage }: { page: number; totalPages: number; total: number; limit: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return <small className="admin-page-summary">{total} records</small>;
  const start = (page - 1) * limit + 1;
  const end = Math.min(total, page * limit);
  return <nav className="admin-pagination" aria-label="Pagination"><span>{start}–{end} of {total}</span><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}><FiChevronLeft /> Previous</button><b>Page {page} of {totalPages}</b><button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next <FiChevronRight /></button></nav>;
}

const initialUser: UserDraft = {
  full_name: "",
  email: "",
  password: "",
  phone_number: "",
  role: "STUDENT",
  student_number: "",
  current_semester: 1,
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += char;
  }
  cells.push(value.trim());
  return cells;
}

function csvToUsers(text: string): UserDraft[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV must include a header row and at least one user.");
  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const required = ["full_name", "email", "password", "phone_number", "role"];
  const missing = required.filter((key) => !headers.includes(key));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);
  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    const role = row.role?.toUpperCase() as UserRole;
    if (!["STUDENT", "INSTRUCTOR", "SYSTEM_ADMIN"].includes(role)) throw new Error(`Row ${rowIndex + 2}: invalid role ${row.role || "(empty)"}.`);
    return {
      full_name: row.full_name,
      email: row.email,
      password: row.password,
      phone_number: row.phone_number,
      role,
      student_number: row.student_number || undefined,
      current_semester: row.current_semester ? Number(row.current_semester) : undefined,
      specialization: row.specialization || undefined,
      office_location: row.office_location || undefined,
      employee_number: row.employee_number || undefined,
      is_super_admin: ["true", "1", "yes"].includes((row.is_super_admin || "").toLowerCase()),
    };
  });
}

function validateImportedUser(user: UserDraft, index: number) {
  const issues: string[] = [];
  if (!user.full_name.trim()) issues.push("full_name is required");
  if (!/^\S+@\S+\.\S+$/.test(user.email)) issues.push("email is invalid");
  if (user.password.length < 12 || !/[a-z]/.test(user.password) || !/[A-Z]/.test(user.password) || !/[0-9]/.test(user.password)) issues.push("password must be 12+ chars with upper, lower, and number");
  if (!/^\+[1-9]\d{6,14}$/.test(user.phone_number)) issues.push("phone_number must use international format");
  if (user.role === "STUDENT" && (!user.student_number || !user.current_semester)) issues.push("student_number and current_semester are required for students");
  if (user.role === "SYSTEM_ADMIN" && !user.employee_number) issues.push("employee_number is required for administrators");
  return issues.length ? `Row ${index + 2}: ${issues.join("; ")}` : null;
}

export function AdvancedAdminUsersPage() {
  const { user, request } = useAuth();
  const { notify } = useUx();
  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [draft, setDraft] = useState<UserDraft>(initialUser);
  const [importRows, setImportRows] = useState<UserDraft[]>([]);
  const [importValidation, setImportValidation] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (user?.role !== "SYSTEM_ADMIN") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search.trim()) query.set("search", search.trim());
    if (role) query.set("role", role);
    if (status) query.set("status", status);
    try {
      const response = await request<PageResponse<ManagedUser>>(`/admin/users?${query}`);
      setRows(response.data);
      setTotal(response.total);
      setTotalPages(Math.max(1, response.total_pages));
      if (page > response.total_pages && response.total_pages > 0) setPage(response.total_pages);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, [limit, page, request, role, search, status, user?.role]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 220);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => { setPage(1); }, [limit, role, search, status]);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await request("/admin/users", { method: "POST", body: draft });
      notify({ title: "Account created", description: `${draft.full_name} can now use the platform.`, tone: "success" });
      setDraft(initialUser);
      setCreateOpen(false);
      await load();
    } catch (cause) {
      notify({ title: "Could not create account", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(target: ManagedUser, nextStatus: ManagedUser["status"]) {
    if (target.status === nextStatus || busy) return;
    setBusy(true);
    try {
      await request(`/admin/users/${target.id}/status`, { method: "PATCH", body: { status: nextStatus } });
      setRows((current) => current.map((item) => item.id === target.id ? { ...item, status: nextStatus } : item));
      notify({ title: "Account status updated", description: `${target.full_name} is now ${nextStatus.replaceAll("_", " ").toLowerCase()}.`, tone: "success" });
    } catch (cause) {
      notify({ title: "Could not update status", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
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
    if (!window.confirm(`Deactivate ${target.full_name}? Existing sessions will be revoked.`)) return;
    try {
      await request(`/admin/users/${target.id}`, { method: "DELETE" });
      notify({ title: "Account deactivated", tone: "success" });
      await load();
    } catch (cause) {
      notify({ title: "Could not deactivate account", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  async function parseImport(file: File) {
    setImportResult(null);
    try {
      const parsed = csvToUsers(await file.text());
      if (parsed.length > 100) throw new Error("The API accepts at most 100 users per import batch.");
      const validation = parsed.map(validateImportedUser).filter(Boolean) as string[];
      setImportRows(parsed);
      setImportValidation(validation);
    } catch (cause) {
      setImportRows([]);
      setImportValidation([cause instanceof Error ? cause.message : "Unable to parse CSV."]);
    }
  }

  async function importUsers() {
    if (!importRows.length || importValidation.length || busy) return;
    setBusy(true);
    setImportResult(null);
    try {
      const result = await request<ImportResult>("/admin/users/import", { method: "POST", body: { users: importRows } });
      setImportResult(result);
      notify({ title: "Import completed", description: `${result.created_count} created, ${result.error_count} failed.`, tone: result.error_count ? "info" : "success" });
      await load();
    } catch (cause) {
      notify({ title: "Import request failed", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const content = [
      "full_name,email,password,phone_number,role,student_number,current_semester,specialization,office_location,employee_number,is_super_admin",
      'Example Student,student@example.com,SecurePass123,+201000000001,STUDENT,STU001,1,,,,false',
      'Example Instructor,instructor@example.com,SecurePass123,+201000000002,INSTRUCTOR,,,Cardiology,B201,,false',
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "user-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <ProductShell search="Search platform users"><main className="pp-page role-workspace advanced-admin-users">
    <div className="pp-title hero role-heading"><div><small className="page-eyebrow">ADMIN · IDENTITY & ACCESS</small><h1>User administration</h1><p>Create, import, search, paginate, secure, and deactivate role-specific accounts.</p></div><div className="role-heading-actions"><button className="pp-button secondary" type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button><button className="pp-button secondary" type="button" onClick={() => setImportOpen(true)}><FiUpload /> Import CSV</button><button className="pp-button" type="button" onClick={() => setCreateOpen(true)}><FiPlus /> New account</button></div></div>
    {user?.role !== "SYSTEM_ADMIN" ? <Panel title="Administrator access required"><p>This workspace is restricted to system administrators.</p></Panel> : <>
      <Panel className="role-filter-panel"><div className="role-filters"><label><span>Search</span><div className="role-search"><FiSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, or phone" /></div></label><label><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="">All roles</option><option value="STUDENT">Students</option><option value="INSTRUCTOR">Instructors</option><option value="SYSTEM_ADMIN">Administrators</option></select></label><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="PENDING_VERIFICATION">Pending verification</option><option value="SUSPENDED">Suspended</option><option value="DEACTIVATED">Deactivated</option></select></label><label><span>Rows</span><select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>{[10, 20, 50, 100].map((value) => <option value={value} key={value}>{value}</option>)}</select></label></div></Panel>
      {error && <ErrorState description={error} onRetry={() => void load()} />}
      {loading ? <PageSkeleton variant="list" label="Loading users" /> : rows.length ? <Panel title={`${total} accounts`} className="role-table-panel"><div className="role-table-scroll"><table className="role-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Role profile</th><th>Last login</th><th>Actions</th></tr></thead><tbody>{rows.map((target) => <tr key={target.id}><td><div className="role-person"><span>{target.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span><div><b>{target.full_name}</b><small>{target.email}<br />{target.phone_number}</small></div></div></td><td><Status value={target.role} /></td><td><select className="role-inline-select" value={target.status} disabled={target.id === user.id || busy} onChange={(event) => void changeStatus(target, event.target.value as ManagedUser["status"])}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="DEACTIVATED">Deactivated</option>{target.status === "PENDING_VERIFICATION" && <option value="PENDING_VERIFICATION">Pending verification</option>}</select></td><td><small>{target.role === "STUDENT" ? `${target.student_number || "No number"} · Semester ${target.current_semester || "—"}` : target.role === "INSTRUCTOR" ? `${target.specialization || "No specialization"}${target.office_location ? ` · ${target.office_location}` : ""}` : `${target.employee_number || "No employee number"}${target.is_super_admin ? " · Super admin" : ""}`}{target.forensic_code ? ` · ${target.forensic_code}` : ""}</small></td><td><small>{target.last_login_at ? new Date(target.last_login_at).toLocaleString() : "Never"}</small></td><td><div className="role-row-actions"><button type="button" onClick={() => void resetPassword(target)} title="Reset password"><FiShield /></button><button type="button" className="danger" disabled={target.id === user.id} onClick={() => void removeUser(target)} title="Deactivate user"><FiTrash2 /></button></div></td></tr>)}</tbody></table></div><Pagination page={page} totalPages={totalPages} total={total} limit={limit} onPage={setPage} /></Panel> : <EmptyState title="No accounts match these filters" description="Adjust the filters, move to another page, import a CSV, or create a new account." />}
    </>}

    <Modal title="Create managed account" open={createOpen} onClose={() => setCreateOpen(false)} wide><form className="role-form" onSubmit={createUser}><div className="role-form-grid"><label>Full name<input required value={draft.full_name} onChange={(event) => setDraft((current) => ({ ...current, full_name: event.target.value }))} /></label><label>Email<input required type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label><label>Phone number<input required placeholder="+201000000000" value={draft.phone_number} onChange={(event) => setDraft((current) => ({ ...current, phone_number: event.target.value }))} /></label><label>Initial password<input required minLength={12} type="password" value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} /></label><label>Role<select value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as UserRole }))}><option value="STUDENT">Student</option><option value="INSTRUCTOR">Instructor</option><option value="SYSTEM_ADMIN">System administrator</option></select></label>{draft.role === "STUDENT" && <><label>Student number<input required value={draft.student_number || ""} onChange={(event) => setDraft((current) => ({ ...current, student_number: event.target.value }))} /></label><label>Current semester<input required min={1} type="number" value={draft.current_semester || 1} onChange={(event) => setDraft((current) => ({ ...current, current_semester: Number(event.target.value) }))} /></label></>}{draft.role === "INSTRUCTOR" && <><label>Specialization<input value={draft.specialization || ""} onChange={(event) => setDraft((current) => ({ ...current, specialization: event.target.value }))} /></label><label>Office location<input value={draft.office_location || ""} onChange={(event) => setDraft((current) => ({ ...current, office_location: event.target.value }))} /></label></>}{draft.role === "SYSTEM_ADMIN" && <><label>Employee number<input required value={draft.employee_number || ""} onChange={(event) => setDraft((current) => ({ ...current, employee_number: event.target.value }))} /></label><label className="role-checkbox"><input type="checkbox" checked={Boolean(draft.is_super_admin)} onChange={(event) => setDraft((current) => ({ ...current, is_super_admin: event.target.checked }))} /> Grant super-administrator authority</label></>}</div><footer><button className="pp-button secondary" type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="pp-button" disabled={busy} type="submit">{busy ? "Creating…" : "Create account"}</button></footer></form></Modal>

    <Modal title="Import users from CSV" open={importOpen} onClose={() => setImportOpen(false)} wide><div className="admin-import-workspace"><section className="admin-import-drop"><FiFileText /><h3>CSV import</h3><p>Use the exact backend field names. The server imports up to 100 users and reports row-level failures without discarding successful rows.</p><div><button className="pp-button secondary" type="button" onClick={downloadTemplate}><FiDownload /> Download template</button><button className="pp-button" type="button" onClick={() => fileInput.current?.click()}><FiUpload /> Choose CSV</button><input ref={fileInput} hidden type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void parseImport(file); }} /></div></section>
      {importValidation.length > 0 && <section className="admin-import-errors"><FiAlertTriangle /><div><h3>Fix these CSV issues</h3><ul>{importValidation.slice(0, 20).map((issue) => <li key={issue}>{issue}</li>)}</ul>{importValidation.length > 20 && <p>And {importValidation.length - 20} more.</p>}</div></section>}
      {importRows.length > 0 && !importValidation.length && <><section className="admin-import-summary"><FiCheckCircle /><div><h3>{importRows.length} valid rows ready</h3><p>{importRows.filter((item) => item.role === "STUDENT").length} students · {importRows.filter((item) => item.role === "INSTRUCTOR").length} instructors · {importRows.filter((item) => item.role === "SYSTEM_ADMIN").length} administrators</p></div></section><div className="admin-import-preview"><table className="role-table"><thead><tr><th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Profile</th></tr></thead><tbody>{importRows.slice(0, 15).map((item, index) => <tr key={`${item.email}-${index}`}><td>{index + 1}</td><td>{item.full_name}</td><td>{item.email}</td><td><Status value={item.role} /></td><td><small>{item.role === "STUDENT" ? `${item.student_number} · semester ${item.current_semester}` : item.role === "INSTRUCTOR" ? item.specialization || "No specialization" : item.employee_number}</small></td></tr>)}</tbody></table>{importRows.length > 15 && <p>Preview shows the first 15 of {importRows.length} rows.</p>}</div></>}
      {importResult && <section className={`admin-import-result ${importResult.error_count ? "partial" : "complete"}`}><h3>{importResult.created_count} created · {importResult.error_count} failed</h3>{importResult.errors.length > 0 && <ul>{importResult.errors.map((item) => <li key={`${item.index}-${item.email}`}><b>Row {item.index + 2} · {item.email}</b><span>{item.error}</span></li>)}</ul>}</section>}
      <footer><button className="pp-button secondary" type="button" onClick={() => setImportOpen(false)}>Close</button><button className="pp-button" type="button" disabled={!importRows.length || Boolean(importValidation.length) || busy} onClick={() => void importUsers()}>{busy ? "Importing…" : `Import ${importRows.length || ""} users`}</button></footer>
    </div></Modal>
  </main></ProductShell>;
}

export function AdvancedAdminAuditPage() {
  const { user, accessToken, request } = useAuth();
  const { notify } = useUx();
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [userId, setUserId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateUntil, setDateUntil] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const serverQuery = useCallback((includePaging = true) => {
    const query = new URLSearchParams();
    if (includePaging) {
      query.set("page", String(page));
      query.set("limit", String(limit));
    }
    if (action) query.set("action", action);
    if (entity.trim()) query.set("entity_name", entity.trim());
    if (userId.trim()) query.set("user_id", userId.trim());
    if (dateFrom) query.set("date_from", dateFrom);
    if (dateUntil) query.set("date_until", `${dateUntil}T23:59:59.999Z`);
    return query;
  }, [action, dateFrom, dateUntil, entity, limit, page, userId]);

  const load = useCallback(async () => {
    if (user?.role !== "SYSTEM_ADMIN") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await request<PageResponse<AuditLog>>(`/audit-logs?${serverQuery()}`);
      setRows(response.data);
      setTotal(response.total);
      setTotalPages(Math.max(1, response.total_pages));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load audit records.");
    } finally {
      setLoading(false);
    }
  }, [request, serverQuery, user?.role]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [action, dateFrom, dateUntil, entity, limit, userId]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((log) => [log.action, log.entity_name, log.entityName, log.description, log.user?.fullName, log.user?.email, log.ip_address, log.ipAddress].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [rows, search]);
  const actions = useMemo(() => [...new Set(rows.map((row) => row.action))].sort(), [rows]);
  const entities = useMemo(() => [...new Set(rows.map((row) => row.entity_name || row.entityName).filter(Boolean) as string[])].sort(), [rows]);

  async function exportCsv() {
    if (!accessToken || exporting) return;
    setExporting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/audit-logs/export/file?${serverQuery(false)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new Error(await response.text() || `Export failed with ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      notify({ title: "Audit CSV exported", description: "The export used the active server-side filters.", tone: "success" });
    } catch (cause) {
      notify({ title: "Could not export audit log", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setExporting(false);
    }
  }

  function clearFilters() {
    setAction("");
    setEntity("");
    setUserId("");
    setDateFrom("");
    setDateUntil("");
    setSearch("");
  }

  return <ProductShell search="Search audit events"><main className="pp-page role-workspace advanced-admin-audit">
    <div className="pp-title hero role-heading"><div><small className="page-eyebrow">ADMIN · GOVERNANCE</small><h1>Audit trail</h1><p>Filter immutable evidence server-side, inspect individual events, paginate large histories, and export the exact active scope.</p></div><div className="role-heading-actions"><button className="pp-button secondary" type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button><button className="pp-button" type="button" disabled={exporting} onClick={() => void exportCsv()}><FiDownload /> {exporting ? "Exporting…" : "Export CSV"}</button></div></div>
    {user?.role !== "SYSTEM_ADMIN" ? <Panel title="Administrator access required"><p>This audit trail is restricted to system administrators.</p></Panel> : <>
      <Panel className="role-filter-panel"><div className="audit-filter-grid"><label><span>Current-page search</span><div className="role-search"><FiSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Description, actor, IP" /></div></label><label><span>Action</span><input list="audit-actions" value={action} onChange={(event) => setAction(event.target.value)} placeholder="CREATE, UPDATE…" /><datalist id="audit-actions">{actions.map((value) => <option value={value} key={value} />)}</datalist></label><label><span>Entity</span><input list="audit-entities" value={entity} onChange={(event) => setEntity(event.target.value)} placeholder="users, tests…" /><datalist id="audit-entities">{entities.map((value) => <option value={value} key={value} />)}</datalist></label><label><span>User UUID</span><input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Optional actor id" /></label><label><span>From</span><input type="date" value={dateFrom} max={dateUntil || undefined} onChange={(event) => setDateFrom(event.target.value)} /></label><label><span>Until</span><input type="date" value={dateUntil} min={dateFrom || undefined} onChange={(event) => setDateUntil(event.target.value)} /></label><label><span>Rows</span><select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>{[10, 20, 50, 100].map((value) => <option value={value} key={value}>{value}</option>)}</select></label><button className="pp-button secondary" type="button" onClick={clearFilters}><FiX /> Clear filters</button></div></Panel>
      {error && <ErrorState description={error} onRetry={() => void load()} />}
      {loading ? <PageSkeleton variant="list" label="Loading audit records" /> : visible.length ? <><div className="role-audit-list">{visible.map((log) => <Panel key={log.id} className="role-audit-card selectable-audit" onClick={() => setSelected(log)}><div className="role-audit-icon"><FiShield /></div><div><header><Status value={log.action} /><small>{new Date(log.created_at || log.createdAt || "").toLocaleString()}</small></header><h2>{log.description}</h2><p>{(log.entity_name || log.entityName || "platform").replaceAll("_", " ")} {log.entity_id || log.entityId ? `· ${log.entity_id || log.entityId}` : ""}</p><footer><span>{log.user?.fullName || log.user?.email || "System process"}</span><span>{log.ip_address || log.ipAddress || "No IP recorded"}</span></footer></div></Panel>)}</div><Pagination page={page} totalPages={totalPages} total={total} limit={limit} onPage={setPage} /></> : <EmptyState title="No audit events match" description="The server returned no records for these filters, or the current-page text search excludes them." />}
    </>}
    <Modal title="Audit event details" open={Boolean(selected)} onClose={() => setSelected(null)}>{selected && <div className="audit-detail"><Status value={selected.action} /><h2>{selected.description}</h2><dl><dt>Event ID</dt><dd>{selected.id}</dd><dt>Timestamp</dt><dd>{new Date(selected.created_at || selected.createdAt || "").toLocaleString()}</dd><dt>Actor</dt><dd>{selected.user?.fullName || selected.user?.email || "System process"}</dd><dt>Actor ID</dt><dd>{selected.user?.id || "Not recorded"}</dd><dt>Entity</dt><dd>{selected.entity_name || selected.entityName || "Platform"}</dd><dt>Entity ID</dt><dd>{selected.entity_id || selected.entityId || "Not recorded"}</dd><dt>IP address</dt><dd>{selected.ip_address || selected.ipAddress || "Not recorded"}</dd></dl></div>}</Modal>
  </main></ProductShell>;
}