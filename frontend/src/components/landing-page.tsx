"use client";

import Link from "next/link";
import {
  FiArrowRight, FiBarChart2, FiBookOpen, FiCpu, FiCheckCircle,
  FiClipboard, FiLayers, FiMenu, FiShield, FiTarget, FiUsers, FiX,
} from "react-icons/fi";
import { useState } from "react";
import { BRAND_NAME, BRAND_TAGLINE, BrandLockup } from "./brand";

const years = [
  { year: "Year 1", focus: "Foundations", description: "Build the scientific base behind clinical practice.", semesters: ["Semester 1", "Semester 2"], topics: ["Anatomy", "Physiology", "Biochemistry"] },
  { year: "Year 2", focus: "Systems", description: "Connect mechanisms, pathology, and pharmacology.", semesters: ["Semester 3", "Semester 4"], topics: ["Pathology", "Pharmacology", "Microbiology"] },
  { year: "Year 3", focus: "Clinical transition", description: "Move from knowledge recall to patient-centered reasoning.", semesters: ["Semester 5", "Semester 6"], topics: ["Diagnostics", "Clinical skills", "Case practice"] },
  { year: "Clinical Years", focus: "Rounds & exams", description: "Apply what you know in rotations, cases, and assessments.", semesters: ["Clerkships", "Exam prep"], topics: ["Case management", "Question banks", "Guidelines"] },
];

const features = [
  { icon: FiCpu, title: "Reason before you memorize", text: "Structured cases train the path from symptoms to differential diagnosis, investigations, and management." },
  { icon: FiLayers, title: "One connected workspace", text: "Courses, notes, question banks, flashcards, guidelines, and progress live inside one coherent learning system." },
  { icon: FiTarget, title: "Study what matters next", text: "Adaptive plans prioritize weak systems, upcoming assessments, overdue review, and the time you actually have." },
  { icon: FiBarChart2, title: "Progress you can explain", text: "See mastery by course and topic—not just a score—so every study decision has evidence behind it." },
  { icon: FiClipboard, title: "Built around real workflows", text: "Create notes from cases, convert insights into flashcards, review errors, and return to the source in one flow." },
  { icon: FiShield, title: "A focused academic space", text: "A calm, structured environment designed for learning, with clear ownership of your account and study data." },
];

