"use client";
import Link from "next/link";
import Image from "next/image";
import { Brand, Benefit, Field, icons, PageFooter, SecureNote, SubmitForm, TrustStrip } from "./ui";

export function LoginPage(){
  return <main className="auth-page login-page">
    <section className="story-side">
      <Brand/>
      <div className="story-copy">
        <h1>Learn like a <em>clinician.</em><br/>Think like you’re on rounds.</h1>
        <p className="lead">Case-based learning. Clinical reasoning.<br/>Lasting retention.</p>
        <div className="benefits">
          <Benefit icon={icons.Clipboard} title="Real cases. Real decisions.">Work through authentic patient cases<br/>used by clinicians and educators.</Benefit>
          <Benefit icon={icons.Trend} title="Track your progress.">See your growth in clinical reasoning<br/>and retention over time.</Benefit>
          <Benefit icon={icons.Users} title="Built for learners and clinicians.">Trusted by medical students, residents,<br/>and practicing physicians.</Benefit>
        </div>
      </div>
      <Image className="study-art login-art" src="/clinical-study.svg" alt="" width={1536} height={1024} priority />
      <TrustStrip/><PageFooter/>
    </section>
    <section className="form-side">
      <div className="login-card panel">
        <h2>Welcome back</h2>
        <p className="subhead">Log in to continue your learning journey.</p>
        <SubmitForm className="login-form" buttonText="Log in" afterSubmit="Signed in locally — backend connection comes next.">
          <Field label="Email address" icon={icons.Mail} placeholder="you@example.com" type="email"/>
          <Field label="Password" icon={icons.Lock} placeholder="Enter your password" type="password"/>
          <div className="form-row"><label className="checkline"><input type="checkbox" defaultChecked/> <span>Remember me</span></label><a href="#">Forgot password?</a></div>
        </SubmitForm>
        <div className="or"><span/>or<span/></div>
        <button className="google-button"><b>G</b> Continue with Google</button>
        <p className="switch-copy">New here? <Link href="/register">Create an account</Link></p>
        <div className="institution"><icons.Book/><div><strong>Student or institution?</strong><span>Access through your school or program.</span></div><a href="#">Institutional login <icons.Arrow/></a></div>
      </div>
      <SecureNote/>
    </section>
  </main>;
}
