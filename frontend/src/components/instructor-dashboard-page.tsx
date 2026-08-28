"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FiActivity, FiBookOpen, FiClipboard, FiEdit3, FiFileText, FiLayers, FiRefreshCw } from "react-icons/fi";
import { PageSkeleton } from "./async-state";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import "./role-workspace.css";

type InstructorDashboard = {
  questions: number;
  tests: number;
  decks: number;
  attempts: number;
  students: number;
  average_score: string;
  pending_essay_answers: number;
};

const links = [
  { title: "Course studio", description: "Structure your courses into weeks, lectures, topics, and resources.", href: "/instructor/courses", Icon: FiBookOpen, tone: "teal" },
  { title: "Question bank", description: "Write MCQs and essays, configure answers, and reuse questions.", href: "/instructor/questions", Icon: FiEdit3, tone: "violet" },
  { title: "Assessment builder", description: "Create tests, add questions, publish, and review attempts.", href: "/instructor/assessments", Icon: FiClipboard, tone: "orange" },
  { title: "Flashcard studio", description: "Build and publish decks linked to courses, topics, or lectures.", href: "/instructor/flashcards", Icon: FiLayers, tone: "violet" },
  { title: "Bundle manager", description: "Package courses, weeks, and tests and control student access.", href: "/bundles", Icon: FiFileText, tone: "teal" },
] as const;

function doctorName(value: string) {
  const clean = value.trim().replace(/^dr\.?\s+/i, "");
  return `Dr. ${clean || "Instructor"}`;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function InstructorDashboardPage() {
  const { user, request } = useAuth();
  const [data, setData] = useState<InstructorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || user.role !== "INSTRUCTOR") return;
    setLoading(true);
    setError(null);
    try {
      setData(await request<InstructorDashboard>("/dashboard/instructor"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load instructor dashboard.");
    } finally {
      setLoading(false);
    }
  }, [request, user]);

  useEffect(() => { void load(); }, [load]);

  if (user && user.role !== "INSTRUCTOR") {
    return <ProductShell><main className="pp-page"><Panel title="Instructor access required"><p>This dashboard is available to instructors.</p></Panel></main></ProductShell>;
  }

  const fullName = user?.fullName || user?.full_name || user?.email || "Instructor";

  return <ProductShell search="Search courses, questions, or assessments"><main className="pp-page role-workspace">
    <div className="pp-title hero role-heading">
      <div><small className="page-eyebrow">TEACHING CONTROL CENTER</small><h1>Welcome back, {doctorName(fullName)}</h1><p>Plan content, publish learning material, assess students, and close the grading loop from one workspace.</p></div>
      <div className="role-heading-actions"><button className="pp-button secondary" type="button" disabled={loading} onClick={() => void load()}><FiRefreshCw /> {loading ? "Refreshing…" : "Refresh"}</button></div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading && !data ? <Panel><PageSkeleton variant="list" label="Loading live instructor totals" /></Panel> : <>
      <div className="role-metric-grid">{Object.entries(data || {}).filter(([label]) => label !== "pending_essay_answers").map(([label, value]) => <Panel className="role-metric-card" key={label}><span><FiActivity /></span><div><b>{value}</b><small>{humanize(label)}</small></div></Panel>)}</div>
      <section className="role-command-grid">{links.map(({ title, description, href, Icon, tone }) => <Link href={href} className={`role-command-card ${tone}`} key={href}><span><Icon /></span><div><h2>{title}</h2><p>{description}</p><b>Open workflow →</b></div></Link>)}</section>
    </>}
  </main></ProductShell>;
}
