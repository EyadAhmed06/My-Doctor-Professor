"use client";

import Link from "next/link";
import {
  FiArrowRight, FiBarChart2, FiBookOpen, FiCpu, FiCheckCircle,
  FiClipboard, FiLayers, FiMenu, FiShield, FiTarget, FiUsers, FiX,
} from "react-icons/fi";
import { useState } from "react";
import { BRAND_NAME, BRAND_TAGLINE, BrandLockup } from "./brand";
import { useAuth } from "./auth-provider";
import { LanguageSwitcher, useLocale } from "./locale-provider";
import "./landing-i18n.css";

type Localized = { en: string; ar: string };
const local = (locale: "en" | "ar", value: Localized) => value[locale];

const years = [
  {
    year: { en: "Year 1", ar: "السنة الأولى" }, focus: { en: "Foundations", ar: "الأساسيات" },
    description: { en: "Build the scientific base behind clinical practice.", ar: "ابنِ القاعدة العلمية التي تقوم عليها الممارسة السريرية." },
    semesters: [{ en: "Semester 1", ar: "الفصل الدراسي الأول" }, { en: "Semester 2", ar: "الفصل الدراسي الثاني" }],
    topics: [{ en: "Anatomy", ar: "التشريح" }, { en: "Physiology", ar: "علم وظائف الأعضاء" }, { en: "Biochemistry", ar: "الكيمياء الحيوية" }],
  },
  {
    year: { en: "Year 2", ar: "السنة الثانية" }, focus: { en: "Systems", ar: "أجهزة الجسم" },
    description: { en: "Connect mechanisms, pathology, and pharmacology.", ar: "اربط الآليات المرضية بعلم الأمراض وعلم الأدوية." },
    semesters: [{ en: "Semester 3", ar: "الفصل الدراسي الثالث" }, { en: "Semester 4", ar: "الفصل الدراسي الرابع" }],
    topics: [{ en: "Pathology", ar: "علم الأمراض" }, { en: "Pharmacology", ar: "علم الأدوية" }, { en: "Microbiology", ar: "علم الأحياء الدقيقة" }],
  },
  {
    year: { en: "Year 3", ar: "السنة الثالثة" }, focus: { en: "Clinical transition", ar: "الانتقال السريري" },
    description: { en: "Move from knowledge recall to patient-centered reasoning.", ar: "انتقل من استرجاع المعلومات إلى التفكير السريري المتمحور حول المريض." },
    semesters: [{ en: "Semester 5", ar: "الفصل الدراسي الخامس" }, { en: "Semester 6", ar: "الفصل الدراسي السادس" }],
    topics: [{ en: "Diagnostics", ar: "التشخيص" }, { en: "Clinical skills", ar: "المهارات السريرية" }, { en: "Case practice", ar: "التدرب على الحالات" }],
  },
  {
    year: { en: "Clinical Years", ar: "السنوات السريرية" }, focus: { en: "Rounds & exams", ar: "الجولات والاختبارات" },
    description: { en: "Apply what you know in rotations, cases, and assessments.", ar: "طبّق معرفتك في التدريبات السريرية والحالات والاختبارات." },
    semesters: [{ en: "Clerkships", ar: "التدريبات السريرية" }, { en: "Exam prep", ar: "الاستعداد للاختبارات" }],
    topics: [{ en: "Case management", ar: "إدارة الحالات" }, { en: "Question banks", ar: "بنوك الأسئلة" }, { en: "Guidelines", ar: "الإرشادات" }],
  },
];

