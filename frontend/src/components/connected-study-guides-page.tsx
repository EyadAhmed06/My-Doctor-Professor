"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  FiBookOpen,
  FiChevronDown,
  FiDownload,
  FiExternalLink,
  FiFileText,
} from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import "./product-pages.css";

type Course = {
  id: string;
  courseName: string;
  courseCode: string;
};

type Week = {
  id: string;
  weekNumber: number;
  title: string | null;
  lectures?: Lecture[];
};

type Lecture = {
  id: string;
  lectureNumber: number;
  title: string;
  description: string | null;
};

type Resource = {
  id: string;
  resourceName: string;
  resourceType: string;
  uploadStatus: string;
  fileUrl: string;
  description: string | null;
  mimeType: string | null;
};

type Page<T> = { data: T[] };

export function ConnectedStudyGuidesPage() {
  const { request } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selected, setSelected] = useState<Lecture | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [resources, setResources] = useState<Resource[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingGuides, setLoadingGuides] = useState(false);
  const [loadingResources, setLoadingResources] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void request<Page<Course>>("/academic/courses?limit=100")
      .then((result) => {
        if (!active) return;
        const availableCourses = Array.isArray(result?.data) ? result.data : [];
        setCourses(availableCourses);
        setCourseId(availableCourses[0]?.id ?? "");
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Unable to load courses.");
        }
      })
      .finally(() => {
        if (active) setLoadingCourses(false);
      });

    return () => {
      active = false;
    };
  }, [request]);

  useEffect(() => {
    if (!courseId) {
      setWeeks([]);
      setSelected(null);
      return;
    }

    let active = true;
    setLoadingGuides(true);
    setError(null);
    setWeeks([]);
    setSelected(null);
    setResources([]);

    void (async () => {
      try {
        // These two Academic endpoints intentionally return arrays, not paginated objects.
        const weekRows = await request<Week[]>(
          `/academic/courses/${courseId}/weeks`,
        );
        const safeWeeks = Array.isArray(weekRows) ? weekRows : [];

        const hydratedWeeks = await Promise.all(
          safeWeeks.map(async (week) => {
            const lectureRows = await request<Lecture[]>(
              `/academic/weeks/${week.id}/lectures`,
            );
            return {
              ...week,
              lectures: Array.isArray(lectureRows) ? lectureRows : [],
            };
          }),
        );

        if (!active) return;
        const firstLecture = hydratedWeeks
          .flatMap((week) => week.lectures ?? [])[0] ?? null;

        setWeeks(hydratedWeeks);
        setExpandedWeeks(new Set(hydratedWeeks.map((week) => week.id)));
        setSelected(firstLecture);
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Unable to load lecture guides.",
          );
        }
      } finally {
        if (active) setLoadingGuides(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [courseId, request]);

  useEffect(() => {
    if (!selected) {
      setResources([]);
      return;
    }

    let active = true;
    setLoadingResources(true);
    setError(null);

    void request<Resource[]>(`/academic/lectures/${selected.id}/resources`)
      .then((value) => {
        if (active) setResources(Array.isArray(value) ? value : []);
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Unable to load lecture resources.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingResources(false);
      });

    return () => {
      active = false;
    };
  }, [selected, request]);

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.lectures?.some((lecture) => lecture.id === selected?.id)),
    [selected?.id, weeks],
  );

  function toggleWeek(weekId: string) {
    setExpandedWeeks((current) => {
      const next = new Set(current);
      if (next.has(weekId)) next.delete(weekId);
      else next.add(weekId);
      return next;
    });
  }

  return (
    <ProductShell search="Search lecture guides">
      <main className="pp-page study-guides-page">
        <header className="pp-title study-guides-title">
          <div>
            <span className="pp-eyebrow">Bundle curriculum</span>
            <h1>Study Guides</h1>
            <p>Browse the weeks and published lectures included in your bundle.</p>
          </div>
          <label className="study-guide-course-select">
            Course
            <select
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              disabled={loadingCourses}
            >
              {courses.map((course) => (
                <option value={course.id} key={course.id}>
                  {course.courseCode} · {course.courseName}
                </option>
              ))}
            </select>
          </label>
        </header>

        {error && (
          <div className="pp-inline-error" role="alert">
            <strong>We could not load this part of your bundle.</strong>
            <span>{error}</span>
          </div>
        )}

        {loadingCourses ? (
          <div className="product-auth-loading">Loading your courses…</div>
        ) : !courses.length ? (
          <Panel title="No study guides available">
            <p>Your account does not currently have an active course in its bundle.</p>
          </Panel>
        ) : (
          <div className="study-guide-layout">
            <aside className="guide-course-nav" aria-label="Course weeks and lectures">
              <div className="guide-nav-heading">
                <span>Course content</span>
                <small>
                  {weeks.length} {weeks.length === 1 ? "week" : "weeks"}
                </small>
              </div>

              {loadingGuides ? (
                <p className="guide-nav-empty">Loading weeks and lectures…</p>
              ) : weeks.length === 0 ? (
                <p className="guide-nav-empty">
                  No published weeks are available in this course yet.
                </p>
              ) : (
                weeks.map((week) => {
                  const isExpanded = expandedWeeks.has(week.id);
                  const lectures = week.lectures ?? [];
                  return (
                    <section className="guide-week" key={week.id}>
                      <button
                        className="guide-week-toggle"
                        type="button"
                        onClick={() => toggleWeek(week.id)}
                        aria-expanded={isExpanded}
                      >
                        <span>
                          <small>WEEK {week.weekNumber}</small>
                          <strong>{week.title || `Week ${week.weekNumber}`}</strong>
                        </span>
                        <span className="guide-week-count">{lectures.length}</span>
                        <FiChevronDown className={isExpanded ? "expanded" : ""} />
                      </button>

                      {isExpanded && (
                        <div className="guide-lecture-list">
                          {lectures.length ? (
                            lectures.map((lecture) => (
                              <button
                                className={selected?.id === lecture.id ? "active" : ""}
                                type="button"
                                onClick={() => setSelected(lecture)}
                                key={lecture.id}
                              >
                                <span className="guide-lecture-number">
                                  {lecture.lectureNumber}
                                </span>
                                <span>
                                  <strong>{lecture.title}</strong>
                                  <small>
                                    {lecture.description
                                      ? "Guide and resources"
                                      : "Resources"}
                                  </small>
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="guide-nav-empty">
                              No published lectures in this week.
                            </p>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })
              )}
            </aside>

            <article className="guide-content">
              {selected ? (
                <>
                  <section className="guide-hero">
                    <span className="guide-hero-icon">
                      <FiBookOpen />
                    </span>
                    <div>
                      <small>
                        WEEK {selectedWeek?.weekNumber ?? "—"} · LECTURE{" "}
                        {selected.lectureNumber}
                      </small>
                      <h1>{selected.title}</h1>
                      <p>
                        {selected.description ||
                          "The instructor has not published a written lecture description yet."}
                      </p>
                    </div>
                  </section>

                  <section className="guide-resource-section">
                    <div className="guide-section-heading">
                      <div>
                        <span className="pp-eyebrow">Published by your instructor</span>
                        <h2>Lecture resources</h2>
                      </div>
                      <span className="guide-resource-total">
                        {resources.length} {resources.length === 1 ? "resource" : "resources"}
                      </span>
                    </div>

                    {loadingResources ? (
                      <p className="guide-resource-empty">Loading resources…</p>
                    ) : resources.length ? (
                      <div className="guide-resource-grid">
                        {resources.map((resource) => (
                          <article className="guide-resource-card" key={resource.id}>
                            <span className="guide-resource-icon">
                              <FiFileText />
                            </span>
                            <div>
                              <small>
                                {resource.resourceType} · {resource.uploadStatus}
                              </small>
                              <h3>{resource.resourceName}</h3>
                              <p>
                                {resource.description || "No description was provided."}
                              </p>
                            </div>
                            {resource.fileUrl.startsWith("/") ? (
                              <Link className="pp-button secondary" href={resource.fileUrl}>
                                <FiDownload /> Open
                              </Link>
                            ) : (
                              <a
                                className="pp-button secondary"
                                href={resource.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <FiExternalLink /> Open
                              </a>
                            )}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="guide-resource-empty">
                        <FiBookOpen />
                        <strong>No resources published yet</strong>
                        <p>
                          This lecture is available in your bundle, but its instructor has
                          not published a resource for it.
                        </p>
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <div className="guide-resource-empty">
                  <FiBookOpen />
                  <strong>Select a lecture</strong>
                  <p>Choose a published lecture from a week to open its study guide.</p>
                </div>
              )}
            </article>
          </div>
        )}
      </main>
    </ProductShell>
  );
}
