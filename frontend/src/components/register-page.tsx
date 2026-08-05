"use client";

import Link from "next/link";
import { FiArrowLeft, FiCheckCircle } from "react-icons/fi";
import { Brand, Field, icons, SubmitForm } from "./ui";
import { apiRequest } from "@/lib/api";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RegisterPage() {
  const router=useRouter();
  const [form,setForm]=useState({full_name:"",email:"",phone_number:"",student_number:"",password:"",confirm_password:"",current_semester:"1"});
  const [accepted,setAccepted]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const update=(key:keyof typeof form)=>(event:React.ChangeEvent<HTMLInputElement>)=>setForm(current=>({...current,[key]:event.target.value}));
  async function submit(){
    setError(null);
    if(form.password!==form.confirm_password){setError("Passwords do not match.");return;}
    if(!accepted){setError("You must agree to the Terms of Service and Privacy Policy.");return;}
    setLoading(true);
    try{
      await apiRequest<{message:string}>("/auth/signup",{method:"POST",body:{full_name:form.full_name,email:form.email,phone_number:form.phone_number,student_number:form.student_number,password:form.password,role:"STUDENT",current_semester:Number(form.current_semester)}});
      router.push(`/verify-email?email=${encodeURIComponent(form.email)}`);
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to create your account. Please try again.");}
    finally{setLoading(false);}
  }
  return <main className="registration-page">
    <section className="registration-story">
      <Brand />
      <figure className="auth-organ-visual digestive-story-image">
        <img src="/media/register-digestive-processed.webp" alt="Luminous digestive system anatomy illustration" />
      </figure>
    </section>
    <section className="registration-form-side">
      <div className="registration-top"><Link href="/"><FiArrowLeft /> Back to home</Link><span>Already registered? <Link href="/login">Log in</Link></span></div>
      <div className="registration-card">
        <span className="step-label">ACCOUNT SETUP</span><h2>Create your account</h2><p>Tell us where you are in your medical journey. You can update these details later.</p>
        <SubmitForm className="registration-form" buttonText="Create account" onSubmit={submit} loading={loading} error={error}>
          <div className="form-grid"><Field label="Full name" icon={icons.User} placeholder="Enter your full name" value={form.full_name} onChange={update("full_name")} required autoComplete="name"/><Field label="Email address" icon={icons.Mail} placeholder="you@example.com" type="email" value={form.email} onChange={update("email")} required autoComplete="email"/><Field label="Phone number" placeholder="+201001234567" type="tel" value={form.phone_number} onChange={update("phone_number")} required autoComplete="tel"/><Field label="Student number" placeholder="Your university student ID" value={form.student_number} onChange={update("student_number")} required/><Field label="Password" icon={icons.Lock} placeholder="12+ characters with upper, lower, and number" type="password" value={form.password} onChange={update("password")} required autoComplete="new-password"/><Field label="Confirm password" icon={icons.Lock} placeholder="Repeat your password" type="password" value={form.confirm_password} onChange={update("confirm_password")} required autoComplete="new-password"/></div>
          <div className="registration-divider"><span>Academic information</span></div>
          <div className="form-grid"><Field label="Current semester" placeholder="1" type="number" value={form.current_semester} onChange={update("current_semester")} required/></div>
          <label className="checkline terms"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.</span></label>
        </SubmitForm>
        <div className="registration-note"><FiCheckCircle /><span><b>Your profile stays flexible.</b><small>Update your academic year, semester, and areas of focus whenever they change.</small></span></div>
      </div>
    </section>
  </main>;
}