const features = [
  { icon: FiCpu, title: { en: "Reason before you memorize", ar: "فكّر قبل أن تحفظ" }, text: { en: "Structured cases train the path from symptoms to differential diagnosis, investigations, and management.", ar: "تدرّبك الحالات المنظمة على الانتقال من الأعراض إلى التشخيص التفريقي والفحوصات وخطة العلاج." } },
  { icon: FiLayers, title: { en: "One connected workspace", ar: "مساحة تعلم مترابطة" }, text: { en: "Courses, notes, question banks, flashcards, guidelines, and progress live inside one coherent learning system.", ar: "المقررات والملاحظات وبنوك الأسئلة والبطاقات والإرشادات والتقدم تعمل داخل نظام تعلم واحد مترابط." } },
  { icon: FiTarget, title: { en: "Study what matters next", ar: "ذاكر ما يهمك الآن" }, text: { en: "Adaptive plans prioritize weak systems, upcoming assessments, overdue review, and the time you actually have.", ar: "تعطي الخطط المتكيفة الأولوية لنقاط الضعف والاختبارات القادمة والمراجعات المتأخرة والوقت المتاح لك فعليًا." } },
  { icon: FiBarChart2, title: { en: "Progress you can explain", ar: "تقدم يمكنك فهمه" }, text: { en: "See mastery by course and topic—not just a score—so every study decision has evidence behind it.", ar: "شاهد مستوى الإتقان حسب المقرر والموضوع، لا مجرد درجة، لتصبح قرارات المذاكرة مبنية على دليل." } },
  { icon: FiClipboard, title: { en: "Built around real workflows", ar: "مصمم حول سير التعلم الحقيقي" }, text: { en: "Create notes from cases, convert insights into flashcards, review errors, and return to the source in one flow.", ar: "أنشئ ملاحظات من الحالات، وحوّل الأفكار إلى بطاقات، وراجع أخطاءك، وارجع إلى المصدر ضمن سير واحد." } },
  { icon: FiShield, title: { en: "A focused academic space", ar: "مساحة أكاديمية مركزة" }, text: { en: "A calm, structured environment designed for learning, with clear ownership of your account and study data.", ar: "بيئة هادئة ومنظمة للتعلم مع تحكم واضح في حسابك وبيانات دراستك." } },
];

