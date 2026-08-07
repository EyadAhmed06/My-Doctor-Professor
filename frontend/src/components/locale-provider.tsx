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
  ["Dashboard", "لوحة التحكم"], ["Workspace", "مساحة العمل"], ["Settings", "الإعدادات"], ["Profile", "الملف الشخصي"], ["Notifications", "الإشعارات"],
  ["Medical Student", "طالب طب"], ["Instructor", "المحاضر"], ["System Administrator", "مسؤول النظام"],
  ["My Bundles", "حُزمي التعليمية"], ["Bundles", "الحزم التعليمية"], ["Flashcards", "البطاقات التعليمية"], ["Notebook", "دفتر الملاحظات"],
  ["Study Guides", "أدلة المذاكرة"], ["Analytics", "التحليلات"], ["Analytics Dashboard", "لوحة التحليلات"], ["Study Plan", "خطة المذاكرة"],
  ["Overview", "نظرة عامة"], ["Courses", "المقررات"], ["Questions", "الأسئلة"], ["Assessments", "الاختبارات"],
  ["Grading", "التصحيح"], ["Users", "المستخدمون"], ["Academics", "الهيكل الأكاديمي"], ["Audit", "سجل التدقيق"],
  ["Search", "بحث"], ["Refresh", "تحديث"], ["Retry", "إعادة المحاولة"], ["Save", "حفظ"], ["Cancel", "إلغاء"], ["Close", "إغلاق"],
  ["Delete", "حذف"], ["Edit", "تعديل"], ["Create", "إنشاء"], ["Continue", "متابعة"], ["Previous", "السابق"], ["Next", "التالي"],
  ["Light", "فاتح"], ["Dark", "داكن"], ["System", "النظام"], ["Theme", "المظهر"], ["Language", "اللغة"],
  ["Log out", "تسجيل الخروج"], ["Logging out…", "جارٍ تسجيل الخروج…"], ["Mark all read", "تحديد الكل كمقروء"], ["View all notifications", "عرض كل الإشعارات"],
  ["Open workflow", "فتح سير العمل"], ["No notifications yet.", "لا توجد إشعارات بعد."], ["No questions", "لا توجد أسئلة"],
  ["No resources published yet", "لا توجد موارد منشورة بعد"], ["No matching resources", "لا توجد موارد مطابقة"],
  ["Mark complete", "تحديد كمكتمل"], ["Completed", "مكتمل"], ["Complete", "مكتمل"], ["Preview", "معاينة"], ["Open file", "فتح الملف"],
  ["Full name", "الاسم الكامل"], ["Phone number", "رقم الهاتف"], ["Date of birth", "تاريخ الميلاد"], ["Gender", "النوع"],
  ["Current password", "كلمة المرور الحالية"], ["New password", "كلمة المرور الجديدة"], ["Change password", "تغيير كلمة المرور"],
  ["Email", "البريد الإلكتروني"], ["Role", "الدور"], ["Status", "الحالة"], ["Active", "نشط"], ["Inactive", "غير نشط"], ["Draft", "مسودة"],
  ["Published", "منشور"], ["Archived", "مؤرشف"], ["Submitted", "تم التسليم"], ["SUBMITTED", "تم التسليم"], ["Pending", "قيد الانتظار"],
  ["Resources", "الموارد"], ["Lecture resources", "موارد المحاضرة"], ["Course studio", "استوديو المقرر"],
  ["Question bank", "بنك الأسئلة"], ["Assessment builder", "منشئ الاختبارات"], ["Essay grading", "تصحيح الأسئلة المقالية"],
  ["Flashcard studio", "استوديو البطاقات"], ["User administration", "إدارة المستخدمين"], ["Academic structure", "الهيكل الأكاديمي"],
  ["Audit trail", "سجل التدقيق"], ["Loading settings…", "جارٍ تحميل الإعدادات…"], ["Loading assessment…", "جارٍ تحميل الاختبار…"],
  ["Identity", "الهوية"], ["Security", "الأمان"], ["Appearance & language", "المظهر واللغة"], ["Profile & identity", "الملف الشخصي والهوية"],
  ["Security & sessions", "الأمان والجلسات"], ["Email verification", "تأكيد البريد الإلكتروني"], ["Verified", "مؤكد"], ["Not verified", "غير مؤكد"],
  ["Active sessions", "الجلسات النشطة"], ["This browser", "هذا المتصفح"], ["Active session", "جلسة نشطة"], ["Current", "الحالية"],
  ["Google identity", "حساب Google المرتبط"], ["Not linked", "غير مرتبط"], ["Sign out other sessions", "تسجيل خروج الجلسات الأخرى"], ["Signing out…", "جارٍ تسجيل الخروج…"],
  ["Save profile", "حفظ الملف الشخصي"], ["Saving…", "جارٍ الحفظ…"], ["Discard", "تجاهل التغييرات"], ["Profile picture URL", "رابط صورة الملف الشخصي"],
  ["Not set", "غير محدد"], ["Male", "ذكر"], ["Female", "أنثى"], ["Reduce motion", "تقليل الحركة"], ["Caps Lock is on.", "زر Caps Lock مفعّل."],
  ["At least 12 characters", "12 حرفًا على الأقل"], ["Lowercase letter", "حرف إنجليزي صغير"], ["Uppercase letter", "حرف إنجليزي كبير"], ["Number", "رقم"],
  ["Resource upload", "رفع الموارد"], ["Destination", "الوجهة"], ["Course", "المقرر"], ["Lecture", "المحاضرة"], ["Upload managed file", "رفع ملف مُدار"],
  ["Resource name", "اسم المورد"], ["Description", "الوصف"], ["Upload resource", "رفع المورد"], ["Uploading…", "جارٍ الرفع…"], ["Lecture is published", "المحاضرة منشورة"],
  ["No resources in this lecture", "لا توجد موارد في هذه المحاضرة"], ["Keyboard shortcuts", "اختصارات لوحة المفاتيح"], ["Command navigation manual", "دليل الأوامر والاختصارات"],
  ["Global navigation", "التنقل العام"], ["Command palette", "لوحة الأوامر"], ["Learning workspaces", "مساحات التعلم"], ["Keyboard rules", "قواعد لوحة المفاتيح"],
  ["Open command palette", "فتح لوحة الأوامر"], ["Search pages and actions…", "ابحث في الصفحات والأوامر…"], ["No matching workspace action.", "لا يوجد أمر مطابق."],
  ["Open study guides", "فتح أدلة المذاكرة"], ["Open settings", "فتح الإعدادات"], ["Upload lecture resources", "رفع موارد المحاضرة"],
  ["Resource preview unavailable", "معاينة المورد غير متاحة"], ["Loading protected resource", "جارٍ تحميل المورد المحمي"], ["Download file", "تنزيل الملف"], ["Open original", "فتح المصدر"],

  ["TODAY'S FOCUS", "تركيز اليوم"], ["TODAY’S FOCUS", "تركيز اليوم"], ["You're building clinical expertise every day.", "أنت تبني خبرتك السريرية كل يوم."],
  ["Clinical Momentum", "التقدم السريري"], ["Your progress at a glance", "ملخص تقدمك"], ["Questions answered", "الأسئلة المُجابة"],
  ["All time", "منذ البداية"], ["Study streak", "سلسلة المذاكرة"], ["Complete today's session to begin", "أكمل جلسة اليوم لبدء السلسلة"],
  ["Complete today’s session to begin", "أكمل جلسة اليوم لبدء السلسلة"], ["Retention", "الاحتفاظ بالمعلومة"], ["Question accuracy", "دقة الإجابات"],
  ["Study hours", "ساعات المذاكرة"], ["Completed scheduled sessions", "الجلسات المجدولة المكتملة"], ["Your Progress", "تقدمك"],
  ["Clinical Learner", "متعلم سريري"], ["Upcoming Sessions & Deadlines", "الجلسات والمواعيد القادمة"], ["View assessments", "عرض الاختبارات"],
  ["Today's Plan", "خطة اليوم"], ["Today’s Plan", "خطة اليوم"], ["View full plan", "عرض الخطة كاملة"], ["No sessions scheduled for today.", "لا توجد جلسات مجدولة لليوم."],
  ["No sessions scheduled for today", "لا توجد جلسات مجدولة لليوم"], ["Use Study Plan to add or generate sessions.", "استخدم خطة المذاكرة لإضافة جلسات أو توليدها."],
  ["Topic Mastery", "إتقان الموضوعات"], ["View all courses", "عرض كل المقررات"], ["Spaced Repetition Due", "المراجعة المتباعدة المستحقة"],
  ["Review queue", "قائمة المراجعة"], ["Due now", "مستحق الآن"], ["Mastered", "متقن"], ["Reviewed", "تمت مراجعته"],
  ["Cards due for review", "بطاقات مستحقة للمراجعة"], ["cards reviewed overall", "إجمالي البطاقات التي تمت مراجعتها"], ["Continue Learning", "تابع التعلم"],
  ["Professor's Pearls", "لآلئ الأستاذ"], ["Professor’s Pearls", "لآلئ الأستاذ"], ["More pearls", "المزيد من اللآلئ"], ["Weekly Activity", "النشاط الأسبوعي"],
  ["Completed plan items", "عناصر الخطة المكتملة"], ["Open analytics", "فتح التحليلات"], ["Next best action", "أفضل خطوة تالية"],
  ["Clear your due review queue", "أنهِ قائمة المراجعة المستحقة"], ["Open your first bundle", "افتح أول حزمة تعليمية"], ["Loading your dashboard", "جارٍ تحميل لوحة التحكم"],
  ["RESUME WHERE YOU LEFT OFF", "تابع من حيث توقفت"], ["Resume recent work", "متابعة العمل الأخير"], ["Resume", "متابعة"], ["Dismiss resume suggestion", "إخفاء اقتراح المتابعة"],

  ["Bundle curriculum", "محتوى الحزمة"], ["Curriculum", "المحتوى الدراسي"], ["Course content", "محتوى المقرر"], ["Expand all", "توسيع الكل"], ["Collapse all", "طي الكل"],
  ["Guide and resources", "الدليل والموارد"], ["Read only", "للقراءة فقط"], ["Enroll", "الانضمام"], ["Join bundle", "الانضمام إلى الحزمة"],
  ["Search lecture guides", "ابحث في أدلة المحاضرات"], ["Search lectures or resources", "ابحث في المحاضرات أو الموارد"], ["Resume last resource", "متابعة آخر مورد"],
  ["Your lecture progress", "تقدمك في المحاضرة"], ["No resource checklist yet", "لا توجد قائمة موارد بعد"], ["Published by your instructor", "منشور بواسطة المحاضر"],
  ["Previous lecture", "المحاضرة السابقة"], ["Next incomplete lecture", "المحاضرة غير المكتملة التالية"], ["Course complete", "اكتمل المقرر"],
  ["Select a lecture", "اختر محاضرة"], ["No lecture matches this search.", "لا توجد محاضرة مطابقة للبحث."], ["No course progress yet.", "لا يوجد تقدم في المقررات بعد."],

  ["Review session", "جلسة المراجعة"], ["Show answer", "إظهار الإجابة"], ["Again", "مرة أخرى"], ["Hard", "صعب"], ["Good", "جيد"], ["Easy", "سهل"],
  ["Pause", "إيقاف مؤقت"], ["Shuffle", "خلط"], ["Fullscreen", "ملء الشاشة"], ["Exit fullscreen", "الخروج من ملء الشاشة"],
  ["Session complete", "اكتملت الجلسة"], ["Start over", "البدء من جديد"], ["Continue session", "متابعة الجلسة"], ["Question", "السؤال"], ["Answer", "الإجابة"],
  ["Weakest topics", "أضعف الموضوعات"], ["Next review", "المراجعة التالية"],

  ["STRUCTURED NOTE EDITOR", "محرر الملاحظات المنظم"], ["Untitled note", "ملاحظة بدون عنوان"], ["Saved", "محفوظ"], ["Unsaved changes", "تغييرات غير محفوظة"],
  ["Recovered local draft", "تم استرجاع مسودة محلية"], ["Versions", "الإصدارات"], ["Note properties", "خصائص الملاحظة"], ["Type", "النوع"],
  ["Collection", "المجموعة"], ["Unfiled", "غير مصنف"], ["Favorited", "ضمن المفضلة"], ["Add to favorites", "إضافة إلى المفضلة"],
  ["Marked as pearl", "محددة كلؤلؤة"], ["Mark as pearl", "تحديد كلؤلؤة"], ["Tags", "الوسوم"], ["Attachments", "المرفقات"], ["Add block", "إضافة كتلة"],
  ["Continue writing…", "تابع الكتابة…"], ["Version history", "سجل الإصدارات"], ["LOCAL SNAPSHOTS", "نسخ محلية"], ["Restore", "استرجاع"],
  ["Add attachment", "إضافة مرفق"], ["Hosted file URL", "رابط الملف المستضاف"], ["Display name", "اسم العرض"], ["MIME type", "نوع MIME"], ["Link attachment", "ربط المرفق"],

  ["Readiness score", "درجة الجاهزية"], ["Accuracy", "الدقة"], ["Flashcard mastery", "إتقان البطاقات"], ["Curriculum completion", "إكمال المحتوى الدراسي"],
  ["Consistency", "الاستمرارية"], ["Recommendations", "التوصيات"], ["Why this changed", "لماذا تغير هذا؟"], ["Last 7 days", "آخر 7 أيام"],
  ["Last 30 days", "آخر 30 يومًا"], ["Semester", "الفصل الدراسي"], ["Custom", "مخصص"], ["Previous period", "الفترة السابقة"],

  ["Generate plan", "توليد الخطة"], ["Preview plan", "معاينة الخطة"], ["Accept plan", "اعتماد الخطة"], ["Regenerate", "إعادة التوليد"],
  ["Adjust intensity", "تعديل الكثافة"], ["Lock session", "تثبيت الجلسة"], ["Unlock session", "إلغاء تثبيت الجلسة"], ["Duration", "المدة"],
  ["Why this session", "لماذا هذه الجلسة؟"], ["Today", "اليوم"], ["Tomorrow", "غدًا"],

  ["INSTRUCTOR · ASSESSMENT BUILDER", "المحاضر · منشئ الاختبارات"], ["ADMIN · ASSESSMENT CONTROL", "الإدارة · التحكم في الاختبارات"],
  ["New assessment", "اختبار جديد"], ["Assessment draft created", "تم إنشاء مسودة الاختبار"], ["Add questions", "إضافة أسئلة"], ["Preview as student", "معاينة كطالب"],
  ["Duplicate", "إنشاء نسخة"], ["Return to draft", "إرجاع إلى مسودة"], ["Publish", "نشر"], ["PUBLISHED", "منشور"], ["DRAFT", "مسودة"],
  ["Publishable", "قابل للنشر"], ["Pre-publish validation", "التحقق قبل النشر"], ["Ready to publish", "جاهز للنشر"], ["Publishing is blocked", "النشر محظور"],
  ["No errors or warnings.", "لا توجد أخطاء أو تحذيرات."], ["Attempts", "المحاولات"], ["All statuses", "كل الحالات"], ["Student preview", "معاينة الطالب"],
  ["STUDENT VIEW · NON-SUBMITTING PREVIEW", "عرض الطالب · معاينة بدون تسليم"], ["No questions to preview", "لا توجد أسئلة للمعاينة"], ["Assessment activity", "نشاط الاختبار"],
  ["Create assessment draft", "إنشاء مسودة اختبار"], ["Title", "العنوان"], ["Passing marks", "درجة النجاح"], ["Available from", "متاح من"], ["Available until", "متاح حتى"],
  ["Attach questions", "إرفاق أسئلة"], ["Search question bank", "بحث في بنك الأسئلة"], ["No available questions", "لا توجد أسئلة متاحة"],
  ["Instructor access required", "يلزم صلاحية محاضر"], ["No assessments yet", "لا توجد اختبارات بعد"], ["Select an assessment", "اختر اختبارًا"],

  ["Instructor dashboard", "لوحة المحاضر"], ["Administration dashboard", "لوحة الإدارة"], ["LIVE WORKSPACE", "مساحة عمل مباشرة"],
  ["Instructor access", "صلاحية المحاضر"], ["System administration", "إدارة النظام"], ["Create course", "إنشاء مقرر"], ["Create question", "إنشاء سؤال"],
  ["Create deck", "إنشاء مجموعة بطاقات"], ["Grade essays", "تصحيح المقالات"], ["Manage users", "إدارة المستخدمين"], ["Assign instructor", "تعيين محاضر"],
  ["Search users", "بحث عن مستخدمين"], ["Search assessments and questions", "بحث في الاختبارات والأسئلة"], ["Search cases, topics, or concepts", "ابحث في الحالات أو الموضوعات أو المفاهيم"],
]);

