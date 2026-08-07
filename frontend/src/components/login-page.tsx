"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FiBarChart2, FiBookOpen, FiShield, FiTrendingUp } from "react-icons/fi";
import { Brand, Field, icons, SubmitForm } from "./ui";
import { useAuth } from "./auth-provider";

const loginProof=[
  {Icon:FiShield,title:"Trusted by learners",copy:"Join a global community"},
  {Icon:FiTrendingUp,title:"Stronger reasoning",copy:"Built on real clinical logic"},
  {Icon:FiBarChart2,title:"Measurable impact",copy:"Track your progress"},
  {Icon:FiBookOpen,title:"Academic excellence",copy:"Designed for medical students"},
];

export function LoginPage(){
  const router=useRouter();
  const {login,user,loading:authLoading}=useAuth();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [remember,setRemember]=useState(true);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    if(!authLoading&&user) router.replace("/dashboard");
  },[authLoading,router,user]);

  async function submit(){
    if(authLoading||user)return;
    setLoading(true);setError(null);
    try { await login({email,password,remember}); router.replace("/dashboard"); }
    catch (cause) { setError(cause instanceof Error?cause.message:"Unable to sign in. Check your connection and try again."); }
    finally { setLoading(false); }
  }
  return <main className="auth-page login-page reference-login">
    <section className="story-side">
      <Brand/>
      <figure className="auth-organ-visual heart-story-image">
        <img src="/media/login-heart-reference.png" alt="Luminous anatomical heart with an electrocardiogram trace" />
      </figure>
    </section>
    <section className="form-side">
      <div className="login-card panel">
        <h2>Welcome back</h2>
        <p className="subhead">{authLoading?"Restoring your session…":"Log in to continue your learning journey."}</p>
        <SubmitForm className="login-form" buttonText="Log in" onSubmit={submit} loading={loading||authLoading} error={error}>
          <Field label="Email address" icon={icons.Mail} placeholder="your@email.com" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/>
          <Field label="Password" icon={icons.Lock} placeholder="Enter your password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/>
          <div className="form-row"><label className="checkline"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> <span>Keep me signed in</span></label><Link href="/forgot-password">Forgot password?</Link></div>
        </SubmitForm>
        <div className="or"><span/>or<span/></div>
        <button className="google-button" disabled title="Google sign-in is not configured"><b>G</b> Continue with Google</button>
        <p className="switch-copy">New here? <Link href="/register">Create an account</Link></p>
      </div>
    </section>
    <footer className="auth-proof-strip">
      {loginProof.map(({Icon,title,copy})=><div key={title}><Icon/><span><b>{title}</b><small>{copy}</small></span></div>)}
    </footer>
  </main>;
}