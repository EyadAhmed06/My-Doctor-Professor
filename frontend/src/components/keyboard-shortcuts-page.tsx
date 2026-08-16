"use client";

import { FiCommand, FiCornerDownLeft, FiHelpCircle, FiNavigation, FiSearch } from "react-icons/fi";
import { useLocale } from "./locale-provider";
import { Panel, ProductShell } from "./product-shell";

type ShortcutRow = { keys:string; en:string; ar:string };
type ShortcutGroup = { title:string; arTitle:string; icon:typeof FiCommand; rows:ShortcutRow[] };

const groups:ShortcutGroup[] = [
  {
    title: "Global navigation", arTitle:"التنقل العام", icon: FiCommand,
    rows: [
      {keys:"Ctrl / ⌘ + K",en:"Open or close the command palette",ar:"فتح أو إغلاق لوحة الأوامر"},
      {keys:"Ctrl / ⌘ + /",en:"Open this keyboard manual",ar:"فتح دليل اختصارات لوحة المفاتيح"},
      {keys:"?",en:"Open contextual help for the current workspace",ar:"فتح المساعدة الخاصة بالمساحة الحالية"},
      {keys:"Esc",en:"Close the active palette, drawer, menu, or dialog",ar:"إغلاق لوحة الأوامر أو الدرج أو القائمة أو النافذة الحالية"},
    ],
  },
  {
    title: "Command palette", arTitle:"لوحة الأوامر", icon: FiSearch,
    rows: [
      {keys:"↑ / ↓",en:"Move through matching commands",ar:"التنقل بين الأوامر المطابقة"},
      {keys:"Enter",en:"Open the selected command",ar:"فتح الأمر المحدد"},
      {keys:"Type",en:"Search by page, workflow, or keyword",ar:"البحث باسم الصفحة أو سير العمل أو كلمة مفتاحية"},
      {keys:"Tab / Shift + Tab",en:"Move through focusable controls without leaving the dialog",ar:"التنقل بين عناصر التحكم داخل النافذة دون مغادرتها"},
    ],
  },
  {
    title: "Learning workspaces", arTitle:"مساحات التعلم", icon: FiNavigation,
    rows: [
      {keys:"← / →",en:"Move through flashcards when the review surface is focused",ar:"التنقل بين البطاقات التعليمية أثناء جلسة المراجعة"},
      {keys:"Space / Enter",en:"Flip the active flashcard",ar:"قلب البطاقة التعليمية الحالية"},
      {keys:"1–4",en:"Rate a flashcard when rating shortcuts are available",ar:"تقييم البطاقة عند توفر اختصارات التقييم"},
      {keys:"Tab",en:"Reach every action without requiring a mouse",ar:"الوصول إلى جميع الإجراءات دون الحاجة إلى الفأرة"},
    ],
  },
];

export function KeyboardShortcutsPage() {
  const { locale } = useLocale();
  return <ProductShell search={locale === "ar" ? "ابحث في الأوامر والصفحات" : "Search commands and pages"}><main className="pp-page shortcut-manual-page">
    <header className="pp-title hero"><div><small className="page-eyebrow">{locale === "ar" ? "التنقل بلوحة المفاتيح" : "KEYBOARD NAVIGATION"}</small><h1>{locale === "ar" ? "دليل الأوامر والاختصارات" : "Command navigation manual"}</h1><p>{locale === "ar" ? "كل الاختصارات الأساسية في مكان واحد. يمكنك استخدام التطبيق بالكامل بدون الاعتماد على الماوس." : "A single reference for the shortcuts that let you operate the workspace without depending on a mouse."}</p></div><span className="shortcut-hero-key"><FiHelpCircle /> Ctrl / ⌘ + /</span></header>
    <div className="shortcut-group-grid">{groups.map(group => { const Icon = group.icon; return <Panel key={group.title} title={locale === "ar" ? group.arTitle : group.title}><div className="shortcut-group-icon"><Icon /></div><dl className="shortcut-list">{group.rows.map(row => <div key={row.keys}><dt><kbd>{row.keys}</kbd></dt><dd>{locale==="ar"?row.ar:row.en}</dd></div>)}</dl></Panel>; })}</div>
    <Panel title={locale === "ar" ? "قواعد لوحة المفاتيح" : "Keyboard rules"}><div className="shortcut-rules"><p><FiCornerDownLeft /> {locale === "ar" ? "التركيز المرئي يظهر دائمًا عند التنقل بلوحة المفاتيح." : "Visible focus is preserved whenever you navigate by keyboard."}</p><p>{locale === "ar" ? "الاختصارات العامة لا تعمل أثناء الكتابة داخل حقول النص، لتجنب تنفيذ أمر بالخطأ." : "Global single-key shortcuts are ignored while you type in text fields, preventing accidental actions."}</p><p>{locale === "ar" ? "أي إجراء حساس أو تدميري يحتاج تأكيدًا واضحًا قبل التنفيذ." : "Sensitive and destructive actions still require explicit confirmation before execution."}</p></div></Panel>
  </main></ProductShell>;
}
