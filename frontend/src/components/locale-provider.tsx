"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type AppLocale = "en" | "ar";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale(locale: AppLocale): void;
  toggleLocale(): void;
  t(key: string, fallback?: string): string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const LOCALE_KEY = "mdp-locale";

const strings: Record<string, { en: string; ar: string }> = {
  "nav.bundles": { en: "My Bundles", ar: "حُزمي التعليمية" },
  "nav.flashcards": { en: "Flashcards", ar: "البطاقات التعليمية" },
  "nav.notebook": { en: "Notebook", ar: "دفتر الملاحظات" },
  "nav.guides": { en: "Study Guides", ar: "أدلة المذاكرة" },
  "nav.analytics": { en: "Analytics", ar: "التحليلات" },
  "nav.plan": { en: "Study Plan", ar: "خطة المذاكرة" },
  "nav.overview": { en: "Overview", ar: "نظرة عامة" },
  "nav.courses": { en: "Courses", ar: "المقررات" },
  "nav.questions": { en: "Questions", ar: "الأسئلة" },
  "nav.assessments": { en: "Assessments", ar: "الاختبارات" },
  "nav.grading": { en: "Grading", ar: "التصحيح" },
  "nav.users": { en: "Users", ar: "المستخدمون" },
  "nav.academics": { en: "Academics", ar: "الهيكل الأكاديمي" },
  "nav.audit": { en: "Audit", ar: "سجل التدقيق" },
  "nav.settings": { en: "Settings", ar: "الإعدادات" },
  "nav.notifications": { en: "Notifications", ar: "الإشعارات" },
  "command.open": { en: "Open command palette", ar: "فتح لوحة الأوامر" },
  "command.manual": { en: "Keyboard shortcuts", ar: "اختصارات لوحة المفاتيح" },
  "common.search": { en: "Search", ar: "بحث" },
  "common.refresh": { en: "Refresh", ar: "تحديث" },
  "common.save": { en: "Save", ar: "حفظ" },
  "common.cancel": { en: "Cancel", ar: "إلغاء" },
  "common.close": { en: "Close", ar: "إغلاق" },
  "common.delete": { en: "Delete", ar: "حذف" },
  "common.edit": { en: "Edit", ar: "تعديل" },
  "common.create": { en: "Create", ar: "إنشاء" },
  "common.loading": { en: "Loading…", ar: "جارٍ التحميل…" },
  "common.profile": { en: "Profile", ar: "الملف الشخصي" },
  "common.logout": { en: "Log out", ar: "تسجيل الخروج" },
  "settings.title": { en: "Settings", ar: "الإعدادات" },
  "settings.profile": { en: "Profile & identity", ar: "الملف الشخصي والهوية" },
  "settings.security": { en: "Security & sessions", ar: "الأمان والجلسات" },
  "settings.appearance": { en: "Appearance & language", ar: "المظهر واللغة" },
  "settings.language": { en: "Language", ar: "اللغة" },
  "settings.english": { en: "English", ar: "الإنجليزية" },
  "settings.arabic": { en: "Arabic", ar: "العربية" },
};