const reasons = [
  { icon: FiUsers, title: { en: "Built by doctors who understand the journey", ar: "صممه أطباء يفهمون الرحلة" }, text: { en: "The platform is shaped by people who faced the same lectures, exam pressure, and search for trustworthy study material.", ar: "صُممت المنصة على يد أشخاص واجهوا المحاضرات نفسها وضغط الاختبارات والبحث عن مصادر دراسية موثوقة." } },
  { icon: FiTarget, title: { en: "High-yield without losing understanding", ar: "تركيز على المهم دون فقدان الفهم" }, text: { en: "Questions and explanations focus on the details that matter in exams while preserving the clinical reasoning behind every answer.", ar: "تركز الأسئلة والشروحات على التفاصيل المهمة في الاختبارات مع الحفاظ على التفكير السريري وراء كل إجابة." } },
  { icon: FiLayers, title: { en: "MCQs, essays, and revision in one structure", ar: "اختيار من متعدد ومقالي ومراجعة في نظام واحد" }, text: { en: "Weekly content, question banks, notes, flashcards, and progress tracking stay connected to the same academic path.", ar: "يبقى المحتوى الأسبوعي وبنوك الأسئلة والملاحظات والبطاقات ومتابعة التقدم مرتبطًا بالمسار الأكاديمي نفسه." } },
  { icon: FiCheckCircle, title: { en: "Continuously improved with student feedback", ar: "يتطور باستمرار مع آراء الطلاب" }, text: { en: "Content and workflows evolve around what students actually struggle with, need clarified, and want to practise next.", ar: "يتطور المحتوى وسير العمل وفق ما يواجهه الطلاب فعليًا وما يحتاجون إلى توضيحه والتدرب عليه." } },
];

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const { locale } = useLocale();
  const t = (en: string, ar: string) => locale === "ar" ? ar : en;
  const displayName = user?.fullName || user?.full_name || user?.email || "";
  const firstName = displayName.trim().split(/\s+/)[0] || t("your workspace", "مساحتك");
  const workspaceHref = "/dashboard";
  const arrow = <FiArrowRight />;

  return <main className="public-home" data-locale={locale}>
    <header className="public-nav">
      <BrandLockup className="public-brand" ariaLabel={t(`${BRAND_NAME} home`, `الصفحة الرئيسية لـ ${BRAND_NAME}`)} />
      <button className="public-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label={t("Toggle navigation", "فتح أو إغلاق التنقل")}>{menuOpen ? <FiX /> : <FiMenu />}</button>
      <nav className={menuOpen ? "open" : ""}>
        <a href="#about">{t("About us", "من نحن")}</a><a href="#goal">{t("Our goal", "هدفنا")}</a><a href="#curriculum">{t("Curriculum", "المسار الدراسي")}</a><a href="#features">{t("Features", "المزايا")}</a>
      </nav>
      <div className="public-actions">
        <LanguageSwitcher compact />
        {authLoading ? <span className="public-session-copy">{t("Restoring session…", "جارٍ استعادة الجلسة…")}</span> : user ? <><span className="public-session-copy">{t(`Signed in as ${firstName}`, `تم تسجيل الدخول باسم ${firstName}`)}</span><Link className="public-button small" href={workspaceHref}>{t("Open dashboard", "فتح لوحة التحكم")} {arrow}</Link></> : <><Link href="/login">{t("Log in", "تسجيل الدخول")}</Link><Link className="public-button small" href="/register">{t("Create account", "إنشاء حساب")} {arrow}</Link></>}
      </div>
    </header>

    <section className="public-hero" id="product">
      <div className="hero-copy">
        <span className="public-eyebrow"><FiBookOpen /> My Doctor &amp; The Professor</span>
        <h1>{t("The professor’s ", "حكمة الأستاذ. ")}<em>{t("wisdom.", "")}</em><br />{t("The doctor’s precision.", "دقة الطبيب.")}</h1>
        <p>{t("Reliable medical education, structured around the way students learn, professors examine, and doctors think.", "تعليم طبي موثوق ومنظم حول طريقة تعلم الطلاب، ووضع الأساتذة للاختبارات، وتفكير الأطباء.")}</p>
        <div className="hero-actions">{user ? <Link className="public-button" href={workspaceHref}>{t("Continue learning", "متابعة التعلم")} {arrow}</Link> : <Link className="public-button" href="/register">{t("Start learning", "ابدأ التعلم")} {arrow}</Link>}<a className="public-button ghost" href="#curriculum">{t("Explore the curriculum", "استكشف المسار الدراسي")}</a></div>
        <div className="hero-proof"><span><FiCheckCircle /> {t("Organized by academic year", "منظم حسب السنة الدراسية")}</span><span><FiCheckCircle /> {t("Case-based reasoning", "تفكير قائم على الحالات")}</span><span><FiCheckCircle /> {t("Personal progress", "متابعة تقدمك الشخصي")}</span></div>
      </div>
      <figure className="hero-duo" aria-label={t("The Doctor and The Professor", "الطبيب والأستاذ")}>
        <img src="/media/hero-doctor-professor.webp" alt={t("The Doctor representing clinical precision and The Professor representing academic wisdom", "الطبيب ممثلًا للدقة السريرية والأستاذ ممثلًا للحكمة الأكاديمية")} />
      </figure>
    </section>

    <section className="public-section story-section" id="about">
      <div className="section-heading"><span>{t("ABOUT US", "من نحن")}</span><h2>{t("Created from the same challenges you face.", "نشأت المنصة من التحديات نفسها التي تواجهها.")}</h2></div>
      <div className="story-copy"><p>{t("We are a group of doctors who were once exactly in your place. We understand how challenging it can be to find reliable, high-quality study materials—especially when it comes to high-yield questions and the tricky details that professors love to test.", "نحن مجموعة من الأطباء كنا يومًا في المكان نفسه الذي أنت فيه. ندرك صعوبة العثور على مواد دراسية موثوقة وعالية الجودة، خصوصًا الأسئلة عالية الأهمية والتفاصيل الدقيقة التي يركز عليها الأساتذة في الاختبارات.")}</p><p>{t("That struggle is what drove us to make a change. Five years ago, we launched My Doctor. Two years ago, we took a giant leap forward by releasing a completely redesigned version of our platform, alongside the very first weekly structured essay booklets that filled a huge gap for students.", "هذه الصعوبة هي ما دفعنا إلى التغيير. أطلقنا My Doctor قبل خمس سنوات، ثم قدمنا قبل عامين نسخة معاد تصميمها بالكامل من المنصة إلى جانب أول كتيبات مقالية أسبوعية منظمة لسد فجوة كبيرة لدى الطلاب.")}</p><p>{t("Today, we continue that work through My Doctor & The Professor, becoming a trusted primary source for both MCQs and essays.", "واليوم نواصل هذا العمل من خلال My Doctor & The Professor لنكون مصدرًا موثوقًا لأسئلة الاختيار من متعدد والأسئلة المقالية معًا.")}</p></div>
    </section>

    <section className="public-section thyroid-spotlight" aria-labelledby="thyroid-title">
      <figure className="thyroid-visual"><img src="/media/thyroid-learning.webp" alt={t("Thyroid gland medical visualization", "تصور طبي للغدة الدرقية")} /></figure>
      <div className="thyroid-copy"><span className="section-kicker">{t("VISUAL LEARNING", "التعلم البصري")}</span><h2 id="thyroid-title">{t("See the structure. Understand the system.", "شاهد البنية. وافهم النظام.")}</h2><p>{t("Medical concepts become easier to retain when anatomy, mechanisms, and clinical reasoning are connected visually.", "تصبح المفاهيم الطبية أسهل في التذكر عندما يرتبط التشريح والآليات والتفكير السريري بصريًا.")}</p><a href="#curriculum">{t("Explore the curriculum", "استكشف المسار الدراسي")} {arrow}</a></div>
    </section>

    <section className="public-section organ-insight" aria-labelledby="organ-insight-title">
      <div className="organ-insight-copy"><span className="section-kicker">{t("FROM KNOWLEDGE TO CLINICAL REASONING", "من المعرفة إلى التفكير السريري")}</span><h2 id="organ-insight-title">{t("Understand the organ. Connect the decision.", "افهم العضو. واربطه بالقرار السريري.")}</h2><p>{t("Move between mechanisms, anatomy, and clinical interpretation without treating each concept as an isolated fact.", "انتقل بين الآليات والتشريح والتفسير السريري دون التعامل مع كل مفهوم كحقيقة منفصلة.")}</p></div>
      <div className="organ-image-grid"><figure><img src="/media/home-brain.jpeg" alt={t("Brain medical illustration", "رسم طبي للدماغ")} /><figcaption>{t("Neuroscience & cognition", "علوم الأعصاب والإدراك")}</figcaption></figure><figure><img src="/media/home-heart-processed.webp" alt={t("Heart and electrocardiogram medical illustration", "رسم طبي للقلب وتخطيط القلب")} /><figcaption>{t("Cardiovascular reasoning", "التفكير القلبي الوعائي")}</figcaption></figure></div>
    </section>

    <section className="public-goal" id="goal"><span><FiTarget /></span><div><small>{t("OUR GOAL", "هدفنا")}</small><h2>{t("Make studying medicine clearer, smarter, and more reliable.", "نجعل دراسة الطب أوضح وأذكى وأكثر موثوقية.")}</h2><p>{t("Our goal has always been to make your life easier, helping you study smarter, master your courses, and excel in your exams. We continuously improve our content, listen to your feedback, and provide the reliable academic support you deserve.", "هدفنا دائمًا أن نجعل رحلتك أسهل، فنساعدك على المذاكرة بذكاء وإتقان مقرراتك والتفوق في اختباراتك. نطور المحتوى باستمرار، ونستمع إلى ملاحظاتك، ونقدم دعمًا أكاديميًا يمكنك الاعتماد عليه.")}</p></div></section>

    <section className="public-section curriculum-section" id="curriculum">
      <div className="section-heading"><span>{t("YOUR ACADEMIC JOURNEY", "رحلتك الأكاديمية")}</span><h2>{t("Find your year. Continue your work.", "اختر سنتك الدراسية. وواصل تقدمك.")}</h2><p>{t("Enter the platform through the stage you are studying now, then move between semesters, courses, and learning activities without losing context.", "ادخل المنصة من المرحلة التي تدرسها الآن، ثم انتقل بين الفصول والمقررات وأنشطة التعلم دون فقدان سياقك.")}</p></div>
      <div className="year-grid">{years.map((item, index) => <article className="year-card" key={item.year.en}>
        <div className="year-number">0{index + 1}</div><span>{local(locale, item.focus)}</span><h3>{local(locale, item.year)}</h3><p>{local(locale, item.description)}</p>
        <div className="semester-links">{item.semesters.map(semester => <Link key={semester.en} href={`${workspaceHref}?stage=${index + 1}`}>{local(locale, semester)} {arrow}</Link>)}</div>
        <ul>{item.topics.map(topic => <li key={topic.en}><FiCheckCircle />{local(locale, topic)}</li>)}</ul>
        <Link className="year-open" href={`${workspaceHref}?stage=${index + 1}`}>{t(`Open ${item.year.en} workspace`, `فتح مساحة ${item.year.ar}`)} {arrow}</Link>
      </article>)}</div>
    </section>

    <section className="public-section feature-section" id="features">
      <div className="section-heading narrow"><span>{t("WHY IT STANDS OUT", "لماذا تتميز المنصة")}</span><h2>{t("More than content. A system for learning how to think.", "أكثر من مجرد محتوى. نظام يساعدك على تعلم كيف تفكر.")}</h2><p>{t("The platform connects each learning action to the next, reducing the gap between studying a fact and using it in a clinical decision.", "تربط المنصة كل خطوة تعلم بما يليها، فتقلل الفجوة بين دراسة المعلومة واستخدامها في قرار سريري.")}</p></div>
      <div className="feature-grid">{features.map(({ icon: Icon, title, text }) => <article key={title.en}><span><Icon /></span><h3>{local(locale, title)}</h3><p>{local(locale, text)}</p></article>)}</div>
    </section>

    <section className="public-section circulation-feature" aria-labelledby="circulation-title">
      <div className="circulation-copy"><span className="section-kicker">{t("SYSTEMS IN CONTEXT", "الأجهزة في سياقها")}</span><h2 id="circulation-title">{t("Follow the whole circulatory system.", "تتبع الجهاز الدوري كاملًا.")}</h2><p>{t("Connect vessels, perfusion, and organ function as one continuous physiological system.", "اربط الأوعية الدموية والتروية ووظائف الأعضاء كنظام فسيولوجي واحد متصل.")}</p></div>
      <figure><img src="/media/home-circulatory-system.jpeg" alt={t("Human circulatory system visualization", "تصور للجهاز الدوري البشري")} /></figure>
    </section>

    <section className="public-section workflow-section">
      <div className="workflow-copy"><span className="section-kicker">{t("HOW IT WORKS", "كيف يعمل")}</span><h2>{t("A repeatable learning loop", "دورة تعلم قابلة للتكرار")}</h2><p>{t("Every feature supports one continuous workflow instead of becoming another disconnected tool.", "كل ميزة تدعم سير تعلم مستمرًا بدل أن تصبح أداة منفصلة أخرى.")}</p>{user ? <Link href={workspaceHref}>{t("Continue your workspace", "واصل في مساحة تعلمك")} {arrow}</Link> : <Link href="/register">{t("Build your workspace", "أنشئ مساحة تعلمك")} {arrow}</Link>}</div>
      <ol><li><b>01</b><div><strong>{t("Plan", "خطط")}</strong><span>{t("Choose your year, courses, goals, and available study time.", "اختر سنتك ومقرراتك وأهدافك والوقت المتاح للمذاكرة.")}</span></div></li><li><b>02</b><div><strong>{t("Learn", "تعلّم")}</strong><span>{t("Move through structured topics, resources, and clinical cases.", "تقدم عبر موضوعات وموارد وحالات سريرية منظمة.")}</span></div></li><li><b>03</b><div><strong>{t("Practice", "تدرّب")}</strong><span>{t("Use questions and reasoning builders to apply what you know.", "استخدم الأسئلة وأدوات التفكير لتطبيق ما تعرفه.")}</span></div></li><li><b>04</b><div><strong>{t("Review", "راجع")}</strong><span>{t("Return to weak concepts through notes, errors, and spaced repetition.", "ارجع إلى المفاهيم الضعيفة عبر الملاحظات والأخطاء والتكرار المتباعد.")}</span></div></li></ol>
    </section>

    <section className="public-section why-section">
      <div className="section-heading narrow"><span>{t("WHY CHOOSE US", "لماذا تختارنا")}</span><h2>{t("Academic support built around the realities of medical school.", "دعم أكاديمي مصمم حول واقع دراسة الطب.")}</h2><p>{t("Everything is designed to reduce uncertainty: what to study, what is important, how it may be examined, and how well you actually understand it.", "كل شيء مصمم لتقليل الحيرة: ماذا تذاكر، وما المهم، وكيف قد يأتي في الاختبار، ومدى فهمك الحقيقي له.")}</p></div>
      <div className="why-grid">{reasons.map(({icon:Icon,title,text}) => <article key={title.en}><Icon /><div><h3>{local(locale, title)}</h3><p>{local(locale, text)}</p></div></article>)}</div>
    </section>

    <section className="public-cta"><BrandLockup ariaLabel={t(`${BRAND_NAME} home`, `الصفحة الرئيسية لـ ${BRAND_NAME}`)} /><div><span>{user ? t(`Welcome back, ${firstName}`, `مرحبًا بعودتك، ${firstName}`) : t("Ready when you are", "نحن جاهزون عندما تكون جاهزًا")}</span><h2>{user ? t("Continue from where you left off.", "واصل من حيث توقفت.") : t("Build a clearer path through medicine.", "ابنِ مسارًا أوضح خلال دراسة الطب.")}</h2><p>{user ? t("Your authenticated workspace is ready without signing in again.", "مساحة تعلمك جاهزة دون الحاجة إلى تسجيل الدخول مرة أخرى.") : t("Create your academic workspace and begin with your current year.", "أنشئ مساحة تعلمك الأكاديمية وابدأ من سنتك الحالية.")}</p></div><Link className="public-button" href={user ? workspaceHref : "/register"}>{user ? t("Open dashboard", "فتح لوحة التحكم") : t("Create your account", "إنشاء حسابك")} {arrow}</Link></section>

    <footer className="public-footer">
      <div className="footer-main"><div><BrandLockup showTagline tagline={t(BRAND_TAGLINE, "حكمة الأستاذ. دقة الطبيب.")} ariaLabel={t(`${BRAND_NAME} home`, `الصفحة الرئيسية لـ ${BRAND_NAME}`)} /><p>{t("Reliable academic support for medical students—from weekly learning to exam preparation.", "دعم أكاديمي موثوق لطلاب الطب، من التعلم الأسبوعي إلى الاستعداد للاختبارات.")}</p></div><div><h4>{t("Product", "المنتج")}</h4><a href="#features">{t("Features", "المزايا")}</a><a href="#curriculum">{t("Academic years", "السنوات الدراسية")}</a><Link href="/dashboard">{t("Dashboard", "لوحة التحكم")}</Link><Link href="/study-plan">{t("Study planning", "تخطيط المذاكرة")}</Link></div><div><h4>{t("Learning", "التعلم")}</h4><Link href="/bundles">{t("Learning bundles", "الحزم التعليمية")}</Link><Link href="/notebook">{t("Notebook", "دفتر الملاحظات")}</Link><Link href="/flashcards">{t("Flashcards", "البطاقات التعليمية")}</Link><Link href="/guidelines">{t("Guidelines", "الإرشادات")}</Link></div><div><h4>{t("Company", "الشركة")}</h4><a href="#about">{t("About us", "من نحن")}</a><a href="#goal">{t("Our goal", "هدفنا")}</a><a href="mailto:support@mydoctorprofessor.com">{t("Contact", "تواصل معنا")}</a><a href="#">{t("Privacy", "الخصوصية")}</a><a href="#">{t("Terms", "الشروط")}</a></div></div>
      <div className="footer-bottom"><span>© 2026 {BRAND_NAME}. {t("All rights reserved.", "جميع الحقوق محفوظة.")}</span><span>{t(BRAND_TAGLINE, "حكمة الأستاذ. دقة الطبيب.")}</span></div>
    </footer>
  </main>;
}
