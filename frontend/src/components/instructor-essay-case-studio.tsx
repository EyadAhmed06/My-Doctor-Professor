"use client";

import Link from "next/link";
import { DragEvent, FormEvent, useCallback, useEffect, useState } from "react";
import {
  FiArrowDown,
  FiArrowLeft,
  FiArrowRight,
  FiArrowUp,
  FiEdit3,
  FiMove,
  FiPlus,
  FiUploadCloud,
  FiTrash2,
} from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./pdf-essay-cases.css";
import "./instructor-essay-case-studio.css";
import "./product-pages.css";
import "./role-workspace.css";

type Course = { id: string; courseCode: string; courseName: string };
type Q = { id?: string; prompt: string; model_answer: string };
type CaseDetails = {
  id: string;
  weekId: string;
  weekNumber: number;
  title: string;
  stem: string;
  section: string | null;
  sourceCaseNumber: number | null;
  isPublished: boolean;
  questions: Array<{ id: string; prompt: string; modelAnswer?: string }>;
};
type CaseSummary = {
  id: string;
  weekId: string;
  displayOrder: number;
  title: string;
  stem: string;
  section: string | null;
  isPublished: boolean;
  questions: unknown[];
};
type Week = {
  id: string;
  weekNumber: number;
  title: string | null;
  cases: CaseSummary[];
};
type Curriculum = { course_id?: string; weeks: Week[] };

const empty = {
  id: "",
  week_id: "",
  title: "",
  stem: "",
  section: "",
  is_published: false,
  questions: [{ prompt: "", model_answer: "" }] as Q[],
};

