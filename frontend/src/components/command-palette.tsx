"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiBarChart2,
  FiBell,
  FiBookOpen,
  FiCalendar,
  FiCheckCircle,
  FiClipboard,
  FiClock,
  FiCommand,
  FiEdit3,
  FiFileText,
  FiLayers,
  FiPlus,
  FiSettings,
  FiShield,
  FiUploadCloud,
  FiUsers,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import { useUx } from "./ux-provider";
import { readRecentWorkspacePages } from "./workspace-continuity";

type Role = "STUDENT" | "INSTRUCTOR" | "SYSTEM_ADMIN";
type Command = {
  label: string;
  description: string;
  href: string;
  icon: IconType;
  keywords: string[];
  roles?: Role[];
  recent?: boolean;
};

const commands: Command[] = [
  { label: "Open bundles", description: "Browse enrolled or managed learning bundles", href: "/bundles", icon: FiLayers, keywords: ["courses", "curriculum", "bundle"] },
  { label: "Review flashcards", description: "Continue the due spaced-repetition queue", href: "/flashcards", icon: FiBookOpen, keywords: ["cards", "review", "spaced repetition"], roles: ["STUDENT"] },
  { label: "Open notebook", description: "Browse explanations, pearls, and personal notes", href: "/notebook", icon: FiFileText, keywords: ["notes", "pearls", "cases"] },
  { label: "Create a note", description: "Start a private notebook note", href: "/notebook/new", icon: FiPlus, keywords: ["new", "write", "capture"], roles: ["STUDENT"] },
  { label: "Open study guides", description: "Browse lectures and published resources", href: "/guidelines", icon: FiBookOpen, keywords: ["resources", "lectures", "guides"], roles: ["STUDENT"] },
  { label: "Open analytics", description: "Inspect mastery, accuracy, and readiness", href: "/analytics", icon: FiBarChart2, keywords: ["progress", "readiness", "performance"], roles: ["STUDENT"] },
  { label: "Open study plan", description: "Review or regenerate your learning calendar", href: "/study-plan", icon: FiCalendar, keywords: ["schedule", "exam", "calendar"], roles: ["STUDENT"] },
  { label: "Instructor overview", description: "Open the teaching control center", href: "/instructor", icon: FiBarChart2, keywords: ["dashboard", "teaching"], roles: ["INSTRUCTOR"] },
  { label: "Course studio", description: "Build weeks, lectures, topics, and published curriculum", href: "/instructor/courses", icon: FiBookOpen, keywords: ["academic", "lecture", "topic"], roles: ["INSTRUCTOR"] },
  { label: "Upload lecture resources", description: "Upload verified PDFs, images, and videos to draft lectures", href: "/resources/upload", icon: FiUploadCloud, keywords: ["resource", "upload", "pdf", "video", "image"], roles: ["INSTRUCTOR", "SYSTEM_ADMIN"] },
  { label: "Instructor question bank", description: "Create MCQ and essay questions", href: "/instructor/questions", icon: FiEdit3, keywords: ["questions", "mcq", "essay"], roles: ["INSTRUCTOR"] },
  { label: "Assessment builder", description: "Create, assemble, and publish assessments", href: "/instructor/assessments", icon: FiClipboard, keywords: ["tests", "quizzes", "attempts"], roles: ["INSTRUCTOR"] },
  { label: "Essay grading", description: "Review attempts and grade submitted essays", href: "/instructor/grading", icon: FiCheckCircle, keywords: ["grade", "feedback", "answers"], roles: ["INSTRUCTOR"] },
  { label: "Instructor flashcard studio", description: "Create and publish teaching decks", href: "/instructor/flashcards", icon: FiLayers, keywords: ["cards", "decks", "publish"], roles: ["INSTRUCTOR"] },
  { label: "Admin overview", description: "Open the platform control center", href: "/admin", icon: FiShield, keywords: ["dashboard", "system"], roles: ["SYSTEM_ADMIN"] },
  { label: "Manage users", description: "Create accounts and control platform access", href: "/admin/users", icon: FiUsers, keywords: ["students", "instructors", "roles", "status"], roles: ["SYSTEM_ADMIN"] },
  { label: "Manage academic structure", description: "Create semesters, courses, and instructor assignments", href: "/admin/academics", icon: FiBookOpen, keywords: ["semester", "course", "lecture"], roles: ["SYSTEM_ADMIN"] },
  { label: "Admin question bank", description: "Moderate platform questions", href: "/admin/questions", icon: FiEdit3, keywords: ["content", "mcq", "essay"], roles: ["SYSTEM_ADMIN"] },
  { label: "Admin assessments", description: "Manage and publish platform assessments", href: "/admin/assessments", icon: FiClipboard, keywords: ["tests", "attempts"], roles: ["SYSTEM_ADMIN"] },
  { label: "Admin flashcard studio", description: "Manage teaching decks and cards", href: "/admin/flashcards", icon: FiLayers, keywords: ["decks", "cards"], roles: ["SYSTEM_ADMIN"] },
  { label: "Audit trail", description: "Inspect privileged platform events", href: "/admin/audit", icon: FiShield, keywords: ["logs", "governance", "security"], roles: ["SYSTEM_ADMIN"] },
  { label: "Open notifications", description: "Read your notification inbox", href: "/notifications", icon: FiBell, keywords: ["inbox", "alerts", "updates"] },
  { label: "Open settings", description: "Manage identity, sessions, language, and appearance", href: "/settings", icon: FiSettings, keywords: ["profile", "password", "theme", "language", "sessions"] },
  { label: "Keyboard shortcuts", description: "Open the command navigation manual", href: "/shortcuts", icon: FiCommand, keywords: ["manual", "keyboard", "hotkeys", "shortcuts", "command"] },
];

