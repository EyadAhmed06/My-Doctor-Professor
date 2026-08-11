"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FiBookOpen,
  FiCheck,
  FiCreditCard,
  FiDollarSign,
  FiLock,
  FiPlus,
  FiRefreshCw,
  FiTrash2,
  FiUserCheck,
  FiUsers,
} from "react-icons/fi";
import { EmptyState, PageSkeleton } from "./async-state";
import { useAuth } from "./auth-provider";
import { Panel } from "./product-shell";
import { useUx } from "./ux-provider";
import "./bundle-management.css";

type Bundle = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isFree: boolean;
  priceAmount: string | null;
  priceCurrency: string;
};
type ManagedWeek = { id: string; weekNumber: number; title: string | null; linked: boolean };
type ManagedCourse = { id: string; courseCode: string; courseName: string; linked: boolean; weeks: ManagedWeek[] };
type ManagedTest = { id: string; title: string; testType: string; courseId: string | null; linked: boolean };
type Person = { id: string; fullName: string; email: string };
type ManagedEnrollment = {
  id: string;
  student: Person;
  status: string;
  paymentStatus: "NOT_REQUIRED" | "PENDING" | "PAID" | "CANCELLED";
  paidAt: string | null;
  paymentReference: string | null;
  accessible: boolean;
  payment_required: boolean;
  access_status: string;
};
type Management = {
  bundle: Bundle;
  courses: ManagedCourse[];
  tests: ManagedTest[];
  instructors: { assigned: Person[]; available: Person[] };
  students: { enrollments: ManagedEnrollment[]; available: Person[] };
};