export function InstructorEssayCaseStudio() {
  const { request } = useAuth();
  const { notify } = useUx();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setCurriculum(await request<Curriculum>(`/essay-cases?course_id=${encodeURIComponent(id)}`));
  }, [request]);

  useEffect(() => {
    request<Course[]>("/essay-cases/courses").then((items) => {
      setCourses(items);
      setCourseId(items[0]?.id || "");
    });
  }, [request]);

  useEffect(() => {
    if (courseId) void load(courseId);
  }, [courseId, load]);

  function create(weekId: string) {
    setForm({ ...empty, week_id: weekId, questions: [{ prompt: "", model_answer: "" }] });
    setEditing(true);
  }

  async function edit(id: string) {
    const item = await request<CaseDetails>(`/essay-cases/${id}`);
    setForm({
      id: item.id,
      week_id: item.weekId,
      title: item.title,
      stem: item.stem,
      section: item.section || "",
      is_published: item.isPublished,
      questions: item.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        model_answer: q.modelAnswer || "",
      })),
    });
    setEditing(true);
  }

  function count(value: number) {
    setForm((current) => ({
      ...current,
      questions: Array.from(
        { length: value },
        (_, index) => current.questions[index] || { prompt: "", model_answer: "" },
      ),
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const body = {
        week_id: form.week_id,
        title: form.title.trim(),
        stem: form.stem.trim(),
        section: form.section.trim() || undefined,
        is_published: form.is_published,
        questions: form.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt.trim(),
          model_answer: q.model_answer.trim(),
        })),
      };
      await request(form.id ? `/essay-cases/${form.id}` : "/essay-cases", {
        method: form.id ? "PUT" : "POST",
        body: form.id ? { ...body, week_id: undefined } : body,
      });
      notify({ title: form.id ? "Case updated" : "Case created", tone: "success" });
      setEditing(false);
      await load(courseId);
    } catch (error) {
      notify({
        title: "Could not save case",
        description: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this case and its questions?")) return;
    await request(`/essay-cases/${id}`, { method: "DELETE" });
    await load(courseId);
  }

  async function moveCase(caseId: string, targetWeekId: string, targetIndex: number) {
    if (!curriculum || moving) return;
    const previous = curriculum;
    const weeks = curriculum.weeks.map((week) => ({
      ...week,
      cases: week.cases.filter((item) => item.id !== caseId),
    }));
    const source = curriculum.weeks.flatMap((week) => week.cases).find((item) => item.id === caseId);
    const target = weeks.find((week) => week.id === targetWeekId);
    if (!source || !target) return;

    target.cases.splice(Math.max(0, Math.min(targetIndex, target.cases.length)), 0, {
      ...source,
      weekId: targetWeekId,
    });
    const next: Curriculum = {
      ...curriculum,
      weeks: weeks.map((week) => ({
        ...week,
        cases: week.cases.map((item, index) => ({
          ...item,
          weekId: week.id,
          displayOrder: index + 1,
        })),
      })),
    };
    setCurriculum(next);
    setMoving(true);
    try {
      const result = await request<Curriculum>("/essay-cases/order", {
        method: "PUT",
        body: {
          course_id: courseId,
          items: next.weeks.flatMap((week) =>
            week.cases.map((item, index) => ({
              case_id: item.id,
              week_id: week.id,
              display_order: index + 1,
            })),
          ),
        },
      });
      setCurriculum(result);
    } catch (error) {
      setCurriculum(previous);
      notify({
        title: "Could not move case",
        description: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    } finally {
      setMoving(false);
      setDraggingId(null);
    }
  }

  function drop(event: DragEvent, weekId: string, index: number) {
    event.preventDefault();
    if (draggingId) void moveCase(draggingId, weekId, index);
  }

  return (
    <ProductShell search="Search essay cases">
      <main className="pp-page role-workspace">
        <div className="pp-title hero role-heading">
          <div>
            <small className="page-eyebrow">INSTRUCTOR · ESSAY CASE STUDIO</small>
            <h1>Essay cases</h1>
            <p>
              Create, edit and reorder the case-based curriculum. Drag cases within or between
              weeks, or use the movement buttons.
            </p>
          </div>
          <div className="role-heading-actions">
            <Link
              href="/instructor/questions/import-essay"
              className="pp-button secondary"
            >
              <FiUploadCloud /> Inspect PDF
            </Link>
          </div>
        </div>

        <label className="essay-course-select">
          Course
          <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.courseCode} · {course.courseName}
              </option>
            ))}
          </select>
        </label>

        <div className={`instructor-case-weeks ${moving ? "is-moving" : ""}`}>
          {curriculum?.weeks.map((week, weekIndex) => (
            <Panel
              key={week.id}
              title={`Week ${week.weekNumber}${week.title ? ` · ${week.title}` : ""}`}
            >
              <div className="instructor-case-list">
                {week.cases.map((item, itemIndex) => (
                  <div className="case-position" key={item.id}>
                    <div
                      className="case-drop-zone"
                      aria-hidden="true"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => drop(event, week.id, itemIndex)}
                    />
                    <article
                      draggable={!moving}
                      className={draggingId === item.id ? "is-dragging" : ""}
                      onDragStart={() => setDraggingId(item.id)}
                      onDragEnd={() => setDraggingId(null)}
                    >
                      <FiMove className="case-drag-handle" aria-label="Drag case" />
                      <div className="case-summary">
                        <b>{item.title}</b>
                        <small>
                          {item.questions.length} questions · {item.isPublished ? "Published" : "Draft"}
                        </small>
                      </div>
                      <span className="case-actions">
                        <span className="case-order-buttons">
                          <button
                            type="button"
                            title="Move up"
                            aria-label="Move case up"
                            disabled={moving || itemIndex === 0}
                            onClick={() => void moveCase(item.id, week.id, itemIndex - 1)}
                          >
                            <FiArrowUp />
                          </button>
                          <button
                            type="button"
                            title="Move down"
                            aria-label="Move case down"
                            disabled={moving || itemIndex === week.cases.length - 1}
                            onClick={() => void moveCase(item.id, week.id, itemIndex + 1)}
                          >
                            <FiArrowDown />
                          </button>
                          <button
                            type="button"
                            title="Move to previous week"
                            aria-label="Move case to previous week"
                            disabled={moving || weekIndex === 0}
                            onClick={() => {
                              const target = curriculum.weeks[weekIndex - 1];
                              void moveCase(item.id, target.id, target.cases.length);
                            }}
                          >
                            <FiArrowLeft />
                          </button>
                          <button
                            type="button"
                            title="Move to next week"
                            aria-label="Move case to next week"
                            disabled={moving || weekIndex === curriculum.weeks.length - 1}
                            onClick={() => {
                              const target = curriculum.weeks[weekIndex + 1];
                              void moveCase(item.id, target.id, target.cases.length);
                            }}
                          >
                            <FiArrowRight />
                          </button>
                        </span>
                        <button type="button" onClick={() => void edit(item.id)}>
                          <FiEdit3 /> Edit
                        </button>
                        <button
                          className="danger"
                          type="button"
                          onClick={() => void remove(item.id)}
                        >
                          <FiTrash2 />
                        </button>
                      </span>
                    </article>
                  </div>
                ))}
                <div
                  className="case-drop-zone end"
                  aria-hidden="true"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => drop(event, week.id, week.cases.length)}
                >
                  {draggingId ? "Drop at end of week" : ""}
                </div>
              </div>
              <button
                className="pp-button secondary"
                type="button"
                onClick={() => create(week.id)}
              >
                <FiPlus /> New case in Week {week.weekNumber}
              </button>
            </Panel>
          ))}
        </div>

        {editing && (
          <div className="role-modal-backdrop">
            <section className="role-modal wide">
              <header>
                <h2>{form.id ? "Edit case" : "Create case"}</h2>
                <button onClick={() => setEditing(false)}>×</button>
              </header>
              <form className="role-form" onSubmit={save}>
                <div className="role-form-grid">
                  <label>
                    Title
                    <input
                      required
                      value={form.title}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Section
                    <input
                      value={form.section}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, section: event.target.value }))
                      }
                    />
                  </label>
                  <label className="wide">
                    Case study
                    <textarea
                      required
                      rows={7}
                      value={form.stem}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, stem: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Number of questions
                    <select
                      value={form.questions.length}
                      onChange={(event) => count(Number(event.target.value))}
                    >
                      {Array.from({ length: 20 }, (_, index) => (
                        <option key={index + 1}>{index + 1}</option>
                      ))}
                    </select>
                  </label>
                  <label className="case-publish">
                    <input
                      type="checkbox"
                      checked={form.is_published}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          is_published: event.target.checked,
                        }))
                      }
                    />
                    Published to students
                  </label>
                </div>
                <div className="case-question-editor">
                  {form.questions.map((question, index) => (
                    <Panel key={index} title={`Question ${index + 1}`}>
                      <label>
                        Question
                        <textarea
                          required
                          rows={3}
                          value={question.prompt}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              questions: current.questions.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, prompt: event.target.value }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label>
                        Model answer shown after reveal
                        <textarea
                          required
                          rows={5}
                          value={question.model_answer}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              questions: current.questions.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, model_answer: event.target.value }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </label>
                    </Panel>
                  ))}
                </div>
                <footer>
                  <button
                    className="pp-button secondary"
                    type="button"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                  <button className="pp-button" disabled={saving} type="submit">
                    {saving ? "Saving…" : "Save case"}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}
      </main>
    </ProductShell>
  );
}
