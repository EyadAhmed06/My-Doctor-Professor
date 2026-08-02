"use client";
import Link from "next/link";
import { useState } from "react";
import { Brand, Field, icons, SubmitForm } from "./ui";

const plans=[
  {name:"Monthly",caption:"Flexible & simple",price:"$14.99",term:"/ month",items:["Full access to Qbank","AI explanations","Performance analytics","Clinical reasoning","Spaced repetition","Cancel anytime"]},
  {name:"Quarterly",caption:"Save more, achieve more",price:"$34.99",term:"/ 3 months",save:"Save 22%",items:["Everything in Monthly","Advanced analytics","Notebook & notes","AI tutor (limited)","Priority support"]},
  {name:"Annual",caption:"Best value for serious learners",price:"$119.99",term:"/ year",save:"Save 33%",items:["Everything in Quarterly","AI tutor (unlimited)","Custom study plans","Offline access","Early access to new features","Priority support"]}
];

export function RegisterPage(){
  const [selected,setSelected]=useState(1);
  return <main className="register-page">
    <section className="plan-area">
      <Brand/>
      <h1>Your journey to mastery<br/><em>starts</em> here.</h1>
      <p className="lead">Join thousands of future clinicians who learn, practice,<br/>and think like doctors.</p>
      <div className="section-title"><h2>1. Choose your plan</h2><span><icons.Lock/> Secure payment&nbsp;&nbsp; | &nbsp;&nbsp;Cancel anytime</span></div>
      <div className="plans">{plans.map((plan,index)=><article key={plan.name} className={"plan-card "+(selected===index?"selected":"")}>
        {index===1&&<div className="ribbon">RECOMMENDED</div>}
        <h3>{plan.name}</h3><p>{plan.caption}</p>
        <div className="price">{plan.price} <small>{plan.term}</small>{plan.save&&<span>{plan.save}</span>}</div>
        <ul>{plan.items.map(item=><li key={item}><icons.Check/>{item}</li>)}</ul>
        <button onClick={()=>setSelected(index)}>Select Plan</button>
      </article>)}</div>
      <div className="payment-benefits">
        <div><icons.Shield/><p><b>Secure &amp; trusted</b><span>Your payment is encrypted<br/>and 100% secure.</span></p></div>
        <div><icons.Activity/><p><b>Cancel anytime</b><span>No long-term commitments.<br/>Cancel in one click.</span></p></div>
        <div><icons.Clipboard/><p><b>Tax invoice</b><span>You’ll receive a receipt<br/>right after payment.</span></p></div>
      </div>
      <div className="payment-footer"><span><icons.Lock/> Payments processed securely</span><b>VISA&nbsp;&nbsp;&nbsp; Mastercard&nbsp;&nbsp;&nbsp; mada&nbsp;&nbsp;&nbsp; Pay</b></div>
    </section>
    <section className="register-form-wrap">
      <div className="register-card panel">
        <h2>2. Create your account</h2><p>Already have an account? <Link href="/login">Log in</Link></p>
        <div className="form-section-title"><icons.User/> Personal Information <span/></div>
        <SubmitForm className="register-form" buttonText="Proceed to Payment" afterSubmit={"Selected: "+plans[selected].name}>
          <Field label="Full name" placeholder="e.g. Amr Taha"/>
          <Field label="Email address" placeholder="e.g. amr.taha@email.com" type="email"/>
          <Field label="Password" placeholder="Create a strong password" type="password"/>
          <div className="form-section-title"><icons.Book/> Student Information <span/></div>
          <Field label="Country" placeholder="Select your country" select/>
          <Field label="University / Medical School" placeholder="Select or type your university"/>
          <div className="form-grid"><Field label="Program" placeholder="e.g. Medicine, Dentistry" select/><Field label="Year of Study" placeholder="Select your year" select/></div>
          <div className="verification"><icons.Shield/><p><b>Student verification may be required</b><span>We may ask for proof of enrollment to confirm your student status<br/>and keep our community academic.</span></p></div>
          <label className="checkline terms"><input type="checkbox"/><span>I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a></span></label>
        </SubmitForm>
        <p className="payment-note">You’ll be able to start learning right after payment.</p>
      </div>
    </section>
  </main>;
}
