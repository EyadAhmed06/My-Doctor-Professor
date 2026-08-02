"use client";

import Link from "next/link";
import { FiArrowLeft, FiBookOpen, FiCheckCircle, FiLayers, FiShield, FiTarget } from "react-icons/fi";
import { Brand, Field, icons, SubmitForm } from "./ui";

export function RegisterPage() {
  return <main className="registration-page">
    <section className="registration-story">
      <Brand />
      <div><span className="public-eyebrow"><FiBookOpen /> Your learning workspace</span><h1>Start where you are.<br /><em>Build forward.</em></h1><p>Create one account for your courses, cases, notes, practice, and progress—from your current semester to clinical training.</p>
        <ul><li><FiLayers /><span><b>Organized around your curriculum</b><small>Choose your year, semester, university, and areas of focus.</small></span></li><li><FiTarget /><span><b>A plan that adapts with you</b><small>Keep weak topics, deadlines, and review priorities visible.</small></span></li><li><FiShield /><span><b>Your academic workspace</b><small>Your profile and learning history stay connected to your account.</small></span></li></ul>
      </div>
      <p className="registration-quote">“Learn the science, practice the reasoning, and carry both into every clinical decision.”</p>
    </section>
    <section className="registration-form-side">
      <div className="registration-top"><Link href="/"><FiArrowLeft /> Back to home</Link><span>Already registered? <Link href="/login">Log in</Link></span></div>
      <div className="registration-card">
        <span className="step-label">ACCOUNT SETUP</span><h2>Create your account</h2><p>Tell us where you are in your medical journey. You can update these details later.</p>
        <SubmitForm className="registration-form" buttonText="Create account" afterSubmit="Your workspace is ready to be configured.">
          <div className="form-grid"><Field label="Full name" icon={icons.User} placeholder="Enter your full name"/><Field label="Email address" icon={icons.Mail} placeholder="you@example.com" type="email"/><Field label="Password" icon={icons.Lock} placeholder="Create a strong password" type="password"/><Field label="Confirm password" icon={icons.Lock} placeholder="Repeat your password" type="password"/></div>
          <div className="registration-divider"><span>Academic information</span></div>
          <div className="form-grid"><Field label="University / Medical School" icon={icons.Book} placeholder="Enter your institution"/><Field label="Program" placeholder="Medicine, Dentistry, or related field" select/><Field label="Current year" placeholder="Select your academic year" select/><Field label="Current semester" placeholder="Select your semester" select/></div>
          <label className="checkline terms"><input type="checkbox"/><span>I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.</span></label>
        </SubmitForm>
        <div className="registration-note"><FiCheckCircle /><span><b>Your profile stays flexible.</b><small>Update your academic year, semester, and areas of focus whenever they change.</small></span></div>
      </div>
    </section>
  </main>;
}
