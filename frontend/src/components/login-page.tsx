"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brand, Field, icons, PageFooter, SecureNote, SubmitForm, TrustStrip } from "./ui";
import { useAuth } from "./auth-provider";

export function LoginPage(){
  const router=useRouter();
  const {login}=useAuth();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [remember,setRemember]=useState(true);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  async function submit(){
    setLoading(true);setError(null);
    try { await login({email,password,remember}); router.replace("/dashboard"); }
    catch (cause) { setError(cause instanceof Error?cause.message:"Unable to sign in. Check your connection and try again."); }
    finally { setLoading(false); }
  }
  return <main className="auth-page login-page">
    <section className="story-side">
      <Brand/>
      <figure className="auth-organ-visual kidney-story-image">
        <img src="/media/login-kidneys-processed.webp" alt="Luminous anatomical kidneys representing renal medicine" />
      </figure>
      <TrustStrip/><PageFooter/>
    </section>
    <section className="form-side">
      <div className="login-card panel">
        <h2>Welcome back</h2>
        <p className="subhead">Log in to continue your learning journey.</p>
        <SubmitForm className="login-form" buttonText="Log in" onSubmit={submit} loading={loading} error={error}>
          <Field label="Email address" icon={icons.Mail} placeholder="you@example.com" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/>
          <Field label="Password" icon={icons.Lock} placeholder="Enter your password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/>
          <div className="form-row"><label className="checkline"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> <span>Remember me</span></label><Link href="/forgot-password">Forgot password?</Link></div>
        </SubmitForm>
        <div className="or"><span/>or<span/></div>
        <button className="google-button" disabled title="Google sign-in is not configured"><b>G</b> Continue with Google</button>
        <p className="switch-copy">New here? <Link href="/register">Create an account</Link></p>
        <div className="institution"><icons.Book/><div><strong>Student account</strong><span>Use the email registered with your account.</span></div></div>
      </div>
      <SecureNote/>
    </section>
  </main>;
}
