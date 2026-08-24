"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FiBookOpen,
  FiCheckCircle,
  FiChevronDown,
  FiClock,
  FiFileText,
  FiLayers,
  FiLock,
  FiPlus,
  FiPlayCircle,
  FiRefreshCw,
  FiSearch,
} from "react-icons/fi";
import { courseRouteKey, lectureRouteKey, weekRouteKey } from "@/lib/routes";
import { useAuth } from "./auth-provider";
import { BundleManagementPanel } from "./bundle-management-panel";
import { EmptyState, ErrorState, PageSkeleton } from "./async-state";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";
import "./bundle-management.css";

type Bundle = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  academicYear: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isFree: boolean;
  priceAmount: string | null;
  priceCurrency: string;
  firstPlanEnabled?: boolean;
  firstPlanPriceMcq?: string | null;
  firstPlanPriceMcqEssay?: string | null;
  finalPlanEnabled?: boolean;
  finalPlanPriceMcq?: string | null;
  finalPlanPriceMcqEssay?: string | null;
  read_only?: boolean;
  accessible?: boolean;
  payment_required?: boolean;
  access_status?: string;
  paymentStatus?: string;
};
type Lecture = {
  id: string;
  title: string;
  lectureNumber: number;
  question_count: number;
  mcq_count: number;
  flashcard_deck_count: number;
  resource_count: number;
};

type Week = { id: string; weekNumber: number; title: string | null; lectures: Lecture[] };
type Course = {
  id: string;
  courseCode: string;
  courseName: string;
  semester?: { semesterNumber: number; title?: string | null } | null;
  weeks: Week[];
};
type Exam = { id: string; title: string; durationMinutes: number | null };
type Content = {
  bundle: Bundle;
  courses: Course[];
  past_exams: Exam[];
  totals: { courses: number; weeks: number; lectures: number; questions: number; flashcard_decks: number; resources: number; past_exams: number };
};
type Tab = "overview" | "curriculum" | "questions" | "exams" | "flashcards" | "resources";

const tabs: Tab[] = ["overview", "curriculum", "questions", "exams", "flashcards", "resources"];
function validTab(value: string | null): Tab {
  return tabs.includes(value as Tab) ? value as Tab : "overview";
}

function bundleBadge(bundle: Bundle, visited: Set<string>) {
  if (bundle.payment_required || bundle.access_status === "PENDING_PAYMENT") return { label: "Payment required", className: "read-only" };
  if (bundle.read_only) return { label: "Read-only", className: "read-only" };
  if (bundle.access_status === "PARTIAL") return { label: "Partial access", className: "progress" };
  if (bundle.status === "ARCHIVED") return { label: "Archived", className: "archived" };
  if (bundle.status === "DRAFT") return { label: "Draft", className: "draft" };
  if (!visited.has(bundle.id)) return { label: "New", className: "new" };
  return { label: "In progress", className: "progress" };
}

function guideHref(course: Course, lecture: Lecture) {
  return `/guidelines?course=${encodeURIComponent(courseRouteKey(course))}&lecture=${encodeURIComponent(lectureRouteKey(lecture))}`;
}

