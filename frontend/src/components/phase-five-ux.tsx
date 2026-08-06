"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiActivity,
  FiAward,
  FiBookOpen,
  FiCheck,
  FiChevronRight,
  FiClipboard,
  FiCommand,
  FiEdit3,
  FiFileText,
  FiHelpCircle,
  FiHome,
  FiLayers,
  FiList,
  FiShield,
  FiUsers,
  FiX,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import { useAuth, type UserRole } from "./auth-provider";
import { useUx } from "./ux-provider";

type HelpContent = {
  title: string;
  purpose: string;
  steps: string[];
};
type DockItem = { label: string; href: string; Icon: IconType };
type CoachStep = { id: string; label: string; description: string; href: string; complete: boolean };
type RoleStats = Record<string, string | number>;

const roleDock: Record<UserRole, DockItem[]> = {
  STUDENT: [
    { label: "Home", href: "/dashboard", Icon: FiHome },
    { label: "Bundles", href: "/bundles", Icon: FiLayers },
    { label: "Review", href: "/flashcards", Icon: FiActivity },
    { label: "Notebook", href: "/notebook", Icon: FiFileText },
  ],
  INSTRUCTOR: [
    { label: "Home", href: "/instructor", Icon: FiHome },
    { label: "Courses", href: "/instructor/courses", Icon: FiBookOpen },
    { label: "Questions", href: "/instructor/questions", Icon: FiEdit3 },
    { label: "Tests", href: "/instructor/assessments", Icon: FiClipboard },
  ],
  SYSTEM_ADMIN: [
    { label: "Home", href: "/admin", Icon: FiHome },
    { label: "Users", href: "/admin/users", Icon: FiUsers },
    { label: "Academics", href: "/admin/academics", Icon: FiBookOpen },
    { label: "Audit", href: "/admin/audit", Icon: FiShield },
  ],
};

