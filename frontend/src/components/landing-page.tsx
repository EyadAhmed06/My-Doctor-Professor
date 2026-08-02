"use client";
import Image from "next/image";
import { Brand, Benefit, Field, icons, PageFooter, SecureNote, SubmitForm, TrustStrip } from "./ui";

const planFeatures=["Full case library","Qbank access","Spaced repetition","Professor Pearls","Advanced analytics"];

export function LandingPage(){
  return <main className="auth-page landing-page">
    <section className="story-side">
      <Brand/>
      <div className="story-copy">
        <h1>Start your <em>clinical</em><br/>learning journey.</h1>
        <p className="lead">Case-based learning. Clinical reasoning.<br/>Lasting retention.</p>
        <div className="benefits">
          <Benefit icon={icons.Book} title="Personalized study paths.">We adapt to your goals and knowledge<br/>level to focus on what matters most.</Benefit>
          <Benefit icon={icons.Calendar} title="Spaced review & retention.">Smart spaced repetition helps you<br/>retain more and forget less.</Benefit>
          <Benefit icon={icons.Bar} title="Track & measure progress.">See your strengths, spot gaps, and<br/>improve with real-time insights.</Benefit>
        </div>
      </div>
      <Image className="study-art landing-art" src="/clinical-study.svg" alt="" width={1536} height={1024} priority />
      <TrustStrip/><PageFooter/>
    </section>
    <section className="form-side landing-form-side">
      <div className="signup-card panel">
        <div className="signup-main">
          <h2>Create your account</h2>
          <p className="access-line"><icons.Shield/><span><b>Access begins with a paid Clinical Pro plan.</b><small>Start with a 7-day free trial. Cancel anytime.</small></span></p>
          <SubmitForm className="signup-form" buttonText="Continue to Clinical Pro">
            <div className="form-grid">
              <Field label="Full name" icon={icons.User} placeholder="Enter your full name"/>
              <Field label="Email address" icon={icons.Mail} placeholder="you@example.com" type="email"/>
              <Field label="Password" icon={icons.Lock} placeholder="Create a password" type="password"/>
              <Field label="Confirm password" icon={icons.Lock} placeholder="Confirm your password" type="password"/>
              <Field label="Medical school / university" icon={icons.Book} placeholder="Search for your school"/>
              <Field label="Year of study" placeholder="Select year" select/>
              <Field label="Target exam" icon={icons.Activity} placeholder="Select your target exam" select/>
              <Field label="Current rotation / focus area" placeholder="Select a specialty or interest" select/>
              <Field label="Expected graduation" icon={icons.Calendar} placeholder="Select month and year"/>
            </div>
            <label className="checkline terms"><input type="checkbox" defaultChecked/><span>I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.</span></label>
          </SubmitForm>
          <div className="or"><span/>or<span/></div><button className="google-button"><b>G</b> Continue with Google</button>
          <div className="institution compact"><icons.Book/><div><strong>Institutional or school access?</strong><span>Access through your school or program.</span></div><a href="#">Institutional sign up <icons.Arrow/></a></div>
        </div>
        <aside className="plan-summary">
          <span className="recommended">RECOMMENDED PLAN</span>
          <div className="plan-title"><span className="crown"><icons.Star/></span><div><h3>Clinical Pro</h3><p>The complete learning experience<br/>for future clinicians.</p></div></div>
          <div className="price">$14.99 <small>/month</small></div><b className="trial">7-day free trial</b><p>Cancel anytime.</p><hr/>
          <p>Everything in Clinical Pro</p>
          <ul>{planFeatures.map((feature,i)=><li key={feature}><icons.Check/><span><b>{feature}</b><small>{["Unlimited clinical cases","High-yield question banks","Smart review & retention","Expert insights & key takeaways","Track progress & performance"][i]}</small></span></li>)}</ul>
          <button className="primary-button">Start free trial <icons.Arrow/></button>
          <small className="billing"><icons.Lock/> Secure billing. Cancel anytime.<br/>Encrypted payment.</small>
        </aside>
      </div>
      <div className="landing-security"><SecureNote/><span>VISA&nbsp;&nbsp; Mastercard &nbsp;&nbsp; AMEX &nbsp;&nbsp; Pay</span></div>
    </section>
  </main>;
}
