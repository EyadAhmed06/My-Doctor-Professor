import Link from "next/link";
import { FiArrowLeft, FiShield } from "react-icons/fi";
import { BrandLockup } from "./brand";
import "./public-legal-page.css";

type Section = { title: string; paragraphs: string[] };

export function PublicLegalPage({ title, intro, sections }: { title: string; intro: string; sections: Section[] }) {
  return (
    <main className="public-legal-page">
      <header className="public-legal-header">
        <BrandLockup href="/" />
        <Link href="/"><FiArrowLeft /> Back to home</Link>
      </header>
      <article className="public-legal-card">
        <span className="public-legal-icon"><FiShield /></span>
        <small>MY DOCTOR &amp; THE PROFESSOR</small>
        <h1>{title}</h1>
        <p className="public-legal-intro">{intro}</p>
        <div className="public-legal-sections">
          {sections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
        </div>
        <footer><p>Questions about these policies can be sent to <a href="mailto:support@mydoctorprofessor.com">support@mydoctorprofessor.com</a>.</p><nav><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link></nav></footer>
      </article>
    </main>
  );
}