function titleFromPath(path: string) {
  const value = path.split("?")[0].split("#")[0].split("/").filter(Boolean).at(-1) || "dashboard";
  return value.replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function homeFor(role: UserRole) {
  if (role === "SYSTEM_ADMIN") return { label: "Administration", href: "/admin" };
  if (role === "INSTRUCTOR") return { label: "Instructor", href: "/instructor" };
  return { label: "Dashboard", href: "/dashboard" };
}

function helpFor(path: string, role: UserRole): HelpContent {
  if (path.includes("users")) return {
    title: "User administration",
    purpose: "Control identity, role, account status, and recovery without bypassing administrator invariants.",
    steps: ["Search before creating a duplicate account.", "Create the role-specific profile fields.", "Use suspension for temporary access removal.", "Use deletion only when the account must be permanently removed."],
  };
  if (path.includes("academics") || path.includes("courses")) return {
    title: role === "SYSTEM_ADMIN" ? "Academic structure" : "Course studio",
    purpose: "Build the hierarchy that every question, assessment, flashcard, and bundle depends on.",
    steps: ["Choose or create the semester and course.", "Create weeks in teaching order.", "Add lectures and topics.", "Publish lectures only after their learning content is ready."],
  };
  if (path.includes("questions")) return {
    title: "Question bank",
    purpose: "Create reusable assessment content with an explicit topic, difficulty, marks, and answer configuration.",
    steps: ["Select the exact topic.", "Write the clinical prompt and explanation.", "Configure MCQ options or the essay rubric.", "Keep incomplete questions inactive until reviewed."],
  };
  if (path.includes("assessments") || path.includes("quizzes") || path.includes("past-exams")) return {
    title: "Assessment builder",
    purpose: "Assemble questions into a scoped test, validate marks and availability, then publish it to students.",
    steps: ["Create the assessment scope and timing.", "Add active questions in the intended order.", "Review total marks and passing marks.", "Publish only when the definition is final."],
  };
  if (path.includes("grading")) return {
    title: "Essay grading desk",
    purpose: "Close the assessment feedback loop by awarding marks and leaving actionable feedback on submitted essays.",
    steps: ["Open the assessment attempt.", "Compare the response with the model answer and rubric.", "Award marks within the question limit.", "Leave feedback that explains the score."],
  };
  if (path.includes("flashcards")) return {
    title: role === "STUDENT" ? "Spaced repetition" : "Flashcard studio",
    purpose: role === "STUDENT" ? "Review due cards honestly so the schedule adapts to actual recall." : "Create focused cards linked to the correct learning scope and publish complete decks.",
    steps: role === "STUDENT" ? ["Attempt recall before revealing the answer.", "Rate difficulty based on recall, not confidence.", "Clear the due queue before adding random reviews."] : ["Choose the course, lecture, or topic scope.", "Keep one testable idea per card.", "Add an explanation for difficult concepts.", "Publish the deck after reviewing its cards."],
  };
  if (path.includes("bundles")) return {
    title: "Bundle manager",
    purpose: role === "STUDENT" ? "Open the learning packages assigned to you and continue from the exact saved context." : "Package courses, weeks, tests, and access rules into a coherent student offering.",
    steps: role === "STUDENT" ? ["Open the assigned bundle.", "Continue the next incomplete lecture.", "Use its tests and flashcards within the same scope."] : ["Create the bundle identity and access mode.", "Attach the intended curriculum and assessments.", "Assign instructors or students.", "Publish only when access and content are complete."],
  };
  if (path.includes("audit")) return {
    title: "Audit trail",
    purpose: "Inspect immutable evidence of privileged platform actions without editing the record.",
    steps: ["Filter by action, entity, or actor.", "Confirm the affected record and timestamp.", "Use the IP and actor context during investigations.", "Follow up in the owning workflow rather than altering audit history."],
  };
  if (path.includes("notebook")) return {
    title: "Clinical notebook",
    purpose: "Capture explanations, cases, and pearls in a structure that can later become study material.",
    steps: ["Choose a specific note type.", "Capture the reasoning, not only the conclusion.", "Tag the note for retrieval.", "Convert stable facts into flashcards when useful."],
  };
  if (path.includes("analytics")) return {
    title: "Learning analytics",
    purpose: "Use measured performance to decide what deserves attention next rather than adding random study work.",
    steps: ["Read readiness before isolated metrics.", "Inspect the weakest topic and accuracy trend.", "Open the recommended action.", "Recheck after meaningful new attempts."],
  };
  if (path.includes("study-plan")) return {
    title: "Study plan",
    purpose: "Turn workload, exam timing, and readiness gaps into a realistic calendar.",
    steps: ["Confirm the available study hours.", "Generate or update the plan.", "Reschedule rather than silently skipping work.", "Protect completed sessions from accidental edits."],
  };
  return {
    title: role === "SYSTEM_ADMIN" ? "Administration control center" : role === "INSTRUCTOR" ? "Teaching control center" : "Learning workspace",
    purpose: role === "SYSTEM_ADMIN" ? "Move through the platform operating loop from identity to structure, content, delivery, and governance." : role === "INSTRUCTOR" ? "Move through the teaching loop from course structure to content, assessment, grading, and student access." : "Continue the highest-value next learning action from one workspace.",
    steps: role === "SYSTEM_ADMIN" ? ["Create and verify accounts.", "Build the academic hierarchy.", "Review platform content and delivery.", "Inspect governance evidence."] : role === "INSTRUCTOR" ? ["Structure the course.", "Create teaching and assessment content.", "Publish and monitor delivery.", "Grade and return feedback."] : ["Continue the current bundle.", "Clear due reviews.", "Capture useful notes.", "Use analytics to choose the next target."],
  };
}

export function WorkspaceBreadcrumbs({ path, role }: { path: string; role: UserRole }) {
  const home = homeFor(role);
  const current = path === home.href || path === "/dashboard" ? null : titleFromPath(path);
  return <nav className="phase5-breadcrumbs" aria-label="Breadcrumb"><Link href={home.href}>{home.label}</Link>{current && <><FiChevronRight /><span aria-current="page">{current}</span></>}</nav>;
}

export function WorkspaceHelpDrawer({ path, role, open, onClose }: { path: string; role: UserRole; open: boolean; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const content = useMemo(() => helpFor(path, role), [path, role]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeButton.current?.focus());
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", escape);
      previous?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return <div className="phase5-drawer-backdrop" role="presentation" onMouseDown={onClose}><aside className="phase5-drawer" role="dialog" aria-modal="true" aria-label="Workspace help" onMouseDown={event => event.stopPropagation()}><header><div><small>CONTEXTUAL GUIDE</small><h2>{content.title}</h2></div><button ref={closeButton} type="button" onClick={onClose} aria-label="Close help"><FiX /></button></header><section><h3><FiHelpCircle /> Purpose</h3><p>{content.purpose}</p></section><section><h3><FiList /> Safe operating sequence</h3><ol>{content.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol></section><section><h3><FiCommand /> Keyboard</h3><dl><div><dt>Ctrl / ⌘ + K</dt><dd>Open command palette</dd></div><div><dt>?</dt><dd>Open this contextual guide</dd></div><div><dt>Escape</dt><dd>Close the current dialog or menu</dd></div><div><dt>Tab / Shift + Tab</dt><dd>Move through available actions</dd></div></dl></section></aside></div>;
}

export function AchievementDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { achievements } = useUx();
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => closeButton.current?.focus());
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", escape);
    };
  }, [onClose, open]);
  if (!open) return null;
  return <div className="phase5-drawer-backdrop" role="presentation" onMouseDown={onClose}><aside className="phase5-drawer phase5-achievement-drawer" role="dialog" aria-modal="true" aria-label="Achievements" onMouseDown={event => event.stopPropagation()}><header><div><small>PROGRESS MEMORY</small><h2>Achievements</h2></div><button ref={closeButton} type="button" onClick={onClose} aria-label="Close achievements"><FiX /></button></header>{achievements.length ? <div className="phase5-achievement-list">{achievements.map(item => <article key={item.id}><span><FiAward /></span><div><b>{item.title}</b><p>{item.description}</p><small>{new Date(item.unlockedAt).toLocaleString()}{item.points ? ` · +${item.points} XP` : ""}</small></div></article>)}</div> : <div className="phase5-achievement-empty"><FiAward /><h3>No achievements yet</h3><p>Meaningful milestones will appear here as you complete real learning or operating loops.</p></div>}</aside></div>;
}

