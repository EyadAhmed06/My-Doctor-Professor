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
type ManagedWeek = { id: string; weekNumber: number; title: string | null; linked: boolean; inFirstPlan: boolean; inFinalPlan: boolean };
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
type PlanKey = "FIRST" | "FINAL";
type PlanTier = "MCQ" | "MCQ_ESSAY";
type PlanConfig = { enabled: boolean; price_mcq: number | null; price_mcq_essay: number | null; week_ids: string[] };
type ManagedPlanGrant = {
  id: string;
  student: Person;
  plan: PlanKey;
  tier: PlanTier;
  status: string;
  paymentStatus: "NOT_REQUIRED" | "PENDING" | "PAID" | "CANCELLED";
  paidAt: string | null;
  paymentReference: string | null;
};
type Management = {
  bundle: Bundle;
  courses: ManagedCourse[];
  tests: ManagedTest[];
  instructors: { assigned: Person[]; available: Person[] };
  plans: { first: PlanConfig; final: PlanConfig };
  students: { enrollments: ManagedEnrollment[]; planGrants: ManagedPlanGrant[]; available: Person[] };
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
  const [firstEnabled, setFirstEnabled] = useState(false);
  const [firstMcqPrice, setFirstMcqPrice] = useState("");
  const [firstEssayPrice, setFirstEssayPrice] = useState("");
  const [finalEnabled, setFinalEnabled] = useState(false);
  const [finalMcqPrice, setFinalMcqPrice] = useState("");
  const [finalEssayPrice, setFinalEssayPrice] = useState("");
  const [planStudentId, setPlanStudentId] = useState<Record<PlanKey, string>>({ FIRST: "", FINAL: "" });
  const [planTier, setPlanTier] = useState<Record<PlanKey, PlanTier>>({ FIRST: "MCQ", FINAL: "MCQ" });

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
      setFirstEnabled(result.plans.first.enabled);
      setFirstMcqPrice(result.plans.first.price_mcq === null ? "" : String(result.plans.first.price_mcq));
      setFirstEssayPrice(result.plans.first.price_mcq_essay === null ? "" : String(result.plans.first.price_mcq_essay));
      setFinalEnabled(result.plans.final.enabled);
      setFinalMcqPrice(result.plans.final.price_mcq === null ? "" : String(result.plans.final.price_mcq));
      setFinalEssayPrice(result.plans.final.price_mcq_essay === null ? "" : String(result.plans.final.price_mcq_essay));
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

  async function savePlans(event: FormEvent) {
    event.preventDefault();
    if (firstEnabled && (!firstMcqPrice || !firstEssayPrice || Number(firstEssayPrice) <= Number(firstMcqPrice))) {
      notify({ title: "First plan pricing incomplete", description: "Set both prices, and the MCQ + Essay price must be higher than the MCQ-only price.", tone: "error" });
      return;
    }
    if (finalEnabled && (!finalMcqPrice || !finalEssayPrice || Number(finalEssayPrice) <= Number(finalMcqPrice))) {
      notify({ title: "Final plan pricing incomplete", description: "Set both prices, and the MCQ + Essay price must be higher than the MCQ-only price.", tone: "error" });
      return;
    }
    await mutate(`/bundles/${bundleId}/plans`, "PUT", {
      first_plan_enabled: firstEnabled,
      first_plan_price_mcq: firstMcqPrice ? Number(firstMcqPrice) : null,
      first_plan_price_mcq_essay: firstEssayPrice ? Number(firstEssayPrice) : null,
      final_plan_enabled: finalEnabled,
      final_plan_price_mcq: finalMcqPrice ? Number(finalMcqPrice) : null,
      final_plan_price_mcq_essay: finalEssayPrice ? Number(finalEssayPrice) : null,
    }, "Subscription plans saved");
  }

  async function togglePlanWeek(plan: PlanKey, weekId: string) {
    if (!data) return;
    const config = plan === "FIRST" ? data.plans.first : data.plans.final;
    const nextWeekIds = config.week_ids.includes(weekId)
      ? config.week_ids.filter((id) => id !== weekId)
      : [...config.week_ids, weekId];
    await mutate(`/bundles/${bundleId}/plans/${plan}/weeks`, "PUT", { week_ids: nextWeekIds }, `${plan === "FIRST" ? "First" : "Final"} plan weeks updated`);
  }

  async function assignPlanStudent(plan: PlanKey, event: FormEvent) {
    event.preventDefault();
    const studentIdToAssign = planStudentId[plan];
    if (!studentIdToAssign) return;
    await mutate(`/bundles/${bundleId}/plans/${plan}/enrollments`, "POST", {
      student_id: studentIdToAssign,
      tier: planTier[plan],
    }, "Student assigned — payment still required");
    setPlanStudentId((current) => ({ ...current, [plan]: "" }));
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
  const linkedWeeks = useMemo(() => (data?.courses || [])
    .flatMap((course) => course.weeks.filter((week) => week.linked).map((week) => ({ ...week, courseCode: course.courseCode })))
    .sort((left, right) => left.weekNumber - right.weekNumber), [data]);
  const firstPlanGrants = useMemo(() => data?.students.planGrants.filter((row) => row.plan === "FIRST" && (row.status !== "REVOKED" || row.paymentStatus === "PENDING")) || [], [data]);
  const finalPlanGrants = useMemo(() => data?.students.planGrants.filter((row) => row.plan === "FINAL" && (row.status !== "REVOKED" || row.paymentStatus === "PENDING")) || [], [data]);

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

    <Panel title="Subscription plans" action={<button className="bundle-inline-action" type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button>}>
      <div className="bundle-management-note"><FiDollarSign /><span><b>Sell partial access alongside the full bundle</b><small>Offer &quot;First 5 Weeks&quot; and/or &quot;Final 5 Weeks&quot; as separate paid plans. Each plan has an MCQ-only tier and a pricier MCQ + Essay tier, and only unlocks the weeks you assign to it below.</small></span></div>
      <form className="bundle-plan-pricing-form" onSubmit={savePlans}>
        <div className="bundle-plan-grid">
          <fieldset className="bundle-plan-fieldset">
            <legend><label><input type="checkbox" checked={firstEnabled} onChange={(event) => setFirstEnabled(event.target.checked)} /> First 5 Weeks</label></legend>
            <label>MCQ price<input aria-label="First plan MCQ price" type="number" min="0.01" step="0.01" value={firstMcqPrice} onChange={(event) => setFirstMcqPrice(event.target.value)} disabled={!firstEnabled} /></label>
            <label>MCQ + Essay price<input aria-label="First plan MCQ + Essay price" type="number" min="0.01" step="0.01" value={firstEssayPrice} onChange={(event) => setFirstEssayPrice(event.target.value)} disabled={!firstEnabled} /></label>
          </fieldset>
          <fieldset className="bundle-plan-fieldset">
            <legend><label><input type="checkbox" checked={finalEnabled} onChange={(event) => setFinalEnabled(event.target.checked)} /> Final 5 Weeks</label></legend>
            <label>MCQ price<input aria-label="Final plan MCQ price" type="number" min="0.01" step="0.01" value={finalMcqPrice} onChange={(event) => setFinalMcqPrice(event.target.value)} disabled={!finalEnabled} /></label>
            <label>MCQ + Essay price<input aria-label="Final plan MCQ + Essay price" type="number" min="0.01" step="0.01" value={finalEssayPrice} onChange={(event) => setFinalEssayPrice(event.target.value)} disabled={!finalEnabled} /></label>
          </fieldset>
        </div>
        <button className="pp-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save plan pricing"}</button>
      </form>

      <div className="bundle-plan-grid">
        <PlanCard
          label="First 5 Weeks"
          enabled={data.plans.first.enabled}
          weekIds={data.plans.first.week_ids}
          linkedWeeks={linkedWeeks}
          grants={firstPlanGrants}
          bundleId={bundleId}
          busy={busy}
          studentId={planStudentId.FIRST}
          setStudentId={(value) => setPlanStudentId((current) => ({ ...current, FIRST: value }))}
          tier={planTier.FIRST}
          setTier={(value) => setPlanTier((current) => ({ ...current, FIRST: value }))}
          availableStudents={data.students.available}
          onToggleWeek={(weekId) => void togglePlanWeek("FIRST", weekId)}
          onAssign={(event) => void assignPlanStudent("FIRST", event)}
          onConfirmPayment={(studentId) => void mutate(`/bundles/${bundleId}/plans/FIRST/enrollments/${studentId}/confirm-payment`, "POST", {}, "Payment confirmed — content unlocked")}
          onRevoke={(studentId) => void mutate(`/bundles/${bundleId}/plans/FIRST/enrollments/${studentId}`, "DELETE", undefined, "Plan access revoked")}
        />
        <PlanCard
          label="Final 5 Weeks"
          enabled={data.plans.final.enabled}
          weekIds={data.plans.final.week_ids}
          linkedWeeks={linkedWeeks}
          grants={finalPlanGrants}
          bundleId={bundleId}
          busy={busy}
          studentId={planStudentId.FINAL}
          setStudentId={(value) => setPlanStudentId((current) => ({ ...current, FINAL: value }))}
          tier={planTier.FINAL}
          setTier={(value) => setPlanTier((current) => ({ ...current, FINAL: value }))}
          availableStudents={data.students.available}
          onToggleWeek={(weekId) => void togglePlanWeek("FINAL", weekId)}
          onAssign={(event) => void assignPlanStudent("FINAL", event)}
          onConfirmPayment={(studentId) => void mutate(`/bundles/${bundleId}/plans/FINAL/enrollments/${studentId}/confirm-payment`, "POST", {}, "Payment confirmed — content unlocked")}
          onRevoke={(studentId) => void mutate(`/bundles/${bundleId}/plans/FINAL/enrollments/${studentId}`, "DELETE", undefined, "Plan access revoked")}
        />
      </div>
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

function PlanCard({
  label,
  enabled,
  weekIds,
  linkedWeeks,
  grants,
  busy,
  studentId,
  setStudentId,
  tier,
  setTier,
  availableStudents,
  onToggleWeek,
  onAssign,
  onConfirmPayment,
  onRevoke,
}: {
  label: string;
  enabled: boolean;
  weekIds: string[];
  linkedWeeks: (ManagedWeek & { courseCode: string })[];
  grants: ManagedPlanGrant[];
  bundleId: string;
  busy: boolean;
  studentId: string;
  setStudentId: (value: string) => void;
  tier: PlanTier;
  setTier: (value: PlanTier) => void;
  availableStudents: Person[];
  onToggleWeek: (weekId: string) => void;
  onAssign: (event: FormEvent) => void;
  onConfirmPayment: (studentId: string) => void;
  onRevoke: (studentId: string) => void;
}) {
  const grantedStudentIds = new Set(grants.map((row) => row.student.id));
  const eligibleStudents = availableStudents.filter((person) => !grantedStudentIds.has(person.id));
  return <article className={`bundle-manage-course bundle-plan-card ${enabled ? "linked" : ""}`}>
    <header><div><b>{label}</b><small>{enabled ? "Offered to students" : "Not offered yet — enable it above"}</small></div></header>
    <div className="bundle-week-composer">{linkedWeeks.length ? linkedWeeks.map((week) => <button type="button" key={week.id} className={weekIds.includes(week.id) ? "selected" : ""} disabled={busy} onClick={() => onToggleWeek(week.id)}><span>{weekIds.includes(week.id) ? <FiCheck /> : <FiPlus />}</span>{week.courseCode} · Week {week.weekNumber}{week.title ? ` · ${week.title}` : ""}</button>) : <small>Attach courses and weeks above first, then choose which ones belong to this plan.</small>}</div>

    <div className="bundle-student-list">{grants.length ? grants.map((row) => <article className={row.paymentStatus === "PAID" ? "accessible" : "locked"} key={row.id}>
      <div className="bundle-student-state"><span>{row.paymentStatus === "PAID" ? <FiCheck /> : <FiLock />}</span><div><b>{row.student.fullName}</b><small>{row.student.email}</small></div></div>
      <div className="bundle-entitlement-badges"><em>{row.tier.replaceAll("_", " ")}</em><em>{row.paymentStatus.replaceAll("_", " ")}</em></div>
      <div className="bundle-student-actions">{row.paymentStatus === "PENDING" && <button type="button" disabled={busy} onClick={() => onConfirmPayment(row.student.id)}>Confirm payment</button>}<button className="danger" type="button" disabled={busy} onClick={() => onRevoke(row.student.id)}>Revoke</button></div>
    </article>) : <EmptyState title="No students on this plan" description="Assign a student below once the plan is enabled." />}</div>

    <form className="bundle-assignment-form student" onSubmit={onAssign}>
      <select aria-label={`Student to assign to ${label}`} value={studentId} onChange={(event) => setStudentId(event.target.value)} disabled={!enabled}><option value="">Select a student</option>{eligibleStudents.map((person) => <option value={person.id} key={person.id}>{person.fullName} · {person.email}</option>)}</select>
      <select aria-label={`Tier for ${label}`} value={tier} onChange={(event) => setTier(event.target.value as PlanTier)} disabled={!enabled}><option value="MCQ">MCQ only</option><option value="MCQ_ESSAY">MCQ + Essay</option></select>
      <button className="pp-button" disabled={busy || !enabled || !studentId}><FiPlus /> Assign pending payment</button>
    </form>
  </article>;
}