const fragmentArabic: Array<[string, string]> = [
  ["View assessments", "عرض الاختبارات"], ["View full plan", "عرض الخطة كاملة"], ["View all courses", "عرض كل المقررات"], ["Review queue", "قائمة المراجعة"],
  ["Last opened", "آخر فتح"], ["lectures completed", "محاضرات مكتملة"], ["cards due for review", "بطاقات مستحقة للمراجعة"], ["questions answered", "أسئلة مُجابة"],
  ["minutes", "دقائق"], ["minute", "دقيقة"], ["hours", "ساعات"], ["hour", "ساعة"], ["days", "أيام"], ["day", "يوم"],
];

function translateDynamic(core: string): string | null {
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
  match = core.match(/^(\d+)\s+lectures?\s+completed$/i);
  if (match) return `اكتملت ${match[1]} محاضرة`;
  match = core.match(/^(\d+)\s+cards?\s+due for review$/i);
  if (match) return `${match[1]} بطاقة مستحقة للمراجعة`;
  match = core.match(/^(\d+)\s+cards?\s+reviewed overall$/i);
  if (match) return `تمت مراجعة ${match[1]} بطاقة إجمالًا`;
  match = core.match(/^(\d+)\s+unread in preview$/i);
  if (match) return `${match[1]} غير مقروء في المعاينة`;
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
  match = core.match(/^Week\s+(\d+)\s+(.+)$/i);
  if (match) return `الأسبوع ${match[1]} · ${match[2]}`;
  match = core.match(/^Lecture\s+(\d+)$/i);
  if (match) return `المحاضرة ${match[1]}`;
  match = core.match(/^Year\s+(\d+)$/i);
  if (match) return `السنة ${match[1]}`;
  match = core.match(/^Last opened\s+(\d+)(m|h|d)\s+ago$/i);
  if (match) {
    const unit = match[2].toLowerCase() === "m" ? "دقيقة" : match[2].toLowerCase() === "h" ? "ساعة" : "يوم";
    return `آخر فتح منذ ${match[1]} ${unit}`;
  }
  match = core.match(/^(\d+)\s+selected$/i);
  if (match) return `تم تحديد ${match[1]}`;
  match = core.match(/^Add\s+(\d+)\s+questions?$/i);
  if (match) return `إضافة ${match[1]} سؤال`;
  return null;
}