function coachSteps(role: UserRole, stats: RoleStats): CoachStep[] {
  const value = (key: string) => Number(stats[key] || 0);
  if (role === "SYSTEM_ADMIN") return [
    { id: "accounts", label: "Establish the team", description: "Create the student, instructor, and administrative accounts needed to operate.", href: "/admin/users", complete: value("users") >= 3 },
    { id: "academics", label: "Build academic structure", description: "Create at least one active course and its hierarchy.", href: "/admin/academics", complete: value("courses") > 0 },
    { id: "questions", label: "Create assessment content", description: "Add reviewed questions to the shared bank.", href: "/admin/questions", complete: value("questions") > 0 },
    { id: "tests", label: "Publish delivery", description: "Create the first assessment students can eventually take.", href: "/admin/assessments", complete: value("tests") > 0 },
    { id: "evidence", label: "Close the operating loop", description: "Reach real student attempts and preserve governance evidence.", href: "/admin/audit", complete: value("attempts") > 0 },
  ];
  return [
    { id: "questions", label: "Create reusable questions", description: "Write the first reviewed question in the correct topic.", href: "/instructor/questions", complete: value("questions") > 0 },
    { id: "decks", label: "Build reinforcement", description: "Create a teaching deck that supports retention.", href: "/instructor/flashcards", complete: value("decks") > 0 },
    { id: "tests", label: "Assemble an assessment", description: "Create a scoped assessment from the question bank.", href: "/instructor/assessments", complete: value("tests") > 0 },
    { id: "students", label: "Reach learners", description: "Make the teaching workflow available to enrolled students.", href: "/bundles", complete: value("students") > 0 },
    { id: "feedback", label: "Close the feedback loop", description: "Review attempts and clear pending essay grading.", href: "/instructor/grading", complete: value("attempts") > 0 && value("pending_essay_answers") === 0 },
  ];
}

