"use client";

import { FiCommand, FiCornerDownLeft, FiHelpCircle, FiNavigation, FiSearch } from "react-icons/fi";
import { useLocale } from "./locale-provider";
import { Panel, ProductShell } from "./product-shell";

const groups = [
  {
    title: "Global navigation",
    icon: FiCommand,
    rows: [
      ["Ctrl / ⌘ + K", "Open or close the command palette"],
      ["Ctrl / ⌘ + /", "Open this keyboard manual"],
      ["?", "Open contextual help for the current workspace"],
      ["Esc", "Close the active palette, drawer, menu, or dialog"],
    ],
  },
  {
    title: "Command palette",
    icon: FiSearch,
    rows: [
      ["↑ / ↓", "Move through matching commands"],
      ["Enter", "Open the selected command"],
      ["Type", "Search by page, workflow, or keyword"],
      ["Tab / Shift + Tab", "Move through focusable controls without leaving the dialog"],
    ],
  },
  {
    title: "Learning workspaces",
    icon: FiNavigation,
    rows: [
      ["← / →", "Move through flashcards when the review surface is focused"],
      ["Space / Enter", "Flip the active flashcard"],
      ["1–4", "Rate a flashcard when rating shortcuts are available"],
      ["Tab", "Reach every action without requiring a mouse"],
    ],
  },
];

export function KeyboardShortcutsPage() {
  const { locale } = useLocale();
  return <ProductShell search={locale === "ar" ? "ابحث في الأوامر والصفحات" : "Search commands and pages"}><main className="pp-page shortcut-manual-page">
    <header className="pp-title hero"><div><small className="page-eyebrow">{locale === "ar" ? "التنقل بلوحة المفاتيح" : "KEYBOARD NAVIGATION"}</small><h1>{locale === "ar" ? "دليل الأوامر والاختصارات" : "Command navigation manual"}</h1><p>{locale === "ar" ? "كل الاختصارات الأساسية في مكان واحد. يمكنك استخدام التطبيق بالكامل بدون الاعتماد على الماوس." : "A single reference for the shortcuts that let you operate the workspace without depending on a mouse."}</p></div><span className="shortcut-hero-key"><FiHelpCircle /> Ctrl / ⌘ + /</span></header>
    <div className="shortcut-group-grid">{groups.map(group => { const Icon = group.icon; return <Panel key={group.title} title={locale === "ar" ? ({"Global navigation":"التنقل العام","Command palette":"لوحة الأوامر","Learning workspaces":"مساحات التعلم"}[group.title] || group.title) : group.title}><div className="shortcut-group-icon"><Icon /></div><dl className="shortcut-list">{group.rows.map(([keys, description]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{description}</dd></div>)}</dl></Panel>; })}</div>
    <Panel title={locale === "ar" ? "قواعد لوحة المفاتيح" : "Keyboard rules"}><div className="shortcut-rules"><p><FiCornerDownLeft /> {locale === "ar" ? "التركيز المرئي يظهر دائمًا عند التنقل بلوحة المفاتيح." : "Visible focus is preserved whenever you navigate by keyboard."}</p><p>{locale === "ar" ? "الاختصارات العامة لا تعمل أثناء الكتابة داخل حقول النص، لتجنب تنفيذ أمر بالخطأ." : "Global single-key shortcuts are ignored while you type in text fields, preventing accidental actions."}</p><p>{locale === "ar" ? "أي إجراء حساس أو تدميري يحتاج تأكيدًا واضحًا قبل التنفيذ." : "Sensitive and destructive actions still require explicit confirmation before execution."}</p></div></Panel>
  </main></ProductShell>;
}
