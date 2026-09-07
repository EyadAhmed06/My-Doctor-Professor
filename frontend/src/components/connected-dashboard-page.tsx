"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  FiActivity,
  FiBarChart2,
  FiBookOpen,
  FiClipboard,
  FiClock,
  FiRefreshCw,
  FiStar,
  FiUsers,
} from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { PageSkeleton } from "./async-state";
import { useLocale } from "./locale-provider";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import { WorkspaceResumeStrip } from "./workspace-resume-strip";
import "./dashboard.css";
import "./product-pages.css";

type StudentCourse = {
  id: string;
  completionPercentage: string;
  lecturesCompleted: number;
  totalLectures: number;
  averageScore: string | null;
  course: { id: string; courseName: string; courseCode: string };
};

type Attempt = {
  id: string;
  status: string;
  score: string | null;
  submitted_at: string | null;
  test_id: string;
  title: string;
  total_marks: string | null;
  passing_marks: string | null;
};

type StudentDashboard = {
  courses: StudentCourse[];
  recent_attempts: Attempt[];
  questions: { attempts: number; correct_attempts: number; accuracy: string; bookmarked: number };
  essay_cases: { solved: number };
  flashcards: { reviewed: number; mastered: number; due: number };
  clinical_momentum: { study_streak: number; study_minutes: number; completed_sessions: number; xp: number; level: number; level_progress: number };
  weekly_activity: Array<{ date: string; questions: number; essay_cases: number; flashcards: number; lectures: number; plan_sessions: number; total: number }>;
  topic_mastery: Array<{ id: string; course_name: string; mastery: number; questions_attempted: number }>;
};

type InstructorDashboard = {
  questions: number;
  tests: number;
  decks: number;
  attempts: number;
  students: number;
  average_score: string;
  pending_essay_answers: number;
};

type AdminDashboard = {
  users: number;
  active_users: number;
  students: number;
  instructors: number;
  courses: number;
  questions: number;
  tests: number;
  attempts: number;
  flashcard_decks: number;
};