export function CommandPalette({ open, onOpen, onClose, role }: { open: boolean; onOpen: () => void; onClose: () => void; role: Role }) {
  const router = useRouter();
  const { startNavigation } = useUx();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<Command[]>([]);
  const available = useMemo(() => {
    const roleCommands = commands.filter(command => !command.roles || command.roles.includes(role));
    const staticHrefs = new Set(roleCommands.map(command => command.href));
    return [...recent.filter(command => !staticHrefs.has(command.href)), ...roleCommands];
  }, [recent, role]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return available;
    return available.filter(command => [command.label, command.description, ...command.keywords].join(" ").toLowerCase().includes(normalized));
  }, [available, query]);

  useEffect(() => {
    const syncRecent = () => setRecent(readRecentWorkspacePages().map(page => ({ label: `Resume ${page.label}`, description: page.href, href: page.href, icon: FiClock, keywords: ["recent", "history", page.label, page.href], recent: true })));
    syncRecent();
    window.addEventListener("mdp:recent-pages-changed", syncRecent);
    return () => window.removeEventListener("mdp:recent-pages-changed", syncRecent);
  }, []);

  useEffect(() => {
    function handleGlobalKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) onClose(); else onOpen();
      }
      if (event.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [onClose, onOpen, open]);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", trap);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", trap);
      restoreFocus.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [activeIndex, filtered.length]);

  function execute(command: Command) {
    onClose();
    startNavigation();
    router.push(command.href);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex(index => Math.min(filtered.length - 1, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex(index => Math.max(0, index - 1)); }
    else if (event.key === "Enter" && filtered[activeIndex]) { event.preventDefault(); execute(filtered[activeIndex]); }
  }

  if (!open) return null;
  return <div className="command-palette-backdrop" role="presentation" onMouseDown={onClose}><section ref={dialogRef} className="command-palette" role="dialog" aria-modal="true" aria-label="Workspace command palette" onMouseDown={event => event.stopPropagation()}><label className="command-palette-search"><FiBookOpen /><input ref={inputRef} value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={handleKeyDown} placeholder="Search pages and actions…" aria-controls="command-palette-results" aria-activedescendant={filtered[activeIndex] ? `command-${activeIndex}` : undefined} /><kbd>Esc</kbd></label><div className="command-palette-results" id="command-palette-results" role="listbox">{filtered.length ? filtered.map((command, index) => { const Icon = command.icon; return <button id={`command-${index}`} type="button" role="option" aria-selected={activeIndex === index} className={activeIndex === index ? "active" : ""} onMouseEnter={() => setActiveIndex(index)} onClick={() => execute(command)} key={`${command.href}-${command.label}`}><span><Icon /></span><span><b>{command.label}</b><small>{command.description}</small></span><kbd>{command.recent ? "Recent" : "↵"}</kbd></button>; }) : <p className="command-palette-empty">No matching workspace action.</p>}</div><footer><span>↑↓ Navigate</span><span>Enter Open</span><span>Esc Close</span><span>Ctrl/⌘ + / Manual</span></footer></section></div>;
}
