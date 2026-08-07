"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FiArrowLeft,
  FiArrowRight,
  FiBookOpen,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiDownload,
  FiExternalLink,
  FiFileText,
  FiPlay,
  FiSearch,
  FiX,
} from "react-icons/fi";
import { courseRouteKey, lectureRouteKey, resourceRouteKey } from "@/lib/routes";
import { useAuth } from "./auth-provider";
import { EmptyState, ErrorState, PageSkeleton } from "./async-state";
import { Panel, ProductShell, Progress } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";

type Lecture = { id: string; lectureNumber: number; title: string; description: string | null; isPublished?: boolean };
type Week = { id: string; weekNumber: number; title: string | null; lectures: Lecture[] };
type Course = { id: string; courseName: string; courseCode: string; weeks: Week[] };
type Bundle = { id: string; title: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; read_only?: boolean };
type BundleContent = { courses: Course[] };
type Resource = { id: string; resourceName: string; resourceType: string; uploadStatus: string; fileUrl: string; description: string | null; mimeType: string | null };
type LectureProgress = { studentId: string; lectureId: string; isCompleted: boolean; completionPercentage: string; timeSpentMinutes: number; lastAccessedAt: string | null; completedAt: string | null };

type SequenceItem = { lecture: Lecture; week: Week; course: Course };

function resourceKind(resource: Resource) {
  const mime = resource.mimeType?.toLowerCase() || "";
  const url = resource.fileUrl.toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(url)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|webm|mov)(\?|$)/.test(url)) return "video";
  if (mime === "application/pdf" || /\.pdf(\?|$)/.test(url)) return "pdf";
  return "external";
}

function completionKey(userId: string | undefined) {
  return `mdp-resource-completion:${userId || "anonymous"}`;
}

function lastResourceKey(userId: string | undefined) {
  return `mdp-last-resource:${userId || "anonymous"}`;
}

