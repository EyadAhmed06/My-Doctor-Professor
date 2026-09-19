"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FiCheck } from "react-icons/fi";
import { extraArabic, extraArabicPattern } from "./locale-arabic-extra";
import { pageArabic } from "./locale-arabic-pages";
import { workspaceArabic } from "./locale-arabic-workspaces";

export type AppLocale = "en" | "ar";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale(locale: AppLocale): void;
  toggleLocale(): void;
  t(key: string, fallback?: string): string;
  translate(value: string): string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const LOCALE_KEY = "mdp-locale";
const translatableAttributes = ["placeholder", "title", "aria-label"] as const;
const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();

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
  "common.logout": { en: "Log out", ar: "تسجيل الخروج" },
  "settings.title": { en: "Settings", ar: "الإعدادات" },
  "settings.profile": { en: "Profile & identity", ar: "الملف الشخصي والهوية" },
  "settings.security": { en: "Security & sessions", ar: "الأمان والجلسات" },
  "settings.appearance": { en: "Appearance & language", ar: "المظهر واللغة" },
};

const coreArabic = new Map<string, string>([
  ["Dashboard", "لوحة التحكم"], ["Workspace", "مساحة العمل"], ["Settings", "الإعدادات"], ["Notifications", "الإشعارات"],
  ["Medical Student", "طالب طب"], ["Instructor", "المحاضر"], ["System Administrator", "مسؤول النظام"],
  ["My Bundles", "حُزمي التعليمية"], ["Bundles", "الحزم التعليمية"], ["Flashcards", "البطاقات التعليمية"], ["Notebook", "دفتر الملاحظات"],
  ["Study Guides", "أدلة المذاكرة"], ["Analytics", "التحليلات"], ["Analytics Dashboard", "لوحة التحليلات"], ["Study Plan", "خطة المذاكرة"],
  ["Overview", "نظرة عامة"], ["Courses", "المقررات"], ["Questions", "الأسئلة"], ["Assessments", "الاختبارات"], ["Grading", "التصحيح"],
  ["Users", "المستخدمون"], ["Academics", "الهيكل الأكاديمي"], ["Audit", "سجل التدقيق"], ["Resources", "الموارد"],
  ["Studio", "الاستوديو"], ["Mock Exams", "الاختبارات التجريبية"], ["Essay Cases", "حالات المقال السريري"], ["Rounds", "الجولات"],
  ["Question Bank", "بنك الأسئلة"], ["Question Banks", "بنوك الأسئلة"], ["Course Studio", "استوديو المقرر"],
  ["Help", "المساعدة"], ["Achievements", "الإنجازات"], ["Progress", "التقدم"],
  ["Search", "بحث"], ["Refresh", "تحديث"], ["Refreshing", "جارٍ التحديث"], ["Retry", "إعادة المحاولة"], ["Save", "حفظ"], ["Cancel", "إلغاء"],
  ["Close", "إغلاق"], ["Delete", "حذف"], ["Edit", "تعديل"], ["Create", "إنشاء"], ["Continue", "متابعة"], ["Previous", "السابق"], ["Next", "التالي"],
  ["Light", "فاتح"], ["Dark", "داكن"], ["System", "النظام"], ["Theme", "المظهر"], ["Language", "اللغة"], ["Log out", "تسجيل الخروج"], ["Subscription", "الاشتراك"],
  ["Mark all read", "تحديد الكل كمقروء"], ["View all notifications", "عرض كل الإشعارات"], ["No notifications yet.", "لا توجد إشعارات بعد."],
  ["Active", "نشط"], ["Inactive", "غير نشط"], ["Draft", "مسودة"], ["Published", "منشور"], ["Archived", "مؤرشف"], ["Submitted", "تم التسليم"],
  ["Open menu", "فتح القائمة"], ["Close menu", "إغلاق القائمة"], ["Close navigation", "إغلاق التنقل"],
  ["Primary navigation", "التنقل الأساسي"], ["Workspace tools", "أدوات مساحة العمل"], ["Notification preview", "معاينة الإشعارات"],
  ["Loading notification preview", "جارٍ تحميل معاينة الإشعارات"], ["Loading your workspace", "جارٍ تحميل مساحة العمل"],
  ["Could not mark notifications as read", "تعذر تحديد الإشعارات كمقروءة"], ["Log out?", "هل تريد تسجيل الخروج؟"],
  ["Your current session on this device will end. Unsaved form changes may be lost.", "ستنتهي جلستك الحالية على هذا الجهاز. قد تُفقد التغييرات غير المحفوظة."],
  ["Open command palette", "فتح لوحة الأوامر"], ["Open contextual help", "فتح دليل المساعدة"],
  ["Search your hard questions", "ابحث في أسئلتك الصعبة"], ["Search commands and pages", "ابحث في الأوامر والصفحات"],
  ["Search cases, topics, or concepts", "ابحث في الحالات أو الموضوعات أو المفاهيم"],
  ["Search courses, weeks, or lectures", "ابحث في المقررات أو الأسابيع أو المحاضرات"],
  ["Search assessments and questions", "ابحث في الاختبارات والأسئلة"],
  ["Search essay practice", "ابحث في تدريب المقال"], ["Search essay lectures", "ابحث في محاضرات المقال"],
  ["Search structures", "بحث في التراكيب التشريحية"], ["Search 3D structures…", "ابحث في التراكيب ثلاثية الأبعاد…"],
  ["TODAY'S FOCUS", "تركيز اليوم"], ["TODAY’S FOCUS", "تركيز اليوم"], ["You're building clinical expertise every day.", "أنت تبني خبرتك السريرية كل يوم."],
  ["Your focus will appear after you open your first course.", "سيظهر تركيزك بعد فتح أول مقرر."], ["Clinical Momentum", "التقدم السريري"],
  ["Your progress at a glance", "ملخص تقدمك"], ["Questions answered", "الأسئلة المُجابة"], ["All time", "منذ البداية"],
  ["Study streak", "سلسلة المذاكرة"], ["Built from completed plan sessions", "محسوبة من جلسات الخطة المكتملة"],
  ["Complete today's session to begin", "أكمل جلسة اليوم لبدء السلسلة"], ["Complete today’s session to begin", "أكمل جلسة اليوم لبدء السلسلة"],
  ["Retention", "الاحتفاظ بالمعلومة"], ["Question accuracy", "دقة الإجابات"], ["Study hours", "ساعات المذاكرة"],
  ["Completed scheduled sessions", "الجلسات المجدولة المكتملة"], ["Your Progress", "تقدمك"], ["Upcoming Sessions & Deadlines", "الجلسات والمواعيد القادمة"],
  ["View assessments", "عرض الاختبارات"], ["Today's Plan", "خطة اليوم"], ["Today’s Plan", "خطة اليوم"], ["View full plan", "عرض الخطة كاملة"],
  ["No sessions scheduled for today", "لا توجد جلسات مجدولة لليوم"], ["No sessions scheduled for today.", "لا توجد جلسات مجدولة لليوم."],
  ["Use Study Plan to add or generate sessions.", "استخدم خطة المذاكرة لإضافة جلسات أو توليدها."], ["Topic Mastery", "إتقان الموضوعات"],
  ["View all courses", "عرض كل المقررات"], ["Spaced Repetition Due", "المراجعة المتباعدة المستحقة"], ["Review queue", "قائمة المراجعة"],
  ["Due now", "مستحق الآن"], ["Mastered", "متقن"], ["Reviewed", "تمت مراجعته"], ["Cards due for review", "بطاقات مستحقة للمراجعة"],
  ["Continue Learning", "تابع التعلم"], ["Professor's Pearls", "لآلئ الأستاذ"], ["Professor’s Pearls", "لآلئ الأستاذ"], ["More pearls", "المزيد من اللآلئ"],
  ["Weekly Activity", "النشاط الأسبوعي"], ["Completed plan items", "عناصر الخطة المكتملة"], ["Open analytics", "فتح التحليلات"],
  ["RESUME WHERE YOU LEFT OFF", "تابع من حيث توقفت"], ["Resume", "متابعة"], ["Dismiss resume suggestion", "إخفاء اقتراح المتابعة"],
  ["Curriculum", "المحتوى الدراسي"], ["Past Exams", "الاختبارات السابقة"], ["Course content", "محتوى المقرر"],
  ["Expand all", "توسيع الكل"], ["Collapse all", "طي الكل"], ["Read only", "للقراءة فقط"], ["Enroll", "الانضمام"], ["Join bundle", "الانضمام إلى الحزمة"],
  ["Lectures", "المحاضرات"], ["Weeks", "الأسابيع"],
  ["Review session", "جلسة المراجعة"], ["Show answer", "إظهار الإجابة"], ["Again", "مرة أخرى"], ["Hard", "صعب"], ["Good", "جيد"], ["Easy", "سهل"],
  ["Pause", "إيقاف مؤقت"], ["Shuffle", "خلط"], ["Fullscreen", "ملء الشاشة"], ["Exit fullscreen", "الخروج من ملء الشاشة"],
  ["Session complete", "اكتملت الجلسة"], ["Start over", "البدء من جديد"], ["Continue session", "متابعة الجلسة"], ["Question", "السؤال"], ["Answer", "الإجابة"],
  ["Session breakdown", "ملخص الجلسة"], ["How review works", "كيف تعمل المراجعة"], ["DUE QUEUE", "قائمة الاستحقاق"], ["Next review", "المراجعة التالية"],
  ["Collections", "المجموعات"], ["Explanations", "الشروحات"], ["Total notes", "إجمالي الملاحظات"], ["New note", "ملاحظة جديدة"],
  ["Recently updated", "تم تحديثها مؤخرًا"], ["Select visible", "تحديد الظاهر"], ["LIBRARY", "المكتبة"], ["TAGS", "الوسوم"],
  ["PERSONAL", "شخصي"], ["PEARL", "لؤلؤة"], ["Untitled note", "ملاحظة بدون عنوان"], ["Saved", "محفوظ"], ["Unsaved changes", "تغييرات غير محفوظة"],
  ["Readiness score", "درجة الجاهزية"], ["Accuracy", "الدقة"], ["Flashcard mastery", "إتقان البطاقات"], ["Curriculum completion", "إكمال المحتوى الدراسي"],
  ["Consistency", "الاستمرارية"], ["Recommendations", "التوصيات"], ["Why this changed", "لماذا تغير هذا؟"], ["Previous period", "الفترة السابقة"],
  ["Generate plan", "توليد الخطة"], ["Preview plan", "معاينة الخطة"], ["Accept plan", "اعتماد الخطة"], ["Regenerate", "إعادة التوليد"],
  ["Adjust intensity", "تعديل الكثافة"], ["Lock session", "تثبيت الجلسة"], ["Unlock session", "إلغاء تثبيت الجلسة"], ["Duration", "المدة"],
  ["Instructor dashboard", "لوحة المحاضر"], ["Administration dashboard", "لوحة الإدارة"], ["LIVE WORKSPACE", "مساحة عمل مباشرة"],
  ["All totals below come from current database records.", "كل الأرقام أدناه مأخوذة من بيانات النظام الحالية."],
  ["Course studio", "استوديو المقرر"], ["Question bank", "بنك الأسئلة"], ["Assessment builder", "منشئ الاختبارات"], ["Essay grading", "تصحيح الأسئلة المقالية"],
  ["Flashcard studio", "استوديو البطاقات"], ["User administration", "إدارة المستخدمين"], ["Academic structure", "الهيكل الأكاديمي"], ["Audit trail", "سجل التدقيق"],
  ["You are already signed in on another device. Sign out on that device to continue, or contact an administrator to release your session.", "أنت مسجّل الدخول بالفعل على جهاز آخر. سجّل الخروج من ذلك الجهاز للمتابعة، أو تواصل مع مسؤول النظام لتحرير جلستك."],
]);