const exactArabic = new Map<string, string>([
  ["Settings", "الإعدادات"], ["Profile", "الملف الشخصي"], ["Notifications", "الإشعارات"],
  ["My Bundles", "حُزمي التعليمية"], ["Flashcards", "البطاقات التعليمية"], ["Notebook", "دفتر الملاحظات"],
  ["Study Guides", "أدلة المذاكرة"], ["Analytics", "التحليلات"], ["Study Plan", "خطة المذاكرة"],
  ["Overview", "نظرة عامة"], ["Courses", "المقررات"], ["Questions", "الأسئلة"], ["Assessments", "الاختبارات"],
  ["Grading", "التصحيح"], ["Users", "المستخدمون"], ["Academics", "الهيكل الأكاديمي"], ["Audit", "سجل التدقيق"],
  ["Search", "بحث"], ["Refresh", "تحديث"], ["Save", "حفظ"], ["Cancel", "إلغاء"], ["Close", "إغلاق"],
  ["Delete", "حذف"], ["Edit", "تعديل"], ["Create", "إنشاء"], ["Previous", "السابق"], ["Next", "التالي"],
  ["Light", "فاتح"], ["Dark", "داكن"], ["System", "النظام"], ["Theme", "المظهر"], ["Language", "اللغة"],
  ["Log out", "تسجيل الخروج"], ["Mark all read", "تحديد الكل كمقروء"], ["View all notifications", "عرض كل الإشعارات"],
  ["Open workflow", "فتح سير العمل"], ["No notifications yet.", "لا توجد إشعارات بعد."], ["No questions", "لا توجد أسئلة"],
  ["No resources published yet", "لا توجد موارد منشورة بعد"], ["No matching resources", "لا توجد موارد مطابقة"],
  ["Mark complete", "تحديد كمكتمل"], ["Completed", "مكتمل"], ["Preview", "معاينة"], ["Open file", "فتح الملف"],
  ["Full name", "الاسم الكامل"], ["Phone number", "رقم الهاتف"], ["Date of birth", "تاريخ الميلاد"], ["Gender", "النوع"],
  ["Current password", "كلمة المرور الحالية"], ["New password", "كلمة المرور الجديدة"], ["Change password", "تغيير كلمة المرور"],
  ["Email", "البريد الإلكتروني"], ["Role", "الدور"], ["Status", "الحالة"], ["Active", "نشط"], ["Draft", "مسودة"],
  ["Published", "منشور"], ["Resources", "الموارد"], ["Lecture resources", "موارد المحاضرة"], ["Course studio", "استوديو المقرر"],
  ["Question bank", "بنك الأسئلة"], ["Assessment builder", "منشئ الاختبارات"], ["Essay grading", "تصحيح الأسئلة المقالية"],
  ["Flashcard studio", "استوديو البطاقات"], ["User administration", "إدارة المستخدمين"], ["Academic structure", "الهيكل الأكاديمي"],
  ["Audit trail", "سجل التدقيق"], ["Loading settings…", "جارٍ تحميل الإعدادات…"], ["Loading assessment…", "جارٍ تحميل الاختبار…"],
]);

function translateExact(value: string) {
  const leading = value.match(/^\s*/)?.[0] || "";
  const trailing = value.match(/\s*$/)?.[0] || "";
  const core = value.trim();
  const translated = exactArabic.get(core);
  return translated ? `${leading}${translated}${trailing}` : value;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("en");

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    localStorage.setItem(LOCALE_KEY, next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.locale = next;
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(LOCALE_KEY);
    setLocale(saved === "ar" ? "ar" : "en");
  }, [setLocale]);

  useEffect(() => {
    if (locale !== "ar") return;
    const originalText = new WeakMap<Text, string>();
    const originalAttributes = new WeakMap<Element, Map<string, string>>();

    const translateNode = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      if (root instanceof Text) nodes.unshift(root);
      for (const node of nodes) {
        const parent = node.parentElement;
        if (!parent || parent.closest("[data-no-auto-translate]") || ["SCRIPT", "STYLE", "CODE", "PRE"].includes(parent.tagName)) continue;
        if (!originalText.has(node)) originalText.set(node, node.nodeValue || "");
        node.nodeValue = translateExact(originalText.get(node) || node.nodeValue || "");
      }
      const elements = root instanceof Element ? [root, ...root.querySelectorAll("[placeholder],[title],[aria-label]")] : [];
      for (const element of elements) {
        let originals = originalAttributes.get(element);
        if (!originals) { originals = new Map(); originalAttributes.set(element, originals); }
        for (const attribute of ["placeholder", "title", "aria-label"]) {
          const value = element.getAttribute(attribute);
          if (!value) continue;
          if (!originals.has(attribute)) originals.set(attribute, value);
          element.setAttribute(attribute, translateExact(originals.get(attribute) || value));
        }
      }
    };

    translateNode(document.body);
    const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(translateNode)));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    toggleLocale: () => setLocale(locale === "ar" ? "en" : "ar"),
    t: (key, fallback) => strings[key]?.[locale] || fallback || key,
  }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLocale();
  return <div className={`language-switcher ${compact ? "compact" : ""}`} role="group" aria-label="Language">
    <button type="button" className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")} aria-pressed={locale === "en"}>EN</button>
    <button type="button" className={locale === "ar" ? "active" : ""} onClick={() => setLocale("ar")} aria-pressed={locale === "ar"}>ع</button>
  </div>;
}
