"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  FiBookOpen,
  FiCheck,
  FiCreditCard,
  FiPlus,
  FiRefreshCw,
  FiTrash2,
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
  availableUntil: string | null;
};
type ManagedWeek = { id: string; weekNumber: number; title: string | null; linked: boolean };
type ManagedCourse = { id: string; courseCode: string; courseName: string; linked: boolean; weeks: ManagedWeek[] };
type ManagedTest = { id: string; title: string; testType: string; linked: boolean };
type Person = { id: string; fullName: string; email: string };
type Management = {
  bundle: Bundle;
  courses: ManagedCourse[];
  tests: ManagedTest[];
  instructors: { assigned: Person[]; available: Person[] };
};

export function BundleManagementPanel({ bundleId, onChanged }: {
  bundleId: string;
  onChanged?: () => void | Promise<void>;
}) {
  const { request } = useAuth();
  const { notify } = useUx();
  const [data, setData] = useState<Management | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isFree, setIsFree] = useState(true);
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("EGP");
  const [expiry, setExpiry] = useState("");
  const [instructorId, setInstructorId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await request<Management>(`/bundles/${bundleId}/management`);
      setData(result);
      setIsFree(result.bundle.isFree);
      setPrice(result.bundle.priceAmount || "");
      setCurrency(result.bundle.priceCurrency || "EGP");
      setExpiry(result.bundle.availableUntil
        ? new Date(result.bundle.availableUntil).toISOString().slice(0, 16)
        : "");
      setInstructorId((current) =>
        result.instructors.available.some((item) => item.id === current) ? current : "",
      );
    } catch (cause) {
      notify({
        title: "Could not load bundle setup",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [bundleId, notify, request]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(
    endpoint: string,
    method: "POST" | "PUT" | "DELETE",
    body?: unknown,
    success = "Bundle updated",
  ) {
    if (busy) return;
    setBusy(true);
    try {
      await request(endpoint, { method, ...(body === undefined ? {} : { body }) });
      await load();
      await onChanged?.();
      notify({ title: success, tone: "success" });
    } catch (cause) {
      notify({
        title: "Could not update bundle",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveAccess(event: FormEvent) {
    event.preventDefault();
    if (!isFree && (!price || Number(price) <= 0)) {
      notify({
        title: "Price required",
        description: "Enter the full bundle price before saving a paid bundle.",
        tone: "error",
      });
      return;
    }
    await mutate(`/bundles/${bundleId}`, "PUT", {
      access_mode: "PUBLIC",
      is_free: isFree,
      price_amount: isFree ? undefined : Number(price),
      price_currency: currency.toUpperCase(),
      available_until: expiry ? new Date(expiry).toISOString() : null,
    }, isFree ? "Bundle is now free" : "Paid bundle price saved");
  }

  if (loading) {
    return <Panel title="Bundle setup"><PageSkeleton variant="cards" label="Loading bundle setup" /></Panel>;
  }
  if (!data) {
    return <Panel title="Bundle setup"><EmptyState title="Setup unavailable" description="Refresh and try again." /></Panel>;
  }

  return <section className="bundle-management-stack">
    <Panel title="Bundle access" className="bundle-management-policy">
      <form className="bundle-policy-form" onSubmit={saveAccess}>
        <label>
          Type
          <select
            aria-label="Bundle type"
            value={isFree ? "FREE" : "PAID"}
            onChange={(event) => setIsFree(event.target.value === "FREE")}
          >
            <option value="FREE">Free</option>
            <option value="PAID">Paid</option>
          </select>
        </label>
        {!isFree && <>
          <label>
            Price
            <input
              aria-label="Bundle price"
              required
              min="0.01"
              step="0.01"
              type="number"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </label>
          <label>
            Currency
            <input
              aria-label="Bundle currency"
              required
              minLength={3}
              maxLength={3}
              value={currency}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            />
          </label>
        </>}
        <label>
          Expiry
          <input
            aria-label="Bundle expiry"
            type="datetime-local"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
          />
        </label>
        <button className="pp-button" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
      <p className="bundle-section-copy">
        {isFree
          ? "Students can join this bundle immediately for free."
          : "Students see the bundle as locked until their payment is confirmed."}
      </p>
    </Panel>

    <Panel
      title="Curriculum"
      action={<button className="bundle-inline-action" type="button" onClick={() => void load()}>
        <FiRefreshCw /> Refresh
      </button>}
    >
      <div className="bundle-course-composer">
        {data.courses.length ? data.courses.map((course) =>
          <article className={`bundle-manage-course ${course.linked ? "linked" : ""}`} key={course.id}>
            <header>
              <div>
                <b>{course.courseCode} · {course.courseName}</b>
                <small>{course.linked ? "Included" : "Not included"}</small>
              </div>
              <button
                className={course.linked ? "danger" : "primary"}
                type="button"
                disabled={busy}
                onClick={() => void mutate(
                  course.linked
                    ? `/bundles/${bundleId}/courses/${course.id}`
                    : `/bundles/${bundleId}/courses`,
                  course.linked ? "DELETE" : "POST",
                  course.linked ? undefined : { resource_id: course.id },
                  course.linked ? "Course removed" : "Course added",
                )}
              >
                {course.linked ? <><FiTrash2 /> Remove</> : <><FiPlus /> Add</>}
              </button>
            </header>
            {course.linked && <div className="bundle-week-composer">
              {course.weeks.map((week) =>
                <button
                  type="button"
                  key={week.id}
                  className={week.linked ? "selected" : ""}
                  disabled={busy}
                  onClick={() => void mutate(
                    week.linked
                      ? `/bundles/${bundleId}/weeks/${week.id}`
                      : `/bundles/${bundleId}/weeks`,
                    week.linked ? "DELETE" : "POST",
                    week.linked ? undefined : { resource_id: week.id },
                    week.linked ? "Week removed" : "Week added",
                  )}
                >
                  <span>{week.linked ? <FiCheck /> : <FiPlus />}</span>
                  Week {week.weekNumber}{week.title ? ` · ${week.title}` : ""}
                </button>,
              )}
            </div>}
          </article>,
        ) : <EmptyState title="No courses available" description="No active courses are assigned to you." />}
      </div>
    </Panel>

    <Panel title="Past assessments">
      <div className="bundle-manage-list">
        {data.tests.map((test) =>
          <article key={test.id}>
            <span><FiBookOpen /> <b>{test.title}</b> <small>{test.testType}</small></span>
            <button
              className={test.linked ? "danger" : "primary"}
              type="button"
              disabled={busy}
              onClick={() => void mutate(
                test.linked
                  ? `/bundles/${bundleId}/tests/${test.id}`
                  : `/bundles/${bundleId}/tests`,
                test.linked ? "DELETE" : "POST",
                test.linked ? undefined : { resource_id: test.id },
                test.linked ? "Assessment removed" : "Assessment added",
              )}
            >
              {test.linked ? <><FiTrash2 /> Remove</> : <><FiPlus /> Add</>}
            </button>
          </article>,
        )}
      </div>
    </Panel>

    <Panel title="Teaching team">
      <div className="bundle-manage-list">
        {data.instructors.assigned.map((person) =>
          <article key={person.id}>
            <span><FiUsers /> <b>{person.fullName}</b> <small>{person.email}</small></span>
            <button
              className="danger"
              type="button"
              disabled={busy}
              onClick={() => void mutate(
                `/bundles/${bundleId}/instructors/${person.id}`,
                "DELETE",
                undefined,
                "Instructor removed",
              )}
            >
              <FiTrash2 /> Remove
            </button>
          </article>,
        )}
      </div>
      {data.instructors.available.length > 0 && <form
        className="bundle-assignment-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!instructorId) return;
          void mutate(
            `/bundles/${bundleId}/instructors`,
            "POST",
            { instructor_id: instructorId },
            "Instructor added",
          );
        }}
      >
        <select value={instructorId} onChange={(event) => setInstructorId(event.target.value)} required>
          <option value="">Choose instructor</option>
          {data.instructors.available.map((person) =>
            <option key={person.id} value={person.id}>{person.fullName}</option>,
          )}
        </select>
        <button className="pp-button secondary" disabled={busy || !instructorId}>
          <FiPlus /> Add
        </button>
      </form>}
    </Panel>

    <Panel title="Publishing">
      <div className="bundle-publication-row">
        <span>
          <b>{data.bundle.status === "PUBLISHED" ? "Published" : "Draft"}</b>
          <small>{data.bundle.status === "PUBLISHED"
            ? "Students can see this bundle."
            : "Students cannot see it until you publish."}</small>
        </span>
        <button
          className="pp-button"
          type="button"
          disabled={busy}
          onClick={() => void mutate(
            `/bundles/${bundleId}/status`,
            "PUT",
            { status: data.bundle.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" },
            data.bundle.status === "PUBLISHED" ? "Bundle returned to draft" : "Bundle published",
          )}
        >
          <FiCreditCard /> {data.bundle.status === "PUBLISHED" ? "Unpublish" : "Publish"}
        </button>
      </div>
    </Panel>
  </section>;
}