function dynamicArabic(core: string): string | null {
  let match = core.match(/^Welcome back,\s*(.+)$/i);
  if (match) return `مرحبًا بعودتك، ${match[1]}`;
  match = core.match(/^Continue\s+(.+):\s*(\d+)\s+of\s+(\d+)\s+lectures completed\.?$/i);
  if (match) return `تابع ${match[1]}: اكتملت ${match[2]} من ${match[3]} محاضرات.`;
  match = core.match(/^(\d+)%\s+complete$/i);
  if (match) return `مكتمل بنسبة ${match[1]}%`;
  match = core.match(/^(\d+)%\s+accuracy$/i);
  if (match) return `دقة ${match[1]}%`;
  match = core.match(/^Level\s+(\d+)\s+Clinical Learner$/i);
  if (match) return `المستوى ${match[1]} · متعلم سريري`;
  match = core.match(/^Level\s+(\d+)$/i);
  if (match) return `المستوى ${match[1]}`;
  match = core.match(/^(\d+)\s*\/\s*100\s*XP$/i);
  if (match) return `${match[1]} / 100 نقطة خبرة`;
  match = core.match(/^(\d+)\s*\/\s*100\s*XP\s+to\s+next\s+level$/i);
  if (match) return `${match[1]} / 100 نقطة خبرة للمستوى التالي`;
  match = core.match(/^(\d+)\s+of\s+100\s*XP\s+toward\s+the\s+next\s+level$/i);
  if (match) return `${match[1]} من 100 نقطة خبرة نحو المستوى التالي`;
  match = core.match(/^(\d+)\s+lectures?\s+completed$/i);
  if (match) return `اكتملت ${match[1]} محاضرة`;
  match = core.match(/^(\d+)\s+cards?\s+due for review$/i);
  if (match) return `${match[1]} بطاقة مستحقة للمراجعة`;
  match = core.match(/^(\d+)\s+cards?\s+reviewed overall$/i);
  if (match) return `تمت مراجعة ${match[1]} بطاقة إجمالًا`;
  match = core.match(/^(\d+)\s+questions?$/i);
  if (match) return `${match[1]} سؤال`;
  match = core.match(/^(\d+)\s+attempts?$/i);
  if (match) return `${match[1]} محاولة`;
  match = core.match(/^(\d+)\s+resources?$/i);
  if (match) return `${match[1]} مورد`;
  match = core.match(/^(\d+)\s+weeks?$/i);
  if (match) return `${match[1]} أسبوع`;
  match = core.match(/^(\d+)\s+days?$/i);
  if (match) return `${match[1]} يوم`;
  match = core.match(/^(\d+(?:\.\d+)?)\s+hrs?$/i);
  if (match) return `${match[1]} ساعة`;
  match = core.match(/^(\d+)\s+min$/i);
  if (match) return `${match[1]} دقيقة`;
  match = core.match(/^Week\s+(\d+)$/i);
  if (match) return `الأسبوع ${match[1]}`;
  match = core.match(/^Lecture\s+(\d+)$/i);
  if (match) return `المحاضرة ${match[1]}`;
  match = core.match(/^Year\s+(\d+)$/i);
  if (match) return `السنة ${match[1]}`;

  // Semesters & Years
  match = core.match(/^Semester\s+(\d+)\s*\((?:Year|السنة)\s*(\d+)\)$/i);
  if (match) return `الفصل الدراسي ${match[1]} (السنة ${match[2]})`;
  match = core.match(/^Semester\s+(\d+)$/i);
  if (match) return `الفصل الدراسي ${match[1]}`;
  match = core.match(/^Bundle access\s*\((?:Semester|الفصل الدراسي)\s*(\d+)\)$/i);
  if (match) return `وصول الحزمة (الفصل الدراسي ${match[1]})`;
  match = core.match(/^(?:·\s*)?Semester\s+(\d+)$/i);
  if (match) return `الفصل الدراسي ${match[1]}`;

  // Questions & Navigation
  match = core.match(/^Question\s+(\d+)\s+of\s+(\d+)$/i);
  if (match) return `السؤال ${match[1]} من ${match[2]}`;
  match = core.match(/^QUESTION\s+(\d+)\s+OF\s+(\d+)$/i);
  if (match) return `السؤال ${match[1]} من ${match[2]}`;
  match = core.match(/^Block\s+(\d+)\s+of\s+(\d+)$/i);
  if (match) return `القسم ${match[1]} من ${match[2]}`;
  match = core.match(/^Q(\d+)$/i);
  if (match) return `س${match[1]}`;
  match = core.match(/^Question\s+(\d+)$/i);
  if (match) return `السؤال ${match[1]}`;

  // Answered / Count / Ratio
  match = core.match(/^(\d+)\s+answered\s+of\s+(\d+)$/i);
  if (match) return `تمت الإجابة على ${match[1]} من ${match[2]}`;
  match = core.match(/^(\d+)\s*\/\s*(\d+)\s+answered$/i);
  if (match) return `${match[1]} / ${match[2]} مُجاب`;
  match = core.match(/^(\d+)\s*\/\s*(\d+)\s+ready to publish$/i);
  if (match) return `${match[1]} / ${match[2]} جاهز للنشر`;
  match = core.match(/^(\d+)\s*\/\s*(\d+)\s+submitted$/i);
  if (match) return `${match[1]} / ${match[2]} تم تسليمها`;
  match = core.match(/^(\d+)\s*\/\s*(\d+)\s+questions$/i);
  if (match) return `${match[1]} / ${match[2]} سؤال`;
  match = core.match(/^(\d+)\s+accounts$/i);
  if (match) return `${match[1]} حساب`;
  match = core.match(/^(\d+)\s+questions\s+answered$/i);
  if (match) return `تمت الإجابة على ${match[1]} سؤال`;
  match = core.match(/^(\d+)\s+of\s+(\d+)\s+lectures$/i);
  if (match) return `${match[1]} من ${match[2]} محاضرات`;
  match = core.match(/^(\d+)\s+of\s+(\d+)\s+lectures completed\.?$/i);
  if (match) return `اكتملت ${match[1]} من ${match[2]} محاضرات`;

  // Notifications & Achievements badges
  match = core.match(/^(\d+)\s+unread\s+notifications$/i);
  if (match) return `${match[1]} إشعارات غير مقروءة`;
  match = core.match(/^(\d+)\s+unread\s+in\s+preview$/i);
  if (match) return `${match[1]} غير مقروء في المعاينة`;
  match = core.match(/^(\d+)\s+unlocked\s+achievements$/i);
  if (match) return `${match[1]} إنجازات مفتوحة`;

  // Confirmation dialogs
  match = core.match(/^This block still has\s+(\d+)\s+unanswered questions?\. Move to the next block\?$/i);
  if (match) return `لا يزال هذا القسم يحتوي على ${match[1]} سؤال غير مُجاب. هل تريد الانتقال إلى القسم التالي؟`;
  match = core.match(/^Submit this assessment with\s+(\d+)\s+of\s+(\d+)\s+questions answered\?$/i);
  if (match) return `هل تريد تسليم هذا الاختبار مع الإجابة على ${match[1]} من ${match[2]} سؤال؟`;

  // Practice & Question pools
  match = core.match(/^Start a 40-MCQ (Timed|Tutor) quiz$/i);
  if (match) return `ابدأ اختبارًا من 40 سؤال اختيار من متعدد (${match[1].toLowerCase() === "timed" ? "محدد بوقت" : "معلم"})`;
  match = core.match(/^Need\s+(\d+)\s+more eligible MCQs$/i);
  if (match) return `يلزم ${match[1]} سؤال اختيار من متعدد إضافي`;
  match = core.match(/^Need\s+(\d+)\s+more essay questions$/i);
  if (match) return `يلزم ${match[1]} أسئلة مقالية إضافية`;
  match = core.match(/^Week\s+(\d+)\s*·\s*(\d+)\s+eligible MCQs$/i);
  if (match) return `الأسبوع ${match[1]} · ${match[2]} سؤال اختيار من متعدد مؤهل`;
  match = core.match(/^(\d+)\s+eligible MCQs\s*·\s*(\d+)\s+decks$/i);
  if (match) return `${match[1]} سؤال اختيار من متعدد مؤهل · ${match[2]} مجموعة بطاقات`;
  match = core.match(/^(\d+)\s+eligible essay questions from the selected lectures\.?$/i);
  if (match) return `${match[1]} أسئلة مقالية مؤهلة من المحاضرات المحددة.`;
  match = core.match(/^(\d+)\s+essay questions are currently available in this course\.?$/i);
  if (match) return `${match[1]} سؤال مقالي متاح حاليًا في هذا المقرر.`;
  match = core.match(/^(\d+)\s+blocking issues?$/i);
  if (match) return `${match[1]} مشكلة تمنع النشر`;
  match = core.match(/^(\d+)\s+questions\s*·\s*(\d+)\s+marks$/i);
  if (match) return `${match[1]} سؤال · ${match[2]} درجة`;
  match = core.match(/^(\d+)\s+questions\s*·\s*(\d+)\s+minutes$/i);
  if (match) return `${match[1]} سؤال · ${match[2]} دقيقة`;
  match = core.match(/^(\d+)\s+marks$/i);
  if (match) return `${match[1]} درجات`;
  match = core.match(/^(\d+)\s+words$/i);
  if (match) return `${match[1]} كلمة`;
  match = core.match(/^Minimum\s+(\d+)$/i);
  if (match) return `الحد الأدنى ${match[1]}`;

  // Question editing / options
  match = core.match(/^Enter option\s+([A-Z0-9])\s+text…$/i);
  if (match) return `أدخل نص الخيار ${match[1]}…`;
  match = core.match(/^Mark option\s+([A-Z0-9])\s+as correct$/i);
  if (match) return `تحديد الخيار ${match[1]} كإجابة صحيحة`;
  match = core.match(/^Delete option\s+([A-Z0-9])$/i);
  if (match) return `حذف الخيار ${match[1]}`;
  match = core.match(/^Option\s+([A-Z0-9])$/i);
  if (match) return `الخيار ${match[1]}`;
  match = core.match(/^Source page\s+(\d+)$/i);
  if (match) return `صفحة المصدر ${match[1]}`;
  match = core.match(/^Possible duplicate\s*·\s*(\d+)%$/i);
  if (match) return `احتمال تطابق · ${match[1]}%`;
  match = core.match(/^Parse\s+(\d+)%$/i);
  if (match) return `الاستخراج ${match[1]}%`;
  match = core.match(/^Topic\s+(\d+)%$/i);
  if (match) return `الموضوع ${match[1]}%`;

  // Search & Anatomy
  match = core.match(/^Search\s+(\d+)\s+structures…$/i);
  if (match) return `بحث في ${match[1]} تركيبًا…`;
  match = core.match(/^No structures match\s*[“"'](.+?)[”"']\.?$/i);
  if (match) return `لا توجد تراكيب تطابق "${match[1]}".`;
  match = core.match(/^Resume\s+(.+)$/i);
  if (match) return `متابعة ${match[1]}`;

  match = core.match(/^Last opened\s+(\d+)(m|h|d)\s+ago$/i);
  if (match) {
    const unit = match[2].toLowerCase() === "m" ? "دقيقة" : match[2].toLowerCase() === "h" ? "ساعة" : "يوم";
    return `آخر فتح منذ ${match[1]} ${unit}`;
  }
  return extraArabicPattern(core);
}

export function translateArabicText(value: string): string {
  if (!/[A-Za-z]/.test(value)) return value;
  const leading = value.match(/^\s*/)?.[0] || "";
  const trailing = value.match(/\s*$/)?.[0] || "";
  const core = value.trim();
  if (!core) return value;
  const exact = coreArabic.get(core) || pageArabic.get(core) || workspaceArabic.get(core) || extraArabic.get(core);
  if (exact) return `${leading}${exact}${trailing}`;
  const dynamic = dynamicArabic(core);
  if (dynamic) return `${leading}${dynamic}${trailing}`;
  return value;
}

function canTranslate(element: Element | null): boolean {
  if (!element) return false;
  if (element.closest("[data-no-auto-translate],[data-academic-content]")) return false;
  return !["SCRIPT", "STYLE", "CODE", "PRE", "NOSCRIPT"].includes(element.tagName);
}

function sourceForText(node: Text): string {
  const current = node.nodeValue || "";
  const remembered = originalText.get(node);
  if (remembered === undefined) {
    originalText.set(node, current);
    return current;
  }
  const translatedRemembered = translateArabicText(remembered);
  if (current !== remembered && current !== translatedRemembered) {
    originalText.set(node, current);
    return current;
  }
  return remembered;
}

function translateTextNode(node: Text, locale: AppLocale): void {
  if (!canTranslate(node.parentElement)) return;
  const source = sourceForText(node);
  const next = locale === "ar" ? translateArabicText(source) : source;
  if (node.nodeValue !== next) node.nodeValue = next;
}

function translateAttributes(element: Element, locale: AppLocale): void {
  if (!canTranslate(element)) return;
  let remembered = originalAttributes.get(element);
  if (!remembered) {
    remembered = new Map<string, string>();
    originalAttributes.set(element, remembered);
  }
  for (const attribute of translatableAttributes) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const stored = remembered.get(attribute);
    const translatedStored = stored ? translateArabicText(stored) : null;
    if (!stored || (current !== stored && current !== translatedStored)) remembered.set(attribute, current);
    const source = remembered.get(attribute) || current;
    const next = locale === "ar" ? translateArabicText(source) : source;
    if (current !== next) element.setAttribute(attribute, next);
  }
}

function translateTree(root: Node, locale: AppLocale): void {
  if (root instanceof Text) translateTextNode(root, locale);
  if (root instanceof Element) translateAttributes(root, locale);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) translateTextNode(walker.currentNode as Text, locale);
  if (root instanceof Element || root instanceof DocumentFragment) {
    const container = root as ParentNode;
    for (const element of container.querySelectorAll?.("[placeholder],[title],[aria-label]") || []) translateAttributes(element, locale);
  }
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
    translateTree(document.body, locale);
    if (locale !== "ar") return;
    const pending = new Set<Node>();
    let frame = 0;
    const flush = () => {
      frame = 0;
      for (const node of pending) translateTree(node, "ar");
      pending.clear();
    };
    const schedule = (node: Node) => {
      pending.add(node);
      if (!frame) frame = window.requestAnimationFrame(flush);
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") schedule(record.target);
        else for (const node of record.addedNodes) schedule(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [locale]);

  const translate = useCallback((value: string) => locale === "ar" ? translateArabicText(value) : value, [locale]);
  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    toggleLocale: () => setLocale(locale === "ar" ? "en" : "ar"),
    t: (key, fallback) => strings[key]?.[locale] || fallback || key,
    translate,
  }), [locale, setLocale, translate]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}

const LANGUAGE_OPTIONS: { value: AppLocale; avatar: string; native: string; hint: { en: string; ar: string } }[] = [
  { value: "en", avatar: "EN", native: "English", hint: { en: "Default interface language", ar: "لغة الواجهة الافتراضية" } },
  { value: "ar", avatar: "ع", native: "العربية", hint: { en: "Right-to-left interface", ar: "واجهة من اليمين إلى اليسار" } },
];

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  return <div className="language-switcher" role="group" aria-label={locale === "ar" ? "اللغة" : "Language"}>
    {LANGUAGE_OPTIONS.map((option) => {
      const active = locale === option.value;
      return <button
        key={option.value}
        type="button"
        className={active ? "active" : ""}
        onClick={() => setLocale(option.value)}
        aria-pressed={active}
      >
        <span className="language-avatar" aria-hidden="true">{option.avatar}</span>
        <span className="language-copy">
          <b>{option.native}</b>
          <small>{locale === "ar" ? option.hint.ar : option.hint.en}</small>
        </span>
        <span className="language-check" aria-hidden="true">{active && <FiCheck />}</span>
      </button>;
    })}
  </div>;
}
