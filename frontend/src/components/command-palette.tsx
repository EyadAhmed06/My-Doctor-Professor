"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiBarChart2,
  FiBell,
  FiBookOpen,
  FiCalendar,
  FiClipboard,
  FiFileText,
  FiLayers,
  FiPlus,
  FiSettings,
} from "react-icons/fi";
import type { IconType } from "react-icons";

type Role = "STUDENT" | "INSTRUCTOR" | "SYSTEM_ADMIN";

type Command = {
  label: string;
  description: string;
  href: string;
  icon: IconType;
  keywords: string[];
  roles?: Role[];
};

const commands: Command[] = [
  { label: "Open bundles", description: "Browse your enrolled learning bundles", href: "/bundles", icon: FiLayers, keywords: ["courses", "curriculum", "bundle"] },
  { label: "Review flashcards", description: "Continue the due spaced-repetition queue", href: "/flashcards", icon: FiBookOpen, keywords: ["cards", "review", "spaced repetition"] },
  { label: "Open notebook", description: "Browse explanations, pearls, and personal notes", href: "/notebook", icon: FiFileText, keywords: ["notes", "pearls", "cases"] },
  { label: "Create a note", description: "Start a private notebook note", href: "/notebook/new", icon: FiPlus, keywords: ["new", "write", "capture"], roles: ["STUDENT"] },
  { label: "Open study guides", description: "Browse lectures and published resources", href: "/guidelines", icon: FiBookOpen, keywords: ["resources", "lectures", "guides"] },
  { label: "Open analytics", description: "Inspect mastery, accuracy, and readiness", href: "/analytics", icon: FiBarChart2, keywords: ["progress", "readiness", "performance"], roles: ["STUDENT"] },
  { label: "Open study plan", description: "Review or regenerate your learning calendar", href: "/study-plan", icon: FiCalendar, keywords: ["schedule", "exam", "calendar"], roles: ["STUDENT"] },
  { label: "Open notifications", description: "Read your notification inbox", href: "/notifications", icon: FiBell, keywords: ["inbox", "alerts", "updates"] },
  { label: "Instructor assessments", description: "Open the instructor assessment workspace", href: "/instructor/quizzes", icon: FiClipboard, keywords: ["tests", "quizzes", "grading"], roles: ["INSTRUCTOR", "SYSTEM_ADMIN"] },
  { label: "Instructor flashcards", description: "Create and publish instructor cards", href: "/instructor/flashcards", icon: FiLayers, keywords: ["builder", "publish", "decks"], roles: ["INSTRUCTOR", "SYSTEM_ADMIN"] },
  { label: "Open settings", description: "Manage profile, security, and appearance", href: "/settings", icon: FiSettings, keywords: ["profile", "password", "theme"] },
];

export function CommandPalette({
  open,
  onOpen,
  onClose,
  role,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  role: Role;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const available = useMemo(
    () => commands.filter((command) => !command.roles || command.roles.includes(role)),
    [role],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return available;
    return available.filter((command) =>
      [command.label, command.description, ...command.keywords]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [available, query]);

  useEffect(() => {
    function handleGlobalKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) onClose();
        else onOpen();
      }
      if (event.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [open, onClose, onOpen]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [activeIndex, filtered.length]);

  function execute(command: Command) {
    onClose();
    router.push(command.href);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(filtered.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && filtered[activeIndex]) {
      event.preventDefault();
      execute(filtered[activeIndex]);
    }
  }

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Workspace command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <label className="command-palette-search">
          <FiBookOpen />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search pages and actions…"
            aria-controls="command-palette-results"
            aria-activedescendant={filtered[activeIndex] ? `command-${activeIndex}` : undefined}
          />
          <kbd>Esc</kbd>
        </label>
        <div className="command-palette-results" id="command-palette-results" role="listbox">
          {filtered.length ? (
            filtered.map((command, index) => {
              const Icon = command.icon;
              return (
                <button
                  id={`command-${index}`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  className={activeIndex === index ? "active" : ""}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => execute(command)}
                  key={`${command.href}-${command.label}`}
                >
                  <span><Icon /></span>
                  <span><b>{command.label}</b><small>{command.description}</small></span>
                  <kbd>↵</kbd>
                </button>
              );
            })
          ) : (
            <p className="command-palette-empty">No matching workspace action.</p>
          )}
        </div>
        <footer><span>↑↓ Navigate</span><span>Enter Open</span><span>Esc Close</span></footer>
      </section>
    </div>
  );
}
