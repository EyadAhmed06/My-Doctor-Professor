"use client";

import Link from "next/link";
import {
  FiActivity, FiArrowRight, FiAward, FiBarChart2, FiBookOpen, FiBox, FiCpu,
  FiCheckCircle, FiClipboard, FiDatabase, FiEdit3, FiFileText, FiLayers,
  FiMenu, FiPackage, FiRefreshCw, FiShield, FiTag, FiTarget, FiX,
} from "react-icons/fi";
import { useState } from "react";
import { BRAND_NAME, BRAND_TAGLINE, BrandLockup } from "./brand";
import { useAuth } from "./auth-provider";
import { useLocale } from "./locale-provider";
import "./landing-i18n.css";
import "./landing-light-media.css";

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
  { icon: FiDatabase, title: { en: "Massive, high-yield MCQ bank", ar: "بنك ضخم لأسئلة الاختيار من متعدد عالية الأهمية" }, text: { en: "MCQs spanning all academic years, organized with specific guidelines for focused practice.", ar: "أسئلة اختيار من متعدد تغطي جميع السنوات الدراسية، ومنظمة بإرشادات محددة للتدريب المركز." } },
  { icon: FiRefreshCw, title: { en: "Updated daily", ar: "تحديثات يومية" }, text: { en: "Questions are updated daily to reflect recent exam trends and professor-preferred topics.", ar: "تُحدّث الأسئلة يوميًا لتعكس أحدث اتجاهات الاختبارات والموضوعات التي يفضلها الأساتذة." } },
  { icon: FiEdit3, title: { en: "First-ever weekly essay booklets", ar: "أول كتيبات مقالية أسبوعية من نوعها" }, text: { en: "Master written exams with weekly essay booklets featuring high-frequency short answers.", ar: "أتقن الاختبارات التحريرية من خلال كتيبات مقالية أسبوعية تضم أكثر أسئلة الإجابات القصيرة تكرارًا." } },
  { icon: FiActivity, title: { en: "Official-format clinical cases", ar: "حالات سريرية بصيغة الاختبارات الرسمية" }, text: { en: "Train under real pressure with comprehensive clinical cases matching official exam formats.", ar: "تدرّب تحت ضغط حقيقي مع حالات سريرية شاملة تحاكي صيغ الاختبارات الرسمية." } },
  { icon: FiBox, title: { en: "Interactive AI anatomy", ar: "تشريح تفاعلي مدعوم بالذكاء الاصطناعي" }, text: { en: "Visualize and interact with human structures using our advanced AI learning tool for anatomy.", ar: "شاهد تراكيب جسم الإنسان وتفاعل معها باستخدام أداة التعلم المتقدمة للتشريح والمدعومة بالذكاء الاصطناعي." } },
  { icon: FiFileText, title: { en: "Smart study guides", ar: "أدلة مذاكرة ذكية" }, text: { en: "Save hours of revision with lectures distilled into high-density, actionable bullet points.", ar: "وفّر ساعات من المراجعة مع محاضرات مختصرة في نقاط مركزة وعملية عالية الكثافة." } },
  { icon: FiLayers, title: { en: "Dynamic medical flashcards", ar: "بطاقات طبية ديناميكية" }, text: { en: "Boost long-term retention using dynamic digital flashcards built for medical students.", ar: "عزّز الاحتفاظ بالمعلومات على المدى الطويل ببطاقات رقمية ديناميكية مصممة لطلاب الطب." } },
  { icon: FiBookOpen, title: { en: "Built-in personal notebook", ar: "دفتر ملاحظات شخصي مدمج" }, text: { en: "Save questions and log personal notes directly inside the platform.", ar: "احفظ الأسئلة وسجّل ملاحظاتك الشخصية مباشرة داخل المنصة." } },
  { icon: FiAward, title: { en: "Frequent milestone exams", ar: "اختبارات مرحلية متكررة" }, text: { en: "Test your knowledge every three weeks to win valuable vouchers, gifts, and surprises.", ar: "اختبر معرفتك كل ثلاثة أسابيع للفوز بقسائم قيمة وهدايا ومفاجآت." } },
  { icon: FiTag, title: { en: "Budget-friendly packages", ar: "باقات مناسبة للميزانية" }, text: { en: "Choose from accessible packages designed with exclusive discounts for everyone.", ar: "اختر من باقات ميسّرة صُممت بخصومات حصرية تناسب الجميع." } },
  { icon: FiPackage, title: { en: "Ultimate final bundles", ar: "حزم المراجعة النهائية الشاملة" }, text: { en: "Lock in top marks with all-inclusive revision packs covering past papers and high-yield points.", ar: "ثبّت أعلى الدرجات مع حزم مراجعة متكاملة تغطي الاختبارات السابقة وأهم النقاط عالية العائد." } },
];

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const { locale } = useLocale();
  const t = (en: string, ar: string) => locale === "ar" ? ar : en;
  const displayName = user?.fullName || user?.full_name || user?.email || "";
  const firstName = displayName.trim().split(/\s+/)[0] || t("your workspace", "مساحتك");
  const workspaceHref = user?.role === "SYSTEM_ADMIN" ? "/admin" : user?.role === "INSTRUCTOR" ? "/instructor" : "/dashboard";
  const academicHref = (stage: number, semesterIndex?: number) => {
    const params = new URLSearchParams({ stage: String(stage) });
    if (semesterIndex !== undefined) {
      if (stage <= 3) params.set("semester", String((stage - 1) * 2 + semesterIndex + 1));
      else params.set("track", semesterIndex === 0 ? "clerkships" : "exams");
    }
    return `/dashboard?${params.toString()}`;
  };
  const arrow = <FiArrowRight />;

  return <main className="public-home" data-locale={locale}>
    <header className="public-nav">
      <BrandLockup className="public-brand" ariaLabel={t(`${BRAND_NAME} home`, `الصفحة الرئيسية لـ ${BRAND_NAME}`)} />
      <button className="public-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label={t("Toggle navigation", "فتح أو إغلاق التنقل")}>{menuOpen ? <FiX /> : <FiMenu />}</button>
      <nav className={menuOpen ? "open" : ""}>
        <a href="#about">{t("About us", "من نحن")}</a><a href="#goal">{t("Our goal", "هدفنا")}</a><a href="#why-us">{t("Why choose us", "لماذا تختارنا")}</a><a href="#curriculum">{t("Curriculum", "المسار الدراسي")}</a><a href="#features">{t("Features", "المزايا")}</a>
      </nav>
      <div className="public-actions">
        {authLoading ? <span className="public-session-copy">{t("Restoring session…", "جارٍ استعادة الجلسة…")}</span> : user ? <><span className="public-session-copy">{t(`Signed in as ${firstName}`, `تم تسجيل الدخول باسم ${firstName}`)}</span><Link className="public-button small" href={workspaceHref}>{t("Open dashboard", "فتح لوحة التحكم")} {arrow}</Link></> : <><Link href="/login">{t("Log in", "تسجيل الدخول")}</Link><Link className="public-button small" href="/register">{t("Create account", "إنشاء حساب")} {arrow}</Link></>}
      </div>
    </header>

    <section className="public-hero" id="product">
      <div className="hero-copy">
        <span className="public-eyebrow"><FiBookOpen /> My Doctor &amp; The Professor</span>
        <h1>{locale === "ar" ? <>حكمة الأستاذ.<br />دقة الطبيب.</> : <>The professor’s <em>wisdom.</em><br />The doctor’s <em>precision.</em></>}</h1>
        <p>{t("Reliable medical education, structured around the way students learn, professors examine, and doctors think.", "تعليم طبي موثوق ومنظم حول طريقة تعلم الطلاب، ووضع الأساتذة للاختبارات، وتفكير الأطباء.")}</p>
        <div className="hero-actions">{user ? <Link className="public-button" href={workspaceHref}>{t("Continue learning", "متابعة التعلم")} {arrow}</Link> : <Link className="public-button" href="/register">{t("Start learning", "ابدأ التعلم")} {arrow}</Link>}<a className="public-button ghost" href="#curriculum">{t("Explore the curriculum", "استكشف المسار الدراسي")}</a></div>
        <div className="hero-proof"><span><FiCheckCircle /> {t("Organized by academic year", "منظم حسب السنة الدراسية")}</span><span><FiCheckCircle /> {t("Case-based reasoning", "تفكير قائم على الحالات")}</span><span><FiCheckCircle /> {t("Personal progress", "متابعة تقدمك الشخصي")}</span></div>
      </div>
      <figure className="hero-duo" aria-label={t("The Doctor and The Professor", "الطبيب والأستاذ")}>
        <img className="hero-duo-dark" src="/media/hero-doctor-professor-dark-final-lossless.webp?v=20260829-final-v2" alt={t("The Doctor representing clinical precision and The Professor representing academic wisdom", "الطبيب ممثلًا للدقة السريرية والأستاذ ممثلًا للحكمة الأكاديمية")} />
        <img className="hero-duo-light" src="/media/hero-doctor-professor-light-final.webp?v=20260829-final-v2" alt={t("The Doctor representing clinical precision and The Professor representing academic wisdom", "الطبيب ممثلًا للدقة السريرية والأستاذ ممثلًا للحكمة الأكاديمية")} />
      </figure>
    </section>

    <section className="public-section story-section" id="about">
      <div className="section-heading"><span>{t("ABOUT US", "من نحن")}</span><h2>{t("Created from the same challenges you face.", "نشأت المنصة من التحديات نفسها التي تواجهها.")}</h2></div>
      <div className="story-copy"><p>{t("We are a group of doctors who were once exactly in your place. We understand how challenging it can be to find reliable, high-quality study materials—especially when it comes to high-yield questions and the tricky details that professors love to test.", "نحن مجموعة من الأطباء كنا يومًا في المكان نفسه الذي أنت فيه. ندرك صعوبة العثور على مواد دراسية موثوقة وعالية الجودة، خصوصًا الأسئلة عالية الأهمية والتفاصيل الدقيقة التي يركز عليها الأساتذة في الاختبارات.")}</p><p>{t("That struggle is what drove us to make a change. Five years ago, we launched My Doctor. Two years ago, we took a giant leap forward by releasing a completely redesigned version of our platform, alongside the very first weekly structured essay booklets that filled a huge gap for students.", "هذه الصعوبة هي ما دفعنا إلى التغيير. أطلقنا My Doctor قبل خمس سنوات، ثم قدمنا قبل عامين نسخة معاد تصميمها بالكامل من المنصة إلى جانب أول كتيبات مقالية أسبوعية منظمة لسد فجوة كبيرة لدى الطلاب.")}</p><p>{t("And becoming a trusted primary source for both MCQs and essays.", "واليوم نواصل هذا العمل من خلال My Doctor & The Professor لنكون مصدرًا موثوقًا لأسئلة الاختيار من متعدد والأسئلة المقالية معًا.")}</p></div>
    </section>

    <section className="public-goal" id="goal"><span><FiTarget /></span><div><small>{t("OUR GOAL", "هدفنا")}</small><h2>{t("Make studying medicine clearer, smarter, and more reliable.", "نجعل دراسة الطب أوضح وأذكى وأكثر موثوقية.")}</h2><p>{t("Our goal has always been to make your life easier, helping you study smarter, master your courses, and excel in your exams. We continuously work on improving our content, listening to your feedback, and providing the reliable academic support you deserve.", "هدفنا دائمًا أن نجعل رحلتك أسهل، فنساعدك على المذاكرة بذكاء وإتقان مقرراتك والتفوق في اختباراتك. نطور المحتوى باستمرار، ونستمع إلى ملاحظاتك، ونقدم دعمًا أكاديميًا يمكنك الاعتماد عليه.")}</p></div></section>

    <section className="public-section why-section" id="why-us">
      <div className="section-heading narrow"><span>{t("WHY CHOOSE US", "لماذا تختارنا")}</span><h2>{t("Everything you need to master medical school.", "كل ما تحتاجه لإتقان رحلتك في كلية الطب.")}</h2><p>{t("One complete learning system for daily study, exam practice, long-term retention, and final revision.", "نظام تعلم متكامل للمذاكرة اليومية والتدريب على الاختبارات والاحتفاظ طويل المدى والمراجعة النهائية.")}</p></div>
      <div className="why-grid">{reasons.map(({icon:Icon,title,text}, index) => <article className={index === 0 ? "why-card-featured" : undefined} key={title.en}><span className="why-icon"><Icon /></span><div><small>{String(index + 1).padStart(2, "0")}</small><h3>{local(locale, title)}</h3><p>{local(locale, text)}</p></div></article>)}</div>
    </section>

    

    <section className="public-section organ-insight" aria-labelledby="organ-insight-title">
      <div className="organ-insight-copy"><span className="section-kicker">{t("FROM KNOWLEDGE TO CLINICAL REASONING", "من المعرفة إلى التفكير السريري")}</span><h2 id="organ-insight-title">{t("Understand the organ. Connect the decision.", "افهم العضو. واربطه بالقرار السريري.")}</h2><p>{t("Move between mechanisms, anatomy, and clinical interpretation without treating each concept as an isolated fact.", "انتقل بين الآليات والتشريح والتفسير السريري دون التعامل مع كل مفهوم كحقيقة منفصلة.")}</p><Link className="organ-insight-cta" href="/anatomy">{t("View the human body in 3D", "استعرض جسم الإنسان بتقنية ثلاثية الأبعاد")} {arrow}</Link></div>
      <div className="organ-image-grid"><figure><img className="home-brain-art" src="/media/home-brain-original-dark.webp?v=20260822-dark" alt={t("Brain medical illustration", "رسم طبي للدماغ")} /><figcaption>{t("Neuroscience & cognition", "علوم الأعصاب والإدراك")}</figcaption></figure><figure><img src="/media/home-heart-processed.webp" alt={t("Heart and electrocardiogram medical illustration", "رسم طبي للقلب وتخطيط القلب")} /><figcaption>{t("Cardiovascular reasoning", "التفكير القلبي الوعائي")}</figcaption></figure></div>
    </section>

    

    <section className="public-section curriculum-section" id="curriculum">
      <div className="section-heading"><span>{t("YOUR ACADEMIC JOURNEY", "رحلتك الأكاديمية")}</span><h2>{t("Find your year. Continue your work.", "اختر سنتك الدراسية. وواصل تقدمك.")}</h2><p>{t("Enter the platform through the stage you are studying now, then move between semesters, courses, and learning activities without losing context.", "ادخل المنصة من المرحلة التي تدرسها الآن، ثم انتقل بين الفصول والمقررات وأنشطة التعلم دون فقدان سياقك.")}</p></div>
      <div className="year-grid">{years.map((item, index) => <article className="year-card" key={item.year.en}>
        <div className="year-number">0{index + 1}</div><span>{local(locale, item.focus)}</span><h3>{local(locale, item.year)}</h3><p>{local(locale, item.description)}</p>
        <div className="semester-links">{item.semesters.map((semester, semesterIndex) => <Link key={semester.en} href={academicHref(index + 1, semesterIndex)}>{local(locale, semester)} {arrow}</Link>)}</div>
        <ul>{item.topics.map(topic => <li key={topic.en}><FiCheckCircle />{local(locale, topic)}</li>)}</ul>
        <Link className="year-open" href={academicHref(index + 1)}>{t(`Open ${item.year.en} workspace`, `فتح مساحة ${item.year.ar}`)} {arrow}</Link>
      </article>)}</div>
    </section>

    <section className="public-section feature-section" id="features">
      <div className="section-heading narrow"><span>{t("WHY IT STANDS OUT", "لماذا تتميز المنصة")}</span><h2>{t("More than content. A system for learning how to think.", "أكثر من مجرد محتوى. نظام يساعدك على تعلم كيف تفكر.")}</h2><p>{t("The platform connects each learning action to the next, reducing the gap between studying a fact and using it in a clinical decision.", "تربط المنصة كل خطوة تعلم بما يليها، فتقلل الفجوة بين دراسة المعلومة واستخدامها في قرار سريري.")}</p></div>
      <div className="feature-grid">{features.map(({ icon: Icon, title, text }) => <article key={title.en}><span><Icon /></span><h3>{local(locale, title)}</h3><p>{local(locale, text)}</p></article>)}</div>
    </section>

    

    <section className="public-section workflow-section">
      <div className="workflow-copy"><span className="section-kicker">{t("HOW IT WORKS", "كيف يعمل")}</span><h2>{t("A repeatable learning loop", "دورة تعلم قابلة للتكرار")}</h2><p>{t("Every feature supports one continuous workflow instead of becoming another disconnected tool.", "كل ميزة تدعم سير تعلم مستمرًا بدل أن تصبح أداة منفصلة أخرى.")}</p>{user ? <Link href={workspaceHref}>{t("Continue your workspace", "واصل في مساحة تعلمك")} {arrow}</Link> : <Link href="/register">{t("Build your workspace", "أنشئ مساحة تعلمك")} {arrow}</Link>}</div>
      <ol><li><b>01</b><div><strong>{t("Plan", "خطط")}</strong><span>{t("Choose your year, courses, goals, and available study time.", "اختر سنتك ومقرراتك وأهدافك والوقت المتاح للمذاكرة.")}</span></div></li><li><b>02</b><div><strong>{t("Learn", "تعلّم")}</strong><span>{t("Move through structured topics, resources, and clinical cases.", "تقدم عبر موضوعات وموارد وحالات سريرية منظمة.")}</span></div></li><li><b>03</b><div><strong>{t("Practice", "تدرّب")}</strong><span>{t("Use questions and reasoning builders to apply what you know.", "استخدم الأسئلة وأدوات التفكير لتطبيق ما تعرفه.")}</span></div></li><li><b>04</b><div><strong>{t("Review", "راجع")}</strong><span>{t("Return to weak concepts through notes, errors, and spaced repetition.", "ارجع إلى المفاهيم الضعيفة عبر الملاحظات والأخطاء والتكرار المتباعد.")}</span></div></li></ol>
    </section>

    

    <section className="public-cta"><BrandLockup ariaLabel={t(`${BRAND_NAME} home`, `الصفحة الرئيسية لـ ${BRAND_NAME}`)} /><div><span>{user ? t(`Welcome back, ${firstName}`, `مرحبًا بعودتك، ${firstName}`) : t("Ready when you are", "نحن جاهزون عندما تكون جاهزًا")}</span><h2>{user ? t("Continue from where you left off.", "واصل من حيث توقفت.") : t("Build a clearer path through medicine.", "ابنِ مسارًا أوضح خلال دراسة الطب.")}</h2><p>{user ? t("Your authenticated workspace is ready without signing in again.", "مساحة تعلمك جاهزة دون الحاجة إلى تسجيل الدخول مرة أخرى.") : t("Create your academic workspace and begin with your current year.", "أنشئ مساحة تعلمك الأكاديمية وابدأ من سنتك الحالية.")}</p></div><Link className="public-button" href={user ? workspaceHref : "/register"}>{user ? t("Open dashboard", "فتح لوحة التحكم") : t("Create your account", "إنشاء حسابك")} {arrow}</Link></section>

    <footer className="public-footer">
      <div className="footer-main"><div><BrandLockup showTagline tagline={t(BRAND_TAGLINE, "حكمة الأستاذ. دقة الطبيب.")} ariaLabel={t(`${BRAND_NAME} home`, `الصفحة الرئيسية لـ ${BRAND_NAME}`)} /><p>{t("Reliable academic support for medical students—from weekly learning to exam preparation.", "دعم أكاديمي موثوق لطلاب الطب، من التعلم الأسبوعي إلى الاستعداد للاختبارات.")}</p></div><div><h4>{t("Product", "المنتج")}</h4><a href="#features">{t("Features", "المزايا")}</a><a href="#curriculum">{t("Academic years", "السنوات الدراسية")}</a><Link href="/dashboard">{t("Dashboard", "لوحة التحكم")}</Link><Link href="/study-plan">{t("Study planning", "تخطيط المذاكرة")}</Link></div><div><h4>{t("Learning", "التعلم")}</h4><Link href="/bundles">{t("Learning bundles", "الحزم التعليمية")}</Link><Link href="/notebook">{t("Notebook", "دفتر الملاحظات")}</Link><Link href="/flashcards">{t("Flashcards", "البطاقات التعليمية")}</Link><Link href="/guidelines">{t("Guidelines", "الإرشادات")}</Link></div><div><h4>{t("Company", "الشركة")}</h4><a href="#about">{t("About us", "من نحن")}</a><a href="#goal">{t("Our goal", "هدفنا")}</a><a href="#why-us">{t("Why choose us", "لماذا تختارنا")}</a><a href="mailto:support@mydoctorprofessor.com">{t("Contact", "تواصل معنا")}</a><Link href="/privacy">{t("Privacy", "الخصوصية")}</Link><Link href="/terms">{t("Terms", "الشروط")}</Link></div></div>
      <div className="footer-bottom"><span>© 2026 {BRAND_NAME}. {t("All rights reserved.", "جميع الحقوق محفوظة.")}</span><span>{t(BRAND_TAGLINE, "حكمة الأستاذ. دقة الطبيب.")}</span></div>
    </footer>
  </main>;
}