const reasons = [
  { icon: FiUsers, title: "Built by doctors who understand the journey", text: "The platform is shaped by people who faced the same lectures, exam pressure, and search for trustworthy study material." },
  { icon: FiTarget, title: "High-yield without losing understanding", text: "Questions and explanations focus on the details that matter in exams while preserving the clinical reasoning behind every answer." },
  { icon: FiLayers, title: "MCQs, essays, and revision in one structure", text: "Weekly content, question banks, notes, flashcards, and progress tracking stay connected to the same academic path." },
  { icon: FiCheckCircle, title: "Continuously improved with student feedback", text: "Content and workflows evolve around what students actually struggle with, need clarified, and want to practise next." },
];

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <main className="public-home">
    <header className="public-nav">
      <BrandLockup className="public-brand" />
      <button className="public-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">{menuOpen ? <FiX /> : <FiMenu />}</button>
      <nav className={menuOpen ? "open" : ""}>
        <a href="#about">About us</a><a href="#goal">Our goal</a><a href="#curriculum">Curriculum</a><a href="#features">Features</a>
      </nav>
      <div className="public-actions"><Link href="/login">Log in</Link><Link className="public-button small" href="/register">Create account <FiArrowRight /></Link></div>
    </header>

    <section className="public-hero" id="product">
      <div className="hero-copy">
        <span className="public-eyebrow"><FiBookOpen /> My Doctor &amp; The Professor</span>
        <h1>The professor’s <em>wisdom.</em><br />The doctor’s precision.</h1>
        <p>Reliable medical education, structured around the way students learn, professors examine, and doctors think.</p>
        <div className="hero-actions"><Link className="public-button" href="/register">Start learning <FiArrowRight /></Link><a className="public-button ghost" href="#curriculum">Explore the curriculum</a></div>
        <div className="hero-proof"><span><FiCheckCircle /> Organized by academic year</span><span><FiCheckCircle /> Case-based reasoning</span><span><FiCheckCircle /> Personal progress</span></div>
      </div>
      <figure className="hero-duo" aria-label="The Doctor and The Professor">
        <img src="/media/hero-doctor-professor.webp" alt="The Doctor representing clinical precision and The Professor representing academic wisdom" />
      </figure>
    </section>

    <section className="public-section story-section" id="about">
      <div className="section-heading"><span>ABOUT US</span><h2>Created from the same challenges you face.</h2></div>
      <div className="story-copy"><p>We are a group of doctors who were once exactly in your place. We understand how challenging it can be to find reliable, high-quality study materials—especially when it comes to high-yield questions and the tricky details that professors love to test.</p><p>That struggle is what drove us to make a change. Five years ago, we launched My Doctor. Two years ago, we took a giant leap forward by releasing a completely redesigned version of our platform, alongside the very first weekly structured essay booklets that filled a huge gap for students.</p><p>Today, we continue that work through My Doctor &amp; The Professor, becoming a trusted primary source for both MCQs and essays.</p></div>
    </section>

    <section className="public-section thyroid-spotlight" aria-labelledby="thyroid-title">
      <figure className="thyroid-visual">
        <img src="/media/thyroid-learning.webp" alt="Thyroid gland medical visualization" />
      </figure>
      <div className="thyroid-copy">
        <span className="section-kicker">VISUAL LEARNING</span>
        <h2 id="thyroid-title">See the structure. Understand the system.</h2>
        <p>Medical concepts become easier to retain when anatomy, mechanisms, and clinical reasoning are connected visually.</p>
        <a href="#curriculum">Explore the curriculum <FiArrowRight /></a>
      </div>
    </section>

    <section className="public-section organ-insight" aria-labelledby="organ-insight-title">
      <div className="organ-insight-copy">
        <span className="section-kicker">FROM KNOWLEDGE TO CLINICAL REASONING</span>
        <h2 id="organ-insight-title">Understand the organ. Connect the decision.</h2>
        <p>Move between mechanisms, anatomy, and clinical interpretation without treating each concept as an isolated fact.</p>
      </div>
      <div className="organ-image-grid">
        <figure><img src="/media/home-brain.jpeg" alt="Brain medical illustration" /><figcaption>Neuroscience &amp; cognition</figcaption></figure>
        <figure><img src="/media/home-heart-processed.webp" alt="Heart and electrocardiogram medical illustration" /><figcaption>Cardiovascular reasoning</figcaption></figure>
      </div>
    </section>

    <section className="public-goal" id="goal"><span><FiTarget /></span><div><small>OUR GOAL</small><h2>Make studying medicine clearer, smarter, and more reliable.</h2><p>Our goal has always been to make your life easier, helping you study smarter, master your courses, and excel in your exams. We continuously improve our content, listen to your feedback, and provide the reliable academic support you deserve.</p></div></section>

    <section className="public-section curriculum-section" id="curriculum">
      <div className="section-heading"><span>YOUR ACADEMIC JOURNEY</span><h2>Find your year. Continue your work.</h2><p>Enter the platform through the stage you are studying now, then move between semesters, courses, and learning activities without losing context.</p></div>
      <div className="year-grid">{years.map((item, index) => <article className="year-card" key={item.year}>
        <div className="year-number">0{index + 1}</div><span>{item.focus}</span><h3>{item.year}</h3><p>{item.description}</p>
        <div className="semester-links">{item.semesters.map(semester => <Link key={semester} href={`/dashboard?stage=${index + 1}`}>{semester} <FiArrowRight /></Link>)}</div>
        <ul>{item.topics.map(topic => <li key={topic}><FiCheckCircle />{topic}</li>)}</ul>
        <Link className="year-open" href={`/dashboard?stage=${index + 1}`}>Open {item.year} workspace <FiArrowRight /></Link>
      </article>)}</div>
    </section>

    <section className="public-section feature-section" id="features">
      <div className="section-heading narrow"><span>WHY IT STANDS OUT</span><h2>More than content. A system for learning how to think.</h2><p>The platform connects each learning action to the next, reducing the gap between studying a fact and using it in a clinical decision.</p></div>
      <div className="feature-grid">{features.map(({ icon: Icon, title, text }) => <article key={title}><span><Icon /></span><h3>{title}</h3><p>{text}</p></article>)}</div>
    </section>

    <section className="public-section circulation-feature" aria-labelledby="circulation-title">
      <div className="circulation-copy">
        <span className="section-kicker">SYSTEMS IN CONTEXT</span>
        <h2 id="circulation-title">Follow the whole circulatory system.</h2>
        <p>Connect vessels, perfusion, and organ function as one continuous physiological system.</p>
      </div>
      <figure><img src="/media/home-circulatory-system.jpeg" alt="Human circulatory system visualization" /></figure>
    </section>

    <section className="public-section workflow-section">
      <div className="workflow-copy"><span className="section-kicker">HOW IT WORKS</span><h2>A repeatable learning loop</h2><p>Every feature supports one continuous workflow instead of becoming another disconnected tool.</p><Link href="/register">Build your workspace <FiArrowRight /></Link></div>
      <ol><li><b>01</b><div><strong>Plan</strong><span>Choose your year, courses, goals, and available study time.</span></div></li><li><b>02</b><div><strong>Learn</strong><span>Move through structured topics, resources, and clinical cases.</span></div></li><li><b>03</b><div><strong>Practice</strong><span>Use questions and reasoning builders to apply what you know.</span></div></li><li><b>04</b><div><strong>Review</strong><span>Return to weak concepts through notes, errors, and spaced repetition.</span></div></li></ol>
    </section>

    <section className="public-section why-section">
      <div className="section-heading narrow"><span>WHY CHOOSE US</span><h2>Academic support built around the realities of medical school.</h2><p>Everything is designed to reduce uncertainty: what to study, what is important, how it may be examined, and how well you actually understand it.</p></div>
      <div className="why-grid">{reasons.map(({icon:Icon,title,text}) => <article key={title}><Icon /><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
    </section>

    <section className="public-cta"><BrandLockup /><div><span>Ready when you are</span><h2>Build a clearer path through medicine.</h2><p>Create your academic workspace and begin with your current year.</p></div><Link className="public-button" href="/register">Create your account <FiArrowRight /></Link></section>

    <footer className="public-footer">
      <div className="footer-main"><div><BrandLockup showTagline /><p>Reliable academic support for medical students—from weekly learning to exam preparation.</p></div><div><h4>Product</h4><a href="#features">Features</a><a href="#curriculum">Academic years</a><Link href="/dashboard">Dashboard</Link><Link href="/study-plan">Study planning</Link></div><div><h4>Learning</h4><Link href="/bundles">Learning bundles</Link><Link href="/notebook">Notebook</Link><Link href="/flashcards">Flashcards</Link><Link href="/guidelines">Guidelines</Link></div><div><h4>Company</h4><a href="#about">About us</a><a href="#goal">Our goal</a><a href="mailto:support@mydoctorprofessor.com">Contact</a><a href="#">Privacy</a><a href="#">Terms</a></div></div>
      <div className="footer-bottom"><span>© 2026 {BRAND_NAME}. All rights reserved.</span><span>{BRAND_TAGLINE}</span></div>
    </footer>
  </main>;
}