const number = (value: string | number | null | undefined) => Number(value || 0);
const clamp = (value: number) => Math.max(0, Math.min(100, value));

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function ConnectedDashboardPage() {
  const { user, request } = useAuth();
  const { translate } = useLocale();
  const [data, setData] = useState<StudentDashboard | InstructorDashboard | AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(background = false) {
    if (!user) return;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    const endpoint = user.role === "SYSTEM_ADMIN" ? "/dashboard/admin" : user.role === "INSTRUCTOR" ? "/dashboard/instructor" : "/dashboard/student";
    try {
      const dashboard = await request<StudentDashboard | InstructorDashboard | AdminDashboard>(endpoint);
      setData(dashboard);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("Unable to load your dashboard."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  // request is stable inside the auth provider.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  if (user?.role === "STUDENT") {
    return <StudentDashboardScreen
      data={data as StudentDashboard | null}
      loading={loading}
      refreshing={refreshing}
      error={error}
      reload={() => load(true)}
    />;
  }

  return <ProductShell><main className="pp-page"><div className="pp-title hero"><div><small className="page-eyebrow">{translate("LIVE WORKSPACE")}</small><h1>{translate(user?.role === "INSTRUCTOR" ? "Instructor dashboard" : "Administration dashboard")}</h1><p>{translate("All totals below come from current database records.")}</p></div><button className="pp-button secondary" onClick={() => void load(true)}><FiRefreshCw /> {translate("Refresh")}</button></div>{error && <p className="form-error">{error}</p>}{loading ? <PageSkeleton variant="workspace" label={translate("Loading dashboard")} /> : data ? <RoleTotals data={data as InstructorDashboard | AdminDashboard} /> : null}</main></ProductShell>;
}

function StudentDashboardScreen({
  data,
  loading,
  refreshing,
  error,
  reload,
}: {
  data: StudentDashboard | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { translate, locale } = useLocale();
  const { startNavigation } = useUx();
  const displayName = user?.fullName || user?.full_name || user?.email || "Student";
  const firstName = displayName.trim().split(/\s+/)[0];
  const accuracy = clamp(number(data?.questions.accuracy));
  const completedLectures = data?.courses.reduce((sum, item) => sum + item.lecturesCompleted, 0) || 0;
  const totalLectures = data?.courses.reduce((sum, item) => sum + item.totalLectures, 0) || 0;
  const hasCurriculumProgress = totalLectures > 0;
  const overallProgress = hasCurriculumProgress ? clamp(Math.round(completedLectures * 100 / totalLectures)) : 0;
  const streak = number(data?.clinical_momentum.study_streak);
  const studyMinutes = number(data?.clinical_momentum.study_minutes);
  const level = Math.max(1, number(data?.clinical_momentum.level));
  const levelProgress = clamp(number(data?.clinical_momentum.level_progress));

  const activity = useMemo(() => {
    const byDate = new Map((data?.weekly_activity || []).map((item) => [String(item.date).slice(0, 10), item]));
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(new Date(), index - 6);
      const item = byDate.get(localDateKey(date));
      return {
        label: date.toLocaleDateString(locale === "ar" ? "ar-EG" : undefined, { weekday: "short" }),
        value: number(item?.total),
        detail: item,
      };
    });
  }, [data?.weekly_activity, locale]);
  const maxActivity = Math.max(1, ...activity.map((item) => item.value));
  const continueCourse = data?.courses.find((item) => number(item.completionPercentage) < 100) || data?.courses[0];

  function navigate(href: string) {
    startNavigation();
    router.push(href);
  }

  const focusText = continueCourse
    ? translate(`Continue ${continueCourse.course.courseName}: ${continueCourse.lecturesCompleted} of ${continueCourse.totalLectures} lectures completed.`)
    : translate("Your focus will appear after you open your first course.");
  const progressLabel = hasCurriculumProgress ? translate(`${overallProgress}% complete`) : translate("Ready to start");
  const lectureProgressLabel = hasCurriculumProgress
    ? translate(`${completedLectures} of ${totalLectures} lectures completed`)
    : translate("Open your first bundle lecture to begin curriculum progress.");

  return <div className="dashboard-shell dashboard-embedded">
    <main className="dash-content dashboard-embedded-content">
      <WorkspaceResumeStrip />
      {error && <p className="form-error" role="alert">{error} <button onClick={() => void reload()}>{translate("Retry")}</button></p>}
      <section className="welcome dashboard-welcome-actions">
        <div><p className="eyebrow">{translate("TODAY'S FOCUS")}</p><h1>{translate(`Welcome back, ${firstName}`)}</h1><p>{translate("You're building clinical expertise every day.")}</p><strong>{focusText}</strong></div>
        <button className="pp-button secondary" type="button" disabled={refreshing} onClick={() => void reload()}><FiRefreshCw className={refreshing ? "is-spinning" : ""} /> {translate(refreshing ? "Refreshing" : "Refresh")}</button>
      </section>

      <Card title={translate("Clinical Momentum")} subtitle={translate("Your progress at a glance")} className="momentum-card">
        <div className="metrics">
          <div className="metric primary"><span className="metric-icon"><FiClipboard /></span><div><small>{translate("Questions answered")}</small><b>{number(data?.questions.attempts)}</b><span>{translate("All time")}</span><em>{translate(`${accuracy}% accuracy`)}</em></div><FiBarChart2 /></div>
          <div className="metric"><span className="metric-icon"><FiBookOpen /></span><div><small>{translate("Essay cases solved")}</small><b>{number(data?.essay_cases?.solved)}</b><span>{translate("Distinct submitted cases")}</span><em>{translate("One case is counted once")}</em></div></div>
          <div className="metric"><span className="metric-icon flame"><FiActivity /></span><div><small>{translate("Study streak")}</small><b>{streak} <sup>{locale === "ar" ? "يوم" : "days"}</sup></b><span>{translate(streak ? "Built from questions, flashcards, lectures, and completed sessions" : "Complete learning activity today to begin")}</span><div className="streak">{[0, 1, 2, 3, 4, 5, 6].map((day) => <i className={day < Math.min(streak, 7) ? "" : "off"} key={day} />)}</div></div></div>
          <div className="metric"><span className="metric-icon"><FiClock /></span><div><small>{translate("Study hours")}</small><b>{Math.round(studyMinutes / 6) / 10} <sup>{locale === "ar" ? "س" : "hrs"}</sup></b><span>{translate("Recorded lecture time and completed non-lecture plan sessions")}</span></div></div>
        </div>
      </Card>

      {loading && !data ? <PageSkeleton variant="workspace" label={translate("Loading your dashboard")} /> : <div className="main-grid">
        <div className="column-main">
          <Card title={translate("Studio")} subtitle={translate("Your hard-question review queue")} action={<Link href="/studio">{translate("Open Studio")} →</Link>} className="studio-dashboard-card">
            <p>{translate("Questions you mark as Hard during quizzes are collected here after the attempt closes, so you can review the correct answer and reasoning again.")}</p>
            <button type="button" className="pp-button secondary" onClick={() => navigate("/studio")}><FiStar /> {translate("Review hard questions")}</button>
          </Card>
          <Card title={translate("Weekly Activity")} action={<Link href="/analytics">{translate("Open analytics")} →</Link>} className="activity-card">
            <div className="chart-legend"><span><i />{translate("Learning interactions")}</span></div><div className="bar-chart">{activity.map((item) => <div key={item.label}><span title={translate(`${item.value} interactions: ${number(item.detail?.questions)} MCQs, ${number(item.detail?.essay_cases)} essay cases, ${number(item.detail?.flashcards)} flashcards, ${number(item.detail?.lectures)} lectures, ${number(item.detail?.plan_sessions)} plan sessions`)} style={{ height: `${Math.max(2, Math.round(item.value / maxActivity * 92))}px` }} /><small>{item.label}</small></div>)}</div>
          </Card>
        </div>

        <aside className="column-side">
          <Card title={translate("Your Progress")} action={<span>{progressLabel}</span>} className="progress-card"><div className="progress-content"><div className="level-badge large">{level}</div><div><strong>{translate(`Level ${level}`)} <small>{translate("Clinical Learner")}</small></strong><span>{translate(`${levelProgress} / 100 XP to next level`)}</span><div className="xp-bar" role="progressbar" aria-label={translate("XP toward next level")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={levelProgress}><i style={{ width: `${levelProgress}%` }} /></div><small>{lectureProgressLabel}</small></div></div></Card>
          <Card title={translate("Topic Mastery")} action={<Link href="/analytics">{translate("View analytics")} →</Link>} className="mastery-card"><div className="mastery-list">{data?.topic_mastery.length ? data.topic_mastery.slice(0, 6).map((item) => <button type="button" onClick={() => navigate("/analytics")} key={item.id}><span><FiActivity /><span data-academic-content>{item.course_name}</span></span><b>{clamp(number(item.mastery))}%</b><div><i style={{ width: `${clamp(number(item.mastery))}%` }} /></div><small>{translate(`${item.questions_attempted} graded answers`)}</small></button>) : <p>{translate("Answer graded questions to build topic mastery.")}</p>}</div></Card>
        </aside>
      </div>}
    </main>
  </div>;
}

function Card({ title, subtitle, action, className = "", children }: { title: string; subtitle?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return <section className={`dash-card ${className}`}><header><h2>{title}</h2>{action && <div>{action}</div>}</header>{subtitle && <p className="card-subtitle">{subtitle}</p>}{children}</section>;
}

function RoleTotals({ data }: { data: InstructorDashboard | AdminDashboard }) {
  const { translate } = useLocale();
  return <div className="pp-metrics">{Object.entries(data).map(([label, value]) => <Panel className="pp-metric" key={label}><FiUsers /><div><b>{value}</b><small>{translate(label.replaceAll("_", " "))}</small></div></Panel>)}</div>;
}