export function RoleWorkflowCoach({ path, role }: { path: string; role: UserRole }) {
  const { request } = useAuth();
  const { celebrate } = useUx();
  const [stats, setStats] = useState<RoleStats | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const isHome = role === "SYSTEM_ADMIN" ? path === "/admin" || path === "/dashboard" : role === "INSTRUCTOR" ? path === "/instructor" || path === "/dashboard" : false;
  const storageKey = `mdp_phase5_coach_collapsed_${role}`;

  useEffect(() => {
    if (!isHome || role === "STUDENT") return;
    setCollapsed(localStorage.getItem(storageKey) === "true");
    let active = true;
    setLoading(true);
    void request<RoleStats>(role === "SYSTEM_ADMIN" ? "/dashboard/admin" : "/dashboard/instructor")
      .then(value => { if (active) setStats(value); })
      .catch(() => { if (active) setStats(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isHome, request, role, storageKey]);

  const steps = useMemo(() => stats ? coachSteps(role, stats) : [], [role, stats]);
  const complete = steps.filter(step => step.complete).length;
  const next = steps.find(step => !step.complete);

  useEffect(() => {
    if (!stats || !steps.length) return;
    if (steps.every(step => step.complete)) {
      celebrate({
        id: role === "SYSTEM_ADMIN" ? "admin-operating-loop-complete" : "instructor-teaching-loop-complete",
        title: role === "SYSTEM_ADMIN" ? "Platform loop established" : "Teaching loop closed",
        description: role === "SYSTEM_ADMIN" ? "Identity, structure, content, delivery, and evidence are all active." : "Content, delivery, attempts, and feedback are now connected.",
        points: 250,
      });
    } else if (role === "SYSTEM_ADMIN" && Number(stats.courses || 0) > 0) {
      celebrate({ id: "admin-first-course", title: "Academic foundation online", description: "The platform now has an academic structure to build on.", points: 80 });
    } else if (role === "INSTRUCTOR" && Number(stats.tests || 0) > 0) {
      celebrate({ id: "instructor-first-assessment", title: "Assessment architect", description: "You created the first assessment in your teaching workspace.", points: 80 });
    }
  }, [celebrate, role, stats, steps]);

  if (!isHome || role === "STUDENT") return null;
  function toggle() {
    const nextValue = !collapsed;
    setCollapsed(nextValue);
    localStorage.setItem(storageKey, String(nextValue));
  }
  if (collapsed) return <section className="phase5-coach phase5-coach-collapsed"><div><FiCheck /><span><b>{complete}/{steps.length || 5} operating stages complete</b><small>{next ? `Next: ${next.label}` : "Workflow complete"}</small></span></div><button type="button" onClick={toggle}>Show guide</button></section>;
  return <section className="phase5-coach"><header><div><small>{role === "SYSTEM_ADMIN" ? "ADMIN OPERATING LOOP" : "INSTRUCTOR TEACHING LOOP"}</small><h2>{loading ? "Mapping your current workflow…" : next ? `Next best action: ${next.label}` : "The full workflow is connected"}</h2><p>{next?.description || "All major stages have live records. Continue operating from the relevant workspace."}</p></div><button type="button" onClick={toggle}>Collapse</button></header><div className="phase5-coach-progress"><span style={{ width: `${steps.length ? complete * 100 / steps.length : 0}%` }} /></div><ol>{steps.map((step, index) => <li className={step.complete ? "complete" : step.id === next?.id ? "current" : ""} key={step.id}><span>{step.complete ? <FiCheck /> : index + 1}</span><div><b>{step.label}</b><small>{step.description}</small></div><Link href={step.href} aria-label={`Open ${step.label}`}><FiChevronRight /></Link></li>)}</ol></section>;
}

export function MobileRoleDock({ path, role }: { path: string; role: UserRole }) {
  return <nav className="phase5-mobile-dock" aria-label="Mobile workspace navigation">{roleDock[role].map(({ label, href, Icon }) => <Link className={path === href || path.startsWith(`${href}/`) ? "active" : ""} href={href} key={href}><Icon /><span>{label}</span></Link>)}</nav>;
}

export function PhaseFiveMilestones({ path, role }: { path: string; role: UserRole }) {
  const { celebrate } = useUx();
  useEffect(() => {
    if (role !== "STUDENT") return;
    const milestone = path.startsWith("/notebook")
      ? { id: "student-notebook-opened", title: "Clinical memory started", description: "You opened the notebook workflow for durable reasoning and retrieval.", points: 25 }
      : path.startsWith("/flashcards")
        ? { id: "student-review-workflow", title: "Recall before recognition", description: "You entered the spaced-repetition workflow.", points: 25 }
        : path.startsWith("/analytics")
          ? { id: "student-analytics-opened", title: "Feedback loop discovered", description: "You used measured performance to guide the next action.", points: 25 }
          : path.startsWith("/study-plan")
            ? { id: "student-plan-opened", title: "Plan before pressure", description: "You opened the study-planning workflow before adding more work.", points: 25 }
            : null;
    if (milestone) celebrate(milestone);
  }, [celebrate, path, role]);
  return null;
}