function translateArabicText(value: string) {
  if (!/[A-Za-z]/.test(value)) return value;
  const leading = value.match(/^\s*/)?.[0] || "";
  const trailing = value.match(/\s*$/)?.[0] || "";
  const core = value.trim();
  if (!core) return value;

  const exact = exactArabic.get(core);
  if (exact) return `${leading}${exact}${trailing}`;

  const arrow = core.match(/^(.*?)(\s*[→←])$/);
  if (arrow) {
    const translatedBody = translateArabicText(arrow[1]).trim();
    if (translatedBody !== arrow[1].trim()) return `${leading}${translatedBody} ←${trailing}`;
  }

  const dynamic = translateDynamic(core);
  if (dynamic) return `${leading}${dynamic}${trailing}`;

  let partial = core;
  for (const [english, arabic] of fragmentArabic) partial = partial.replaceAll(english, arabic);
  return partial === core ? value : `${leading}${partial}${trailing}`;
}

function canTranslate(element: Element | null) {
  if (!element) return false;
  if (element.closest("[data-no-auto-translate]")) return false;
  if (["SCRIPT", "STYLE", "CODE", "PRE", "NOSCRIPT"].includes(element.tagName)) return false;
  return true;
}

function sourceForText(node: Text) {
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

function translateTextNode(node: Text, locale: AppLocale) {
  if (!canTranslate(node.parentElement)) return;
  const source = sourceForText(node);
  const next = locale === "ar" ? translateArabicText(source) : source;
  if (node.nodeValue !== next) node.nodeValue = next;
}

function translateAttributes(element: Element, locale: AppLocale) {
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

function translateTree(root: Node, locale: AppLocale) {
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
  return <div className={`language-switcher ${compact ? "compact" : ""}`} role="group" aria-label={locale === "ar" ? "اللغة" : "Language"}>
    <button type="button" className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")} aria-pressed={locale === "en"}>EN</button>
    <button type="button" className={locale === "ar" ? "active" : ""} onClick={() => setLocale("ar")} aria-pressed={locale === "ar"}>ع</button>
  </div>;
}