export function AdvancedBundlesPage() {
  const { user, request } = useAuth();
  const { notify, startNavigation } = useUx();
  const manager = user?.role !== "STUDENT";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedBundle = searchParams.get("bundle") || searchParams.get("id");
  const requestedTab = validTab(searchParams.get("tab"));
  const requestedWeek = searchParams.get("week");
  const stageValue = Number(searchParams.get("stage"));
  const requestedStage = Number.isInteger(stageValue) && stageValue >= 1 && stageValue <= 4 ? stageValue : null;
  const semesterValue = Number(searchParams.get("semester"));
  const requestedSemester = Number.isInteger(semesterValue) && semesterValue >= 1 && semesterValue <= 12 ? semesterValue : null;
  const [tab, setTab] = useState<Tab>(requestedTab);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [catalog, setCatalog] = useState<Bundle[]>([]);
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);
  const [selected, setSelected] = useState<Content | null>(null);
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set());
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createAccess, setCreateAccess] = useState<"FREE" | "PAID">("FREE");
  const [catalogOpenId, setCatalogOpenId] = useState<string | null>(null);
  const [joining, setJoining] = useState<Set<string>>(new Set());

  const matchesStage = useCallback((bundle: Bundle) => {
    if (!requestedStage) return true;
    return requestedStage === 4 ? bundle.academicYear >= 4 : bundle.academicYear === requestedStage;
  }, [requestedStage]);

  const setUrl = useCallback((bundleRef: string | null, nextTab: Tab, week: string | null = null, replace = false) => {
    const params = new URLSearchParams(searchParams.toString());
    const targetBundle = bundleRef
      ? bundles.find((item) => item.id === bundleRef || item.slug === bundleRef)
        || (selectedBundle && (selectedBundle.id === bundleRef || selectedBundle.slug === bundleRef) ? selectedBundle : null)
      : null;
    if (bundleRef) params.set("bundle", targetBundle?.slug || bundleRef);
    else params.delete("bundle");
    params.delete("id");
    params.set("tab", nextTab);
    if (week) params.set("week", week);
    else params.delete("week");
    const href = `${pathname}?${params.toString()}`;
    startNavigation();
    if (replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }, [bundles, pathname, router, searchParams, selectedBundle, startNavigation]);

  useEffect(() => {
    try {
      const rows = JSON.parse(localStorage.getItem(`mdp:visited-bundles:${user?.id || "anonymous"}`) || "[]") as string[];
      setVisited(new Set(Array.isArray(rows) ? rows : []));
    } catch {
      setVisited(new Set());
    }
  }, [user?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const owned = await request<Bundle[]>(manager ? "/bundles/managed" : "/bundles/mine");
      const scopedOwned = owned.filter(matchesStage);
      setBundles(scopedOwned);
      if (!manager) {
        const publicItems = await request<Bundle[]>("/catalog/bundles");
        setCatalog(publicItems.filter(matchesStage).filter((item) => !owned.some((ownedItem) => ownedItem.id === item.id)));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load bundles.");
    } finally {
      setLoading(false);
    }
  }, [manager, matchesStage, request]);

  const refreshSelectedContent = useCallback(async (bundleId: string) => {
    try {
      const content = await request<Content>(`/bundles/${bundleId}/content`);
      setSelected(content);
      setSelectedBundle(content.bundle);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh bundle content.");
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (loading) return;
    if (!bundles.length) {
      setSelected(null);
      setSelectedBundle(null);
      return;
    }
    let stored: string | null = null;
    try { stored = localStorage.getItem(`mdp:last-bundle:${user?.id || "anonymous"}`); } catch { /* best-effort */ }
    const target = bundles.find((item) => item.id === requestedBundle || item.slug === requestedBundle)
      || bundles.find((item) => item.id === stored || item.slug === stored)
      || bundles[0];
    if (!requestedBundle || requestedBundle !== target.slug || searchParams.has("id")) {
      setUrl(target.id, requestedTab, requestedWeek, true);
    }
    setSelectedBundle(target);
    if (!manager && target.accessible === false) {
      setSelected(null);
      setBundleLoading(false);
      try { localStorage.setItem(`mdp:last-bundle:${user?.id || "anonymous"}`, target.slug); } catch { /* best-effort */ }
      return;
    }
    if (selected?.bundle.id === target.id) return;
    let active = true;
    setBundleLoading(true);
    setError(null);
    void request<Content>(`/bundles/${target.id}/content`)
      .then((content) => {
        if (!active) return;
        setSelected(content);
        setSelectedBundle(content.bundle);
        const allWeeks = content.courses.flatMap((course) => course.weeks);
        const requestedWeekRecord = requestedWeek
          ? allWeeks.find((week) => week.id === requestedWeek || weekRouteKey(week) === requestedWeek)
          : null;
        setOpenWeeks(new Set(requestedWeekRecord ? [requestedWeekRecord.id] : allWeeks.slice(0, 1).map((week) => week.id)));
        if (requestedWeekRecord && requestedWeek !== weekRouteKey(requestedWeekRecord)) {
          setUrl(target.id, requestedTab, weekRouteKey(requestedWeekRecord), true);
        }
        setVisited((current) => {
          const next = new Set(current).add(target.id);
          try { localStorage.setItem(`mdp:visited-bundles:${user?.id || "anonymous"}`, JSON.stringify([...next])); } catch { /* best-effort */ }
          return next;
        });
        try { localStorage.setItem(`mdp:last-bundle:${user?.id || "anonymous"}`, target.slug); } catch { /* best-effort */ }
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to open bundle."); })
      .finally(() => { if (active) setBundleLoading(false); });
    return () => { active = false; };
  }, [bundles, loading, manager, requestedBundle, requestedTab, requestedWeek, request, searchParams, selected?.bundle.id, setUrl, user?.id]);

  useEffect(() => { setTab(requestedTab); }, [requestedTab]);

  function open(bundle: Bundle) {
    let remembered: Tab = "overview";
    try { remembered = validTab(localStorage.getItem(`mdp:bundle-tab:${bundle.id}`)); } catch { /* best-effort */ }
    setSelectedBundle(bundle);
    setSelected(null);
    setUrl(bundle.id, remembered);
  }

  function changeTab(value: Tab) {
    setTab(value);
    try { if (selectedBundle) localStorage.setItem(`mdp:bundle-tab:${selectedBundle.id}`, value); } catch { /* best-effort */ }
    setUrl(selectedBundle?.id || requestedBundle, value);
  }

  async function enroll(bundle: Bundle) {
    if (joining.has(bundle.id)) return;
    setJoining((current) => new Set(current).add(bundle.id));
    try {
      const enrollment = await request<Bundle>(`/bundles/${bundle.id}/enroll`, { method: "POST" });
      notify({
        title: bundle.isFree ? "Bundle joined" : "Enrollment created — payment required",
        description: bundle.isFree
          ? `${bundle.title} is now available in My Bundles.`
          : `${bundle.title} stays locked until payment is verified and confirmed.`,
        tone: bundle.isFree ? "success" : "info",
      });
      await load();
      setSelectedBundle(enrollment);
      setUrl(bundle.id, "overview");
    } catch (cause) {
      notify({ title: "Unable to join bundle", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setJoining((current) => {
        const next = new Set(current);
        next.delete(bundle.id);
        return next;
      });
    }
  }


  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const paid = createAccess === "PAID";
    const price = Number(data.get("price"));
    if (paid && (!Number.isFinite(price) || price <= 0)) {
      notify({ title: "Price required", description: "Paid bundles need a price greater than zero.", tone: "error" });
      return;
    }
    setCreating(true);
    try {
      const created = await request<Bundle>("/bundles", {
        method: "POST",
        body: {
          title: String(data.get("title")),
          slug: String(data.get("slug")),
          description: String(data.get("description") || ""),
          academic_year: Number(data.get("year")),
          access_mode: "PUBLIC",
          is_free: !paid,
          price_amount: paid ? price : undefined,
          price_currency: paid ? String(data.get("currency") || "EGP").toUpperCase() : "EGP",
          available_until: data.get("expiry") ? new Date(String(data.get("expiry"))).toISOString() : undefined,
        },
      });
      form.reset();
      setCreateAccess("FREE");
      notify({ title: "Draft bundle created", description: created.title, tone: "success" });
      await load();
      setUrl(created.id, "overview");
    } catch (cause) {
      notify({ title: "Unable to create bundle", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setCreating(false);
    }
  }

  const scopedCourses = useMemo(() => {
    const courses = selected?.courses || [];
    if (requestedSemester === null) return courses;
    return courses.filter((course) => course.semester?.semesterNumber === requestedSemester);
  }, [requestedSemester, selected]);
  const lectures = useMemo(() => scopedCourses.flatMap((course) => course.weeks.flatMap((week) => week.lectures.map((lecture) => ({ course, week, lecture })))), [scopedCourses]);
  const needle = query.trim().toLowerCase();
  const visibleCourses = useMemo(() => {
    if (!needle) return scopedCourses;
    return scopedCourses.map((course) => ({
      ...course,
      weeks: course.weeks.map((week) => ({ ...week, lectures: week.lectures.filter((lecture) => `${course.courseName} ${week.title || ""} ${lecture.title}`.toLowerCase().includes(needle)) })).filter((week) => week.lectures.length),
    })).filter((course) => course.weeks.length);
  }, [needle, scopedCourses]);
  const tabCounts = selected ? { overview: null, curriculum: selected.totals.weeks, questions: selected.totals.questions, exams: selected.totals.past_exams, flashcards: selected.totals.flashcard_decks, resources: selected.totals.resources } satisfies Record<Tab, number | null> : null;

  const scopeDescription = requestedSemester !== null
    ? `Showing Semester ${requestedSemester} inside academic stage ${requestedStage ?? selectedBundle?.academicYear ?? ""}.`
    : requestedStage
      ? `Showing your academic stage ${requestedStage === 4 ? "4+" : requestedStage} learning access.`
      : "Open enrolled curriculum, questions, exams, flashcards, and resources without losing context.";

  return <ProductShell search="Search bundles, courses, weeks, or lectures"><main className="pp-page bundle-page advanced-bundle-page">
    <div className="pp-title hero"><div><small className="page-eyebrow">{manager ? "BUNDLE MANAGEMENT" : "YOUR LEARNING ACCESS"}</small><h1>{manager ? "Bundles" : "My Bundles"}</h1><p>{manager ? "Compose courses and weeks, attach assessments, assign people, and control free or paid access from one workspace." : scopeDescription}</p></div><button className="pp-button secondary" onClick={() => void load()}><FiRefreshCw /> Refresh</button></div>
    {error && <ErrorState description={error} onRetry={() => void load()} />}

    {manager && <Panel title="Create bundle" className="bundle-create"><form onSubmit={create}><label>Title<input name="title" minLength={3} required /></label><label>Slug<input name="slug" minLength={3} required /></label><label>Semester<select name="year" defaultValue="1">{[1, 2, 3, 4, 5, 6].map((semester) => <option key={semester} value={semester}>Semester {semester}</option>)}</select></label><label>Description<input name="description" /></label><label>Access<select aria-label="Bundle access type" value={createAccess} onChange={(event) => setCreateAccess(event.target.value as "FREE" | "PAID")}><option value="FREE">FREE</option><option value="PAID">PAID</option></select></label>{createAccess === "PAID" && <><label>Price<input aria-label="Price" name="price" type="number" min="0.01" step="0.01" required /></label><label>Currency<input aria-label="Currency" name="currency" defaultValue="EGP" minLength={3} maxLength={3} required /></label></>}<label>Bundle expiry<input aria-label="Bundle expiry" name="expiry" type="datetime-local" /></label><button className="pp-button" disabled={creating}><FiPlus /> {creating ? "Creating…" : "Create draft"}</button></form></Panel>}

    {loading ? <PageSkeleton variant="workspace" label="Loading bundles" /> : !bundles.length ? <EmptyState title={manager ? "No managed bundles" : requestedStage ? "No enrolled bundles for this academic stage" : "No enrolled bundles"} description={manager ? "Create a draft bundle to begin composing curriculum." : requestedStage ? "Join a published bundle for this stage from the catalog below, or return to your dashboard." : "Join a published bundle from the catalog below."} /> : <div className="bundle-workspace">
      <aside className="bundle-list" aria-label={manager ? "Managed bundles" : "Your bundles"}><h2>{manager ? "Managed bundles" : "My bundles"}</h2>{bundles.map((bundle) => {
        const badge = bundleBadge(bundle, visited);
        return <button className={selectedBundle?.id === bundle.id ? "active" : ""} key={bundle.id} onClick={() => open(bundle)}><span><FiLayers /></span><b>{bundle.title}<small>Year {bundle.academicYear} · {bundle.isFree ? "FREE" : `${bundle.priceCurrency} ${Number(bundle.priceAmount || 0).toFixed(2)}`}</small></b><em className={`bundle-status-badge ${badge.className}`}>{badge.label}</em></button>;
      })}</aside>

      <section className={`bundle-content ${bundleLoading ? "is-loading" : ""}`} aria-busy={bundleLoading}>
        {!manager && selectedBundle?.accessible === false ? <PaymentLockedBundle bundle={selectedBundle} busy={joining.has(selectedBundle.id)} onSubscribe={() => void enroll(selectedBundle)} /> : selected ? <>
          <div className="bundle-hero"><div><small>ACADEMIC YEAR {selected.bundle.academicYear} · {selected.bundle.isFree ? "FREE" : `${selected.bundle.priceCurrency} ${Number(selected.bundle.priceAmount || 0).toFixed(2)}`}</small><h1>{selected.bundle.title}</h1><p>{selected.bundle.description || "No description has been added yet."}</p></div><span className={selected.bundle.read_only ? "expired" : "active"}>{selected.bundle.read_only ? <><FiLock /> Read-only</> : <><FiCheckCircle /> Active access</>}</span></div>
          {manager && <BundleManagementPanel bundleId={selected.bundle.id} onChanged={async () => { await load(); await refreshSelectedContent(selected.bundle.id); }} />}
          {selected.bundle.read_only && <section className="bundle-read-only-reason"><FiLock /><div><b>Browsing remains available</b><p>This enrollment is read-only. You can inspect curriculum and resources, but actions that submit or modify learning work are disabled by the server.</p></div></section>}
          <nav className="bundle-tabs" aria-label="Bundle sections">{tabs.map((value) => {
            const count = tabCounts?.[value];
            return <button key={value} className={tab === value ? "active" : ""} aria-current={tab === value ? "page" : undefined} onClick={() => changeTab(value)}>{value === "questions" ? "Question Bank" : value === "exams" ? "Past Exams" : value[0].toUpperCase() + value.slice(1)}{count !== null && count !== undefined ? <small>{count}</small> : null}</button>;
          })}</nav>
          <div className="bundle-content-search"><FiSearch /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter courses, weeks, or lectures" /></div>
          {bundleLoading && <div className="bundle-content-overlay"><PageSkeleton variant="cards" label="Loading selected bundle" /></div>}
          <BundleWorkspaceTab content={selected} tab={tab} courses={visibleCourses} lectures={lectures.filter(({ course, week, lecture }) => !needle || `${course.courseName} ${week.title || ""} ${lecture.title}`.toLowerCase().includes(needle))} openWeeks={openWeeks} setOpenWeeks={setOpenWeeks} setUrl={setUrl} />
        </> : <EmptyState title="Choose a bundle" description="Select a bundle to open its workspace." />}
      </section>
    </div>}

    {!manager && catalog.length > 0 && <section className="bundle-catalog">
      <div className="pp-title">
        <div>
          <h2>Available to you</h2>
          <p>Join free bundles immediately or subscribe to unlock paid bundles.</p>
        </div>
      </div>
      <div>
        {catalog.map((bundle) => {
          const paid = !bundle.isFree;
          const expanded = catalogOpenId === bundle.id;
          const formattedPrice = `${bundle.priceCurrency} ${Number(bundle.priceAmount || 0).toFixed(2)}`;
          return <Panel key={bundle.id} title={bundle.title} className={paid ? "bundle-catalog-locked" : ""}>
            <small>{paid ? <><FiLock /> PAID · {formattedPrice}</> : "FREE"}</small>
            <p>{bundle.description || "Published learning bundle"}</p>
            {!paid ? <button
              className="pp-button"
              disabled={joining.has(bundle.id)}
              onClick={() => void enroll(bundle)}
            >
              {joining.has(bundle.id) ? "Joining…" : "Join free bundle"}
            </button> : <>
              <button
                className="pp-button secondary"
                type="button"
                aria-expanded={expanded}
                onClick={() => setCatalogOpenId(expanded ? null : bundle.id)}
              >
                <FiLock /> {expanded ? "Close" : "View subscription"}
              </button>
              {expanded && <div className="bundle-read-only-reason">
                <FiLock />
                <div>
                  <b>This bundle is locked until you subscribe in it</b>
                  <p>Subscribe to unlock its curriculum, question bank, assessments, flashcards, and resources.</p>
                  <button
                    className="pp-button"
                    type="button"
                    disabled={joining.has(bundle.id)}
                    onClick={() => void enroll(bundle)}
                  >
                    {joining.has(bundle.id) ? "Subscribing…" : `Subscribe for ${formattedPrice}`}
                  </button>
                </div>
              </div>}
            </>}
          </Panel>;
        })}
      </div>
    </section>}
  </main></ProductShell>;
}

function BundleQuestionBank({ content, courses }: { content: Content; courses: Course[] }) {
  const { request } = useAuth();
  const { notify, startNavigation } = useUx();
  const router = useRouter();
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [startingMode, setStartingMode] = useState<"TUTOR" | "TIMED" | null>(null);
  const required = 40;

  useEffect(() => {
    setSelectedCourseId("");
    setSelectedIds([]);
  }, [content.bundle.id]);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const selectedLectures = selectedCourse?.weeks.flatMap((week) => week.lectures).filter((lecture) => selectedIds.includes(lecture.id)) || [];
  const pool = selectedLectures.reduce((sum, lecture) => sum + Number(lecture.mcq_count || 0), 0);
  const ready = selectedIds.length > 0 && pool >= required && !content.bundle.read_only;

  function toggleLecture(course: Course, lecture: Lecture) {
    if (selectedCourseId && selectedCourseId !== course.id) {
      setSelectedCourseId(course.id);
      setSelectedIds([lecture.id]);
      return;
    }
    setSelectedCourseId(course.id);
    setSelectedIds((current) => current.includes(lecture.id)
      ? current.filter((id) => id !== lecture.id)
      : [...current, lecture.id]);
  }

  function toggleWeek(course: Course, week: Week) {
    const eligible = week.lectures.filter((lecture) => Number(lecture.mcq_count || 0) > 0).map((lecture) => lecture.id);
    if (selectedCourseId && selectedCourseId !== course.id) {
      setSelectedCourseId(course.id);
      setSelectedIds(eligible);
      return;
    }
    setSelectedCourseId(course.id);
    setSelectedIds((current) => eligible.every((id) => current.includes(id))
      ? current.filter((id) => !eligible.includes(id))
      : [...new Set([...current, ...eligible])]);
  }

  async function start(mode: "TUTOR" | "TIMED") {
    if (!ready || startingMode) return;
    setStartingMode(mode);
    try {
      const generated = await request<{ test: { id: string }; attempt: { id: string } }>("/tests/practice/generate", {
        method: "POST",
        body: {
          bundle_id: content.bundle.id,
          lecture_ids: selectedIds,
          question_count: required,
          test_mode: mode,
          ...(mode === "TIMED" ? { duration_minutes: 40 } : {}),
        },
      });
      const attemptId = generated?.attempt?.id;
      const testId = generated?.test?.id;
      if (!attemptId || !testId) throw new Error("Quiz was generated without a valid session reference");
      const href = `/mock-exam/session?attempt=${encodeURIComponent(attemptId)}&test=${encodeURIComponent(testId)}&mode=${mode}&source=question-bank&bundle=${encodeURIComponent(content.bundle.id)}&lectures=${encodeURIComponent(selectedIds.join(","))}`;
      try {
        sessionStorage.setItem("mdp:active-assessment-session", JSON.stringify({ attemptId, testId, source: "question-bank" }));
      } catch { /* best-effort session recovery */ }
      startNavigation();
      router.push(href);
      window.setTimeout(() => {
        if (window.location.pathname !== "/mock-exam/session") window.location.assign(href);
      }, 800);
    } catch (cause) {
      notify({
        title: "Could not build quiz",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
      setStartingMode(null);
    }
  }

  if (!courses.length) return <EmptyState title="No curriculum available" description="This bundle has no accessible courses or lectures." />;

  return <section className="bundle-question-builder">
    <Panel title="Build a 40-MCQ quiz">
      <div className="question-builder-intro">
        <div><FiFileText /><span><b>Select lectures from the curriculum</b><small>Forty unique MCQs are randomly sampled from the selected lectures.</small></span></div>
        <strong className={ready ? "ready" : ""}>{pool} / {required} eligible MCQs</strong>
      </div>
      <div className="question-curriculum">
        {courses.map((course) => {
          const courseSelected = selectedCourseId === course.id;
          return <section className={`question-course ${courseSelected ? "selected" : ""}`} key={course.id}>
            <header><b>{course.courseCode} · {course.courseName}</b><small>Choose lectures from one course per quiz</small></header>
            {course.weeks.map((week) => {
              const eligible = week.lectures.filter((lecture) => Number(lecture.mcq_count || 0) > 0);
              const allSelected = eligible.length > 0 && courseSelected && eligible.every((lecture) => selectedIds.includes(lecture.id));
              return <fieldset key={week.id}>
                <legend>
                  <label>
                    <input type="checkbox" checked={allSelected} disabled={!eligible.length} onChange={() => toggleWeek(course, week)} />
                    <span><b>Week {week.weekNumber}: {week.title || "Untitled week"}</b><small>{eligible.reduce((sum, lecture) => sum + Number(lecture.mcq_count || 0), 0)} eligible MCQs</small></span>
                  </label>
                </legend>
                <div>
                  {week.lectures.map((lecture) => {
                    const count = Number(lecture.mcq_count || 0);
                    const checked = courseSelected && selectedIds.includes(lecture.id);
                    return <label className={checked ? "checked" : ""} key={lecture.id}>
                      <input type="checkbox" checked={checked} disabled={count <= 0} onChange={() => toggleLecture(course, lecture)} />
                      <FiBookOpen />
                      <span><b>{lecture.lectureNumber}. {lecture.title}</b><small>{count > 0 ? `${count} eligible MCQs` : "No published question-bank MCQs"}</small></span>
                    </label>;
                  })}
                </div>
              </fieldset>;
            })}
          </section>;
        })}
      </div>
      <div className={`question-quiz-launch ${ready ? "ready" : ""}`}>
        <div>
          <b>{ready ? "Your random 40-question quiz is ready" : `Select lectures containing ${Math.max(0, required - pool)} more MCQs`}</b>
          <small>{selectedIds.length} lecture{selectedIds.length === 1 ? "" : "s"} selected. Questions will not be duplicated.</small>
        </div>
        <span>
          <button className="pp-button secondary" type="button" disabled={!ready || Boolean(startingMode)} onClick={() => void start("TUTOR")}><FiPlayCircle />{startingMode === "TUTOR" ? "Building…" : "Start Tutor"}</button>
          <button className="pp-button" type="button" disabled={!ready || Boolean(startingMode)} onClick={() => void start("TIMED")}><FiClock />{startingMode === "TIMED" ? "Building…" : "Start Timed · 40 min"}</button>
        </span>
      </div>
    </Panel>
  </section>;
}

function PaymentLockedBundle({ bundle, busy, onSubscribe }: {
  bundle: Bundle;
  busy: boolean;
  onSubscribe: () => void;
}) {
  const price = `${bundle.priceCurrency} ${Number(bundle.priceAmount || 0).toFixed(2)}`;
  return <Panel title="Bundle locked">
    <div className="bundle-read-only-reason">
      <FiLock />
      <div>
        <b>This bundle is locked until you subscribe in it</b>
        <p>Subscribe to unlock its curriculum, question bank, assessments, flashcards, and resources.</p>
        <button className="pp-button" type="button" disabled={busy} onClick={onSubscribe}>
          {busy ? "Subscribing…" : `Subscribe for ${price}`}
        </button>
      </div>
    </div>
  </Panel>;
}

function BundleWorkspaceTab({ content, tab, courses, lectures, openWeeks, setOpenWeeks, setUrl }: {
  content: Content;
  tab: Tab;
  courses: Course[];
  lectures: Array<{ course: Course; week: Week; lecture: Lecture }>;
  openWeeks: Set<string>;
  setOpenWeeks: React.Dispatch<React.SetStateAction<Set<string>>>;
  setUrl: (bundleId: string | null, tab: Tab, week?: string | null, replace?: boolean) => void;
}) {
  if (tab === "overview") return <><section className="bundle-summary-grid">{Object.entries(content.totals).map(([label, value]) => <Panel key={label}><b>{value}</b><small>{label.replaceAll("_", " ")}</small></Panel>)}</section><Panel title="Continue your curriculum">{lectures.slice(0, 5).map(({ course, week, lecture }) => <Link className="bundle-row" key={lecture.id} href={guideHref(course, lecture)}><FiBookOpen /><span><b>{lecture.title}</b><small>Week {week.weekNumber} · {lecture.question_count} questions · {lecture.flashcard_deck_count} decks</small></span></Link>)}</Panel></>;

  if (tab === "curriculum" && !courses.length) return <EmptyState title="No courses in this semester" description="This bundle does not currently contain courses for the selected semester." />;

  if (tab === "curriculum") return <section className="bundle-accordion-stack"><div className="bundle-expand-actions"><Link className="pp-button secondary" href={`/rounds?bundle=${encodeURIComponent(content.bundle.id)}`}>Select lectures for 40-MCQ quiz</Link><button type="button" onClick={() => setOpenWeeks(new Set(courses.flatMap((course) => course.weeks.map((week) => week.id))))}>Expand all</button><button type="button" onClick={() => setOpenWeeks(new Set())}>Collapse all</button></div>{courses.map((course) => <Panel key={course.id} title={`${course.courseCode} · ${course.courseName}`} className="bundle-course">{course.weeks.map((week) => {
    const questions = week.lectures.reduce((sum, lecture) => sum + lecture.question_count, 0);
    const decks = week.lectures.reduce((sum, lecture) => sum + lecture.flashcard_deck_count, 0);
    const resources = week.lectures.reduce((sum, lecture) => sum + lecture.resource_count, 0);
    const open = openWeeks.has(week.id);
    return <section className={`advanced-bundle-week ${open ? "open" : ""}`} key={week.id}><button type="button" onClick={() => {
      setOpenWeeks((current) => {
        const next = new Set(current);
        if (next.has(week.id)) next.delete(week.id);
        else next.add(week.id);
        return next;
      });
      setUrl(content.bundle.id, "curriculum", weekRouteKey(week), true);
    }}><span><b>Week {week.weekNumber}: {week.title || "Untitled week"}</b><small>{questions} questions · {decks} decks · {resources} resources</small></span><small>{week.lectures.length} lectures</small><FiChevronDown /></button>{open && <div>{week.lectures.map((lecture) => <Link href={guideHref(course, lecture)} key={lecture.id}><FiBookOpen /><span><b>{lecture.lectureNumber}. {lecture.title}</b><small>{lecture.question_count} questions · {lecture.flashcard_deck_count} decks · {lecture.resource_count} resources</small></span></Link>)}</div>}</section>;
  })}</Panel>)}</section>;

  if (tab === "questions") return <BundleQuestionBank content={content} courses={courses} />;

  if (tab === "exams") return <Panel title="Bundle Past Exams">{content.past_exams.length ? content.past_exams.map((exam) => <Link className="bundle-row" href={`/past-exams?bundle=${encodeURIComponent(content.bundle.id)}&test=${encodeURIComponent(exam.id)}`} key={exam.id}><FiClock /><span><b>{exam.title}</b><small>{exam.durationMinutes ? `${exam.durationMinutes} minute instructor timer · choose Tutor or Timed` : "Tutor mode available · no timed duration configured"}</small></span><strong>Open →</strong></Link>) : <EmptyState title="No past exams" description="No past exams are assigned to this bundle." />}</Panel>;

  if (tab === "flashcards") return <Panel title="Bundle Flashcards">{lectures.filter((item) => item.lecture.flashcard_deck_count).map(({ week, lecture }) => <Link className="bundle-row" href={`/flashcards?lecture=${encodeURIComponent(lecture.id)}`} key={lecture.id}><FiLayers /><span><b>{lecture.title}</b><small>Week {week.weekNumber} · open your enrolled review queue</small></span><strong>{lecture.flashcard_deck_count} decks</strong></Link>)}</Panel>;

  return <Panel title="Bundle Resources">{lectures.filter((item) => item.lecture.resource_count).map(({ course, week, lecture }) => <Link className="bundle-row" href={guideHref(course, lecture)} key={lecture.id}><FiBookOpen /><span><b>{lecture.title}</b><small>Week {week.weekNumber}</small></span><strong>{lecture.resource_count} files</strong></Link>)}</Panel>;
}