export function AdvancedStudyGuidesPage() {
  const { user, request } = useAuth();
  const { startNavigation, notify } = useUx();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedCourse = searchParams.get("course");
  const requestedLecture = searchParams.get("lecture");
  const requestedResource = searchParams.get("resource");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [selected, setSelected] = useState<Lecture | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [resources, setResources] = useState<Resource[]>([]);
  const [preview, setPreview] = useState<Resource | null>(null);
  const [completedResources, setCompletedResources] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<LectureProgress | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingResources, setLoadingResources] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [openingResource, setOpeningResource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setUrl = useCallback((nextCourseId: string, nextLectureId: string | null, nextResourceId: string | null = null, replace = false) => {
    const params = new URLSearchParams(searchParams.toString());
    const nextCourse = courses.find((item) => item.id === nextCourseId);
    if (nextCourse) params.set("course", courseRouteKey(nextCourse));
    else params.delete("course");

    const nextLecture = nextCourse?.weeks.flatMap((week) => week.lectures).find((item) => item.id === nextLectureId) || null;
    if (nextLecture) params.set("lecture", lectureRouteKey(nextLecture));
    else params.delete("lecture");

    if (nextResourceId) {
      const resourceIndex = resources.findIndex((item) => item.id === nextResourceId);
      if (resourceIndex >= 0) params.set("resource", resourceRouteKey(resources[resourceIndex], resourceIndex));
      else params.delete("resource");
    } else params.delete("resource");

    const queryString = params.toString();
    const href = queryString ? `${pathname}?${queryString}` : pathname;
    startNavigation();
    if (replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }, [courses, pathname, resources, router, searchParams, startNavigation]);

  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(completionKey(user?.id)) || "[]") as string[];
      setCompletedResources(new Set(Array.isArray(value) ? value : []));
    } catch {
      setCompletedResources(new Set());
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const endpoint = user.role === "STUDENT" ? "/bundles/mine" : "/bundles/managed";
        const bundleRows = await request<Bundle[]>(endpoint);
        const visibleBundles = user.role === "STUDENT" ? bundleRows.filter((bundle) => bundle.status === "PUBLISHED") : bundleRows;
        const results = await Promise.allSettled(visibleBundles.map((bundle) => request<BundleContent>(`/bundles/${bundle.id}/content`)));
        const contents = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
        if (!contents.length) {
          const failed = results.find((result) => result.status === "rejected");
          if (failed?.status === "rejected") throw failed.reason;
        }
        const merged = new Map<string, Course>();
        for (const content of contents) {
          for (const course of content.courses) {
            const existing = merged.get(course.id);
            if (!existing) {
              merged.set(course.id, { ...course, weeks: [...course.weeks] });
              continue;
            }
            const weekIds = new Set(existing.weeks.map((week) => week.id));
            existing.weeks.push(...course.weeks.filter((week) => !weekIds.has(week.id)));
          }
        }
        if (active) setCourses([...merged.values()]);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load bundle study guides.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [request, user]);

  useEffect(() => {
    if (!courses.length) return;
    const lectureCourse = requestedLecture ? courses.find((course) => course.weeks.some((week) => week.lectures.some((lecture) => lectureRouteKey(lecture) === requestedLecture || lecture.id === requestedLecture))) : null;
    const target = lectureCourse || courses.find((course) => courseRouteKey(course) === requestedCourse || course.id === requestedCourse) || courses[0];
    const lectures = target.weeks.flatMap((week) => week.lectures);
    const lecture = lectures.find((item) => lectureRouteKey(item) === requestedLecture || item.id === requestedLecture) || lectures[0] || null;
    setCourseId(target.id);
    setSelected(lecture);
    setExpandedWeeks(new Set(target.weeks.map((week) => week.id)));
    const cleanCourse = courseRouteKey(target);
    const cleanLecture = lecture ? lectureRouteKey(lecture) : null;
    if (requestedCourse !== cleanCourse || requestedLecture !== cleanLecture) setUrl(target.id, lecture?.id || null, null, true);
  }, [courses, requestedCourse, requestedLecture, setUrl]);

  const course = useMemo(() => courses.find((item) => item.id === courseId) || null, [courses, courseId]);
  const weeks = useMemo(() => course?.weeks ?? [], [course]);
  const allSequence = useMemo<SequenceItem[]>(() => courses.flatMap((item) => item.weeks.flatMap((week) => week.lectures.map((lecture) => ({ lecture, week, course: item })))), [courses]);
  const lectureSequence = useMemo(() => weeks.flatMap((week) => week.lectures.map((lecture) => ({ lecture, week, course: course! }))), [course, weeks]);
  const sequenceIndex = lectureSequence.findIndex((item) => item.lecture.id === selected?.id);
  const previousLecture = sequenceIndex > 0 ? lectureSequence[sequenceIndex - 1] : null;
  const nextLecture = sequenceIndex >= 0 && sequenceIndex < lectureSequence.length - 1 ? lectureSequence[sequenceIndex + 1] : null;

  useEffect(() => {
    if (!selected) {
      setResources([]);
      setProgress(null);
      setPreview(null);
      return;
    }
    let active = true;
    setLoadingResources(true);
    setError(null);
    void request<Resource[]>(`/academic/lectures/${selected.id}/resources`)
      .then((value) => {
        if (!active) return;
        const rows = Array.isArray(value) ? value : [];
        setResources(rows);
        const target = rows.find((resource, index) => resourceRouteKey(resource, index) === requestedResource || resource.id === requestedResource) || null;
        setPreview(target);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load lecture resources."); })
      .finally(() => { if (active) setLoadingResources(false); });
    if (user?.role === "STUDENT") {
      setLoadingProgress(true);
      void request<LectureProgress>(`/progress/lectures/${selected.id}`)
        .then((value) => { if (active) setProgress(value); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load lecture progress."); })
        .finally(() => { if (active) setLoadingProgress(false); });
    } else setProgress(null);
    return () => { active = false; };
  }, [request, requestedResource, selected, user?.role]);

  useEffect(() => {
    if (!preview || !requestedResource) return;
    const index = resources.findIndex((item) => item.id === preview.id);
    if (index < 0) return;
    const cleanResource = resourceRouteKey(preview, index);
    if (requestedResource !== cleanResource && requestedResource === preview.id) {
      setUrl(courseId, selected?.id || null, preview.id, true);
    }
  }, [courseId, preview, requestedResource, resources, selected?.id, setUrl]);

  const selectedWeek = useMemo(() => weeks.find((week) => week.lectures.some((lecture) => lecture.id === selected?.id)), [selected?.id, weeks]);
  const filteredWeeks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return weeks;
    return weeks.map((week) => ({ ...week, lectures: week.lectures.filter((lecture) => `${lecture.title} ${lecture.description || ""}`.toLowerCase().includes(needle)) })).filter((week) => week.lectures.length);
  }, [query, weeks]);
  const filteredResources = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return resources;
    return resources.filter((resource) => `${resource.resourceName} ${resource.description || ""} ${resource.resourceType}`.toLowerCase().includes(needle));
  }, [query, resources]);
  const lectureResourceCompletion = resources.length ? Math.round(resources.filter((resource) => completedResources.has(resource.id)).length * 100 / resources.length) : 0;

  function chooseCourse(id: string) {
    const next = courses.find((item) => item.id === id);
    if (!next) return;
    const first = next.weeks.flatMap((week) => week.lectures)[0] || null;
    setUrl(id, first?.id || null);
  }

  function chooseLecture(lecture: Lecture, nextCourse = courseId) {
    setUrl(nextCourse, lecture.id);
  }

  function toggleWeek(id: string) {
    setExpandedWeeks((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setAllWeeks(open: boolean) {
    setExpandedWeeks(open ? new Set(weeks.map((week) => week.id)) : new Set());
  }

  function openResource(resource: Resource) {
    setOpeningResource(resource.id);
    setPreview(resource);
    try { localStorage.setItem(lastResourceKey(user?.id), JSON.stringify({ courseId, lectureId: selected?.id, resourceId: resource.id })); } catch { /* best-effort */ }
    setUrl(courseId, selected?.id || null, resource.id);
    window.setTimeout(() => setOpeningResource(null), 350);
  }

  function closePreview() {
    setPreview(null);
    setUrl(courseId, selected?.id || null, null, true);
  }

  function toggleResourceComplete(resource: Resource) {
    setCompletedResources((current) => {
      const next = new Set(current);
      if (next.has(resource.id)) next.delete(resource.id);
      else next.add(resource.id);
      try { localStorage.setItem(completionKey(user?.id), JSON.stringify([...next])); } catch { /* best-effort */ }
      return next;
    });
  }

  function resumeLastResource() {
    try {
      const value = JSON.parse(localStorage.getItem(lastResourceKey(user?.id)) || "null") as { courseId?: string; lectureId?: string; resourceId?: string } | null;
      if (value?.courseId && value.lectureId && value.resourceId) setUrl(value.courseId, value.lectureId, value.resourceId);
      else notify({ title: "No resource to resume", description: "Open a lecture resource first and it will be remembered here.", tone: "info" });
    } catch {
      notify({ title: "No resource to resume", tone: "info" });
    }
  }

  async function updateProgress(value: number) {
    if (!selected || user?.role !== "STUDENT" || savingProgress) return;
    setSavingProgress(true);
    try {
      const updated = await request<LectureProgress>(`/progress/lectures/${selected.id}`, { method: "PUT", body: { completion_percentage: value, ...(value === 100 ? { is_completed: true } : {}) } });
      setProgress(updated);
      notify({ title: value === 100 ? "Lecture completed" : "Progress updated", description: value === 100 ? "Course progress and analytics will reflect this completion." : `${Math.round(Number(updated.completionPercentage))}% complete`, tone: "success", duration: 3000 });
    } catch (cause) {
      notify({ title: "Could not update progress", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setSavingProgress(false);
    }
  }

  const completion = Math.round(Number(progress?.completionPercentage || 0));
  const nextIncomplete = allSequence.find((item) => item.lecture.id !== selected?.id && !completedResources.has(`lecture:${item.lecture.id}`));

  return <ProductShell search="Search lecture guides"><main className="pp-page study-guides-page advanced-guides-page">
    <header className="pp-title study-guides-title"><div><span className="pp-eyebrow">Bundle curriculum</span><h1>Study Guides</h1><p>Search lectures, preview resources, resume work, and track completion inside your enrolled curriculum.</p></div><div className="guide-header-actions"><button className="pp-button secondary" type="button" onClick={resumeLastResource}><FiPlay /> Resume last resource</button><label className="study-guide-course-select">Course<select value={courseId} onChange={(event) => chooseCourse(event.target.value)} disabled={loading}>{courses.map((item) => <option value={item.id} key={item.id}>{item.courseCode} · {item.courseName}</option>)}</select></label></div></header>

    {error && <ErrorState description={error} onRetry={() => globalThis.location.reload()} />}
    {loading ? <PageSkeleton variant="workspace" label="Loading your bundle curriculum" /> : !courses.length ? <EmptyState title="No study guides available" description="Your account does not currently have a published course in an accessible bundle." /> : <>
      <nav className="workspace-breadcrumb" aria-label="Breadcrumb"><Link href="/bundles">Bundles</Link><span>›</span><button type="button" onClick={() => course && chooseCourse(course.id)}>{course?.courseName}</button>{selectedWeek && <><span>›</span><span>Week {selectedWeek.weekNumber}</span></>}{selected && <><span>›</span><span aria-current="page">{selected.title}</span></>}</nav>
      <div className="guide-global-search"><FiSearch /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lectures or resources" />{query && <button type="button" onClick={() => setQuery("")}><FiX /></button>}</div>

      <div className="study-guide-layout">
        <aside className="guide-course-nav" aria-label="Course weeks and lectures">
          <div className="guide-nav-heading"><span>Course content</span><small>{weeks.length} {weeks.length === 1 ? "week" : "weeks"}</small></div>
          <div className="guide-expand-actions"><button type="button" onClick={() => setAllWeeks(true)}>Expand all</button><button type="button" onClick={() => setAllWeeks(false)}>Collapse all</button></div>
          {filteredWeeks.length ? filteredWeeks.map((week) => {
            const open = expandedWeeks.has(week.id);
            return <section className="guide-week" key={week.id}><button className="guide-week-toggle" type="button" onClick={() => toggleWeek(week.id)} aria-expanded={open}><span><small>WEEK {week.weekNumber}</small><strong>{week.title || `Week ${week.weekNumber}`}</strong></span><FiChevronDown className={open ? "expanded" : ""} /></button>{open && <div className="guide-lecture-list">{week.lectures.map((lecture) => <button className={selected?.id === lecture.id ? "active" : ""} type="button" onClick={() => chooseLecture(lecture)} key={lecture.id}><span className="guide-lecture-number">{lecture.lectureNumber}</span><span><strong>{lecture.title}</strong><small>{lecture.description ? "Guide and resources" : "Resources"}</small></span></button>)}</div>}</section>;
          }) : <p className="guide-nav-empty">No lecture matches this search.</p>}
        </aside>

        <article className="guide-content">{selected ? <>
          <section className="guide-hero"><span className="guide-hero-icon"><FiBookOpen /></span><div><small>WEEK {selectedWeek?.weekNumber ?? "—"} · LECTURE {selected.lectureNumber}</small><h1>{selected.title}</h1><p>{selected.description || "The instructor has not published a written lecture description yet."}</p></div></section>

          {user?.role === "STUDENT" && <section className="guide-progress-panel" aria-busy={loadingProgress}><div><span className="pp-eyebrow">Your lecture progress</span><h2>{progress?.isCompleted ? "Completed" : `${completion}% complete`}</h2><Progress value={completion} /><small>{resources.length ? `${lectureResourceCompletion}% of resources marked complete` : "No resource checklist yet"}</small></div>{loadingProgress ? <small>Loading progress…</small> : progress?.isCompleted ? <span className="guide-complete-badge"><FiCheckCircle /> Completed</span> : <div className="guide-progress-actions">{[25, 50, 75, 100].filter((value) => value > completion).map((value) => <button type="button" disabled={savingProgress} onClick={() => void updateProgress(value)} key={value}>{value === 100 ? "Mark complete" : `${value}%`}</button>)}</div>}</section>}

          <section className="guide-resource-section"><div className="guide-section-heading"><div><span className="pp-eyebrow">Published by your instructor</span><h2>Lecture resources</h2></div><span className="guide-resource-total">{filteredResources.length} {filteredResources.length === 1 ? "resource" : "resources"}</span></div>
            {loadingResources ? <PageSkeleton variant="list" label="Loading lecture resources" /> : filteredResources.length ? <div className="guide-resource-grid">{filteredResources.map((resource) => {
              const complete = completedResources.has(resource.id);
              return <article className={`guide-resource-card previewable ${complete ? "completed" : ""}`} key={resource.id}><span className="guide-resource-icon"><FiFileText /></span><div><small>{resource.resourceType} · {resource.uploadStatus}</small><h3>{resource.resourceName}</h3><p>{resource.description || "No description was provided."}</p><span>{resourceKind(resource).toUpperCase()}</span></div><div className="guide-resource-actions"><button className="pp-button secondary" type="button" disabled={openingResource === resource.id} onClick={() => openResource(resource)}>{openingResource === resource.id ? "Opening…" : <><FiBookOpen /> Preview</>}</button><button className={`resource-complete-toggle ${complete ? "active" : ""}`} type="button" onClick={() => toggleResourceComplete(resource)}>{complete ? <FiCheckCircle /> : <FiCheck />} {complete ? "Completed" : "Mark complete"}</button></div></article>;
            })}</div> : <EmptyState title={query ? "No matching resources" : "No resources published yet"} description={query ? "Change the search or open a different lecture." : "This lecture is available, but its instructor has not published a resource for it."} />}
          </section>

          <footer className="guide-sequence-nav"><button className="pp-button secondary" type="button" disabled={!previousLecture} onClick={() => previousLecture && chooseLecture(previousLecture.lecture)}><FiArrowLeft /> Previous lecture</button><span>{sequenceIndex + 1} of {lectureSequence.length}</span>{nextLecture ? <button className="pp-button" type="button" onClick={() => chooseLecture(nextLecture.lecture)}>{`Next: ${nextLecture.lecture.title}`}<FiArrowRight /></button> : nextIncomplete ? <button className="pp-button" type="button" onClick={() => chooseLecture(nextIncomplete.lecture, nextIncomplete.course.id)}>Next incomplete lecture<FiArrowRight /></button> : <button className="pp-button" type="button" disabled>Course complete<FiCheckCircle /></button>}</footer>
        </> : <EmptyState title="Select a lecture" description="Choose a published lecture from a week to open its study guide." />}</article>
      </div>
    </>}

    {preview && <ResourcePreviewDrawer resource={preview} completed={completedResources.has(preview.id)} onToggleComplete={() => toggleResourceComplete(preview)} onClose={closePreview} />}
  </main></ProductShell>;
}

function ResourcePreviewDrawer({ resource, completed, onToggleComplete, onClose }: { resource: Resource; completed: boolean; onToggleComplete: () => void; onClose: () => void }) {
  const kind = resourceKind(resource);
  return <><button className="resource-preview-backdrop" type="button" aria-label="Close resource preview" onClick={onClose} /><aside className="resource-preview-drawer" role="dialog" aria-modal="true" aria-label={`Preview ${resource.resourceName}`}>
    <header><div><small>{resource.resourceType} · {resource.mimeType || "Unknown format"}</small><h2>{resource.resourceName}</h2><p>{resource.description || "No resource description was provided."}</p></div><button type="button" onClick={onClose}><FiX /></button></header>
    <div className={`resource-preview-body ${kind}`}>
      {kind === "image" && <img src={resource.fileUrl} alt={resource.resourceName} />}
      {kind === "video" && <video src={resource.fileUrl} controls preload="metadata" />}
      {kind === "pdf" && <iframe src={resource.fileUrl} title={resource.resourceName} />}
      {kind === "external" && <div className="external-resource-preview"><FiFileText /><h3>Preview unavailable inside the app</h3><p>This file type must be opened with its original viewer.</p></div>}
    </div>
    <footer><button className={`pp-button secondary ${completed ? "active" : ""}`} type="button" onClick={onToggleComplete}>{completed ? <FiCheckCircle /> : <FiCheck />} {completed ? "Completed" : "Mark complete"}</button>{resource.fileUrl.startsWith("/") ? <Link className="pp-button" href={resource.fileUrl}><FiDownload /> Open file</Link> : <a className="pp-button" href={resource.fileUrl} target="_blank" rel="noreferrer"><FiExternalLink /> Open original</a>}</footer>
  </aside></>;
}