export function BundleManagementPanel({ bundleId, onChanged }: { bundleId: string; onChanged?: () => void | Promise<void> }) {
  const { request } = useAuth();
  const { notify } = useUx();
  const [data, setData] = useState<Management | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [instructorId, setInstructorId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [isFree, setIsFree] = useState(true);
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("EGP");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await request<Management>(`/bundles/${bundleId}/management`);
      setData(result);
      setIsFree(result.bundle.isFree);
      setPrice(result.bundle.priceAmount || "");
      setCurrency(result.bundle.priceCurrency || "EGP");
      setInstructorId((current) => result.instructors.available.some((item) => item.id === current) ? current : "");
      setStudentId((current) => result.students.available.some((item) => item.id === current) ? current : "");
    } catch (cause) {
      notify({ title: "Could not load bundle management", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [bundleId, notify, request]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(path: string, method: "POST" | "PUT" | "DELETE", body?: unknown, success = "Bundle updated") {
    if (busy) return;
    setBusy(true);
    try {
      await request(path, { method, ...(body === undefined ? {} : { body }) });
      await load();
      await onChanged?.();
      notify({ title: success, tone: "success" });
    } catch (cause) {
      notify({ title: "Could not update bundle", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function savePricing(event: FormEvent) {
    event.preventDefault();
    if (!isFree && (!price || Number(price) <= 0)) {
      notify({ title: "Price required", description: "Paid bundles must have a price greater than zero before students can be granted paid access.", tone: "error" });
      return;
    }
    await mutate(`/bundles/${bundleId}`, "PUT", {
      is_free: isFree,
      price_amount: isFree ? undefined : Number(price),
      price_currency: currency.toUpperCase(),
    }, isFree ? "Bundle changed to free access" : "Paid access policy saved");
  }

  async function assignStudent(event: FormEvent) {
    event.preventDefault();
    if (!studentId) return;
    await mutate(`/bundles/${bundleId}/enrollments`, "POST", {
      student_id: studentId,
      payment_confirmed: data?.bundle.isFree ? false : paymentConfirmed,
      payment_reference: !data?.bundle.isFree && paymentConfirmed && paymentReference.trim() ? paymentReference.trim() : undefined,
    }, data?.bundle.isFree || paymentConfirmed ? "Student access granted" : "Student assigned — payment still required");
    setStudentId("");
    setPaymentConfirmed(false);
    setPaymentReference("");
  }

  const assignedStudents = useMemo(() => data?.students.enrollments.filter((row) => row.status !== "REVOKED" || row.paymentStatus === "PENDING") || [], [data]);

  if (loading) return <Panel title="Bundle setup"><PageSkeleton variant="cards" label="Loading bundle configuration" /></Panel>;
  if (!data) return <Panel title="Bundle setup"><EmptyState title="Management unavailable" description="Refresh the bundle and try again." /></Panel>;

  return <section className="bundle-management-stack">
    <Panel title="Access & pricing" className="bundle-management-policy">
      <div className="bundle-policy-explainer">
        {data.bundle.isFree ? <FiCheck /> : <FiCreditCard />}
        <div><b>{data.bundle.isFree ? "Free bundle" : `${data.bundle.priceCurrency} ${Number(data.bundle.priceAmount || 0).toFixed(2)}`}</b><small>{data.bundle.isFree ? "Assigned/enrolled students receive access immediately." : "Students may be assigned before payment, but content stays locked until payment is explicitly confirmed."}</small></div>
      </div>
      <form className="bundle-policy-form" onSubmit={savePricing}>
        <label>Access<select value={isFree ? "FREE" : "PAID"} onChange={(event) => setIsFree(event.target.value === "FREE")}><option value="FREE">FREE</option><option value="PAID">PAID</option></select></label>
        {!isFree && <><label>Price<input aria-label="Bundle price" required min="0.01" step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></label><label>Currency<input aria-label="Bundle currency" required minLength={3} maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} /></label></>}
        <button className="pp-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save access policy"}</button>
      </form>
    </Panel>

    <Panel title="Curriculum composition" action={<button className="bundle-inline-action" type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button>}>
      <div className="bundle-management-note"><FiBookOpen /><span><b>Course → week → lecture content</b><small>Add a course first, then choose the exact weeks. Lectures, resources, study guides, flashcards and question-bank content are inherited automatically from those selected weeks.</small></span></div>
      <div className="bundle-course-composer">{data.courses.length ? data.courses.map((course) => <article className={`bundle-manage-course ${course.linked ? "linked" : ""}`} key={course.id}>
        <header><div><b>{course.courseCode} · {course.courseName}</b><small>{course.linked ? "Course attached" : "Not in bundle"}</small></div><button className={course.linked ? "danger" : "primary"} type="button" disabled={busy} onClick={() => void mutate(course.linked ? `/bundles/${bundleId}/courses/${course.id}` : `/bundles/${bundleId}/courses`, course.linked ? "DELETE" : "POST", course.linked ? undefined : { resource_id: course.id }, course.linked ? "Course removed" : "Course attached")}>{course.linked ? <><FiTrash2 /> Remove course</> : <><FiPlus /> Add course</>}</button></header>
        <div className="bundle-week-composer">{course.weeks.map((week) => <button type="button" key={week.id} className={week.linked ? "selected" : ""} disabled={busy || !course.linked} onClick={() => void mutate(week.linked ? `/bundles/${bundleId}/weeks/${week.id}` : `/bundles/${bundleId}/weeks`, week.linked ? "DELETE" : "POST", week.linked ? undefined : { resource_id: week.id }, week.linked ? "Week removed" : "Week attached")}><span>{week.linked ? <FiCheck /> : <FiPlus />}</span>Week {week.weekNumber}{week.title ? ` · ${week.title}` : ""}</button>)}</div>
      </article>) : <EmptyState title="No attachable courses" description="No active courses are available in your academic scope." />}</div>
    </Panel>

    <Panel title="Past exams / assessments">
      <p className="bundle-section-copy">Attach published assessments explicitly. Students still need valid bundle access before these tests open.</p>
      <div className="bundle-manage-list">{data.tests.length ? data.tests.map((test) => <article key={test.id}><span><b>{test.title}</b><small>{test.testType}</small></span><button type="button" disabled={busy} onClick={() => void mutate(test.linked ? `/bundles/${bundleId}/tests/${test.id}` : `/bundles/${bundleId}/tests`, test.linked ? "DELETE" : "POST", test.linked ? undefined : { resource_id: test.id }, test.linked ? "Assessment removed" : "Assessment attached")}>{test.linked ? "Remove" : "Attach"}</button></article>) : <EmptyState title="No published assessments" description="Publish an assessment first, then attach it here." />}</div>
    </Panel>

    <div className="bundle-management-columns">
      <Panel title="Instructors">
        <div className="bundle-management-note compact"><FiUserCheck /><span><b>Already assigned instructors are excluded</b><small>The assignment picker only shows active instructors who are not already managing this bundle.</small></span></div>
        <div className="bundle-manage-list">{data.instructors.assigned.map((person) => <article key={person.id}><span><b>{person.fullName}</b><small>{person.email}</small></span><button className="danger" type="button" disabled={busy} onClick={() => void mutate(`/bundles/${bundleId}/instructors/${person.id}`, "DELETE", undefined, "Instructor removed")}>Remove</button></article>)}</div>
        <form className="bundle-assignment-form" onSubmit={(event) => { event.preventDefault(); if (instructorId) void mutate(`/bundles/${bundleId}/instructors`, "POST", { instructor_id: instructorId }, "Instructor assigned"); }}>
          <select aria-label="Instructor to assign" value={instructorId} onChange={(event) => setInstructorId(event.target.value)}><option value="">Select unassigned instructor</option>{data.instructors.available.map((person) => <option value={person.id} key={person.id}>{person.fullName} · {person.email}</option>)}</select>
          <button className="pp-button" disabled={busy || !instructorId}><FiPlus /> Assign</button>
        </form>
      </Panel>

      <Panel title="Students & entitlement">
        <div className="bundle-management-note compact"><FiUsers /><span><b>{data.bundle.isFree ? "Free = immediate entitlement" : "Paid = locked until verified"}</b><small>{data.bundle.isFree ? "A student becomes accessible as soon as the enrollment is active." : "Assigning a student does not unlock content. Payment confirmation is a separate server-side entitlement step."}</small></span></div>
        <div className="bundle-student-list">{assignedStudents.length ? assignedStudents.map((row) => <article className={row.accessible ? "accessible" : "locked"} key={row.id}><div className="bundle-student-state"><span>{row.accessible ? <FiCheck /> : <FiLock />}</span><div><b>{row.student.fullName}</b><small>{row.student.email}</small></div></div><div className="bundle-entitlement-badges"><em>{row.access_status.replaceAll("_", " ")}</em><em>{row.paymentStatus.replaceAll("_", " ")}</em></div><div className="bundle-student-actions">{row.paymentStatus === "PENDING" && <button type="button" disabled={busy} onClick={() => void mutate(`/bundles/${bundleId}/enrollments/${row.student.id}/confirm-payment`, "POST", {}, "Payment confirmed — content unlocked")}>Confirm payment</button>}<button className="danger" type="button" disabled={busy} onClick={() => void mutate(`/bundles/${bundleId}/enrollments/${row.student.id}`, "DELETE", undefined, "Student access revoked")}>Revoke</button></div></article>) : <EmptyState title="No assigned students" description="Assign a student below. Paid bundles remain locked until payment is confirmed." />}</div>
        <form className="bundle-assignment-form student" onSubmit={assignStudent}>
          <select aria-label="Student to assign" value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Select unassigned student</option>{data.students.available.map((person) => <option value={person.id} key={person.id}>{person.fullName} · {person.email}</option>)}</select>
          {!data.bundle.isFree && <label className="bundle-payment-confirm"><input type="checkbox" checked={paymentConfirmed} onChange={(event) => setPaymentConfirmed(event.target.checked)} /><span><b>Payment already verified</b><small>Leave unchecked to assign the student without granting content access.</small></span></label>}
          {!data.bundle.isFree && paymentConfirmed && <input aria-label="Payment reference" placeholder="Payment reference (optional)" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />}
          <button className="pp-button" disabled={busy || !studentId}><FiPlus /> {data.bundle.isFree || paymentConfirmed ? "Assign & grant" : "Assign pending payment"}</button>
        </form>
      </Panel>
    </div>

    <Panel title="Publication">
      <div className="bundle-publication-row"><span><b>Current status: {data.bundle.status}</b><small>A paid bundle cannot be published without a valid price, and every published bundle needs at least one course.</small></span><div>{data.bundle.status !== "PUBLISHED" && <button className="pp-button" type="button" disabled={busy} onClick={() => void mutate(`/bundles/${bundleId}/status`, "PUT", { status: "PUBLISHED" }, "Bundle published")}>Publish</button>}{data.bundle.status === "PUBLISHED" && <button className="pp-button secondary" type="button" disabled={busy} onClick={() => void mutate(`/bundles/${bundleId}/status`, "PUT", { status: "ARCHIVED" }, "Bundle archived")}>Archive</button>}</div></div>
    </Panel>
  </section>;
}
