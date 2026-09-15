"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FiBarChart2, FiBookOpen, FiShield, FiTrendingUp } from "react-icons/fi";
import { Brand, Field, icons, SubmitForm } from "./ui";
import { useAuth } from "./auth-provider";
import { GoogleSignInButton } from "./google-sign-in-button";
import { AuthMotion } from "./auth-motion";
import { ApiError } from "@/lib/api";
import { useLocale } from "./locale-provider";

const loginProof=[
  {Icon:FiShield,title:"Trusted by learners",copy:"Join a global community"},
  {Icon:FiTrendingUp,title:"Stronger reasoning",copy:"Built on real clinical logic"},
  {Icon:FiBarChart2,title:"Measurable impact",copy:"Track your progress"},
  {Icon:FiBookOpen,title:"Academic excellence",copy:"Designed for medical students"},
];

const GOOGLE_ONBOARDING_KEY="mdp_google_onboarding";

function resolveAuthErrorMessage(cause: unknown, locale: "en" | "ar"): string {
  if (cause instanceof ApiError && cause.status === 409 && cause.problem?.error === "ACTIVE_SESSION_EXISTS") {
    return locale === "ar"
      ? "أنت مسجّل الدخول بالفعل على جهاز آخر. سجّل الخروج من ذلك الجهاز للمتابعة، أو تواصل مع مسؤول النظام لتحرير جلستك."
      : "You are already signed in on another device. Sign out on that device to continue, or contact an administrator to release your session.";
  }
  if (cause instanceof Error) return cause.message;
  return locale === "ar"
    ? "تعذر تسجيل الدخول. تحقق من اتصالك وحاول مجددًا."
    : "Unable to sign in. Check your connection and try again.";
}

export function LoginPage(){
  const router=useRouter();
  const {login,googleLogin,user,loading:authLoading}=useAuth();
  const {locale}=useLocale();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [remember,setRemember]=useState(true);
  const [loading,setLoading]=useState(false);
  const [googleLoading,setGoogleLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    if(!authLoading&&user) router.replace("/dashboard");
  },[authLoading,router,user]);

  async function submit(){
    if(authLoading||user)return;
    setLoading(true);setError(null);
    try { await login({email,password,remember}); router.replace("/dashboard"); }
    catch (cause) { setError(resolveAuthErrorMessage(cause, locale)); }
    finally { setLoading(false); }
  }

  const handleGoogleCredential=useCallback(async(credential:string)=>{
    if(authLoading||googleLoading)return;
    setGoogleLoading(true);setError(null);
    try{
      const result=await googleLogin(credential);
      if("requires_onboarding" in result){
        sessionStorage.setItem(GOOGLE_ONBOARDING_KEY,JSON.stringify(result));
        router.push("/register?provider=google");
      }else{
        router.replace("/dashboard");
      }
    }catch(cause){
      setError(resolveAuthErrorMessage(cause, locale));
    }finally{
      setGoogleLoading(false);
    }
  },[authLoading,googleLoading,googleLogin,locale,router]);

  return <main className="auth-page login-page reference-login auth-motion-page" data-auth-motion-root>
    <AuthMotion variant="login" />
    <section className="story-side auth-motion-story">
      <Brand/>
      <figure className="auth-organ-visual heart-story-image">
        <img className="heart-story-dark" src="/media/login-heart-reference.webp" alt="Luminous anatomical heart with an electrocardiogram trace" width={1122} height={1402} decoding="async" fetchPriority="low" />
        <img className="heart-story-light" src="/media/login-heart-light.webp?v=20260822" alt="Detailed anatomical heart with an electrocardiogram trace in light mode" />
      </figure>
    </section>
    <section className="form-side auth-motion-form">
      <div className="login-card panel">
        <h2>Welcome back</h2>
        <p className="subhead">{authLoading?"Restoring your session…":"Log in to continue your learning journey."}</p>
        <SubmitForm className="login-form" buttonText="Log in" onSubmit={submit} loading={loading||authLoading} error={error}>
          <Field label="Email address" icon={icons.Mail} placeholder="your@email.com" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/>
          <Field label="Password" icon={icons.Lock} placeholder="Enter your password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/>
          <div className="form-row"><label className="checkline"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> <span>Keep me signed in</span></label><Link href="/forgot-password">Forgot password?</Link></div>
        </SubmitForm>
        <div className="or"><span/>or<span/></div>
        <GoogleSignInButton onCredential={handleGoogleCredential} disabled={authLoading||loading||googleLoading}/>
        {googleLoading&&<p className="google-auth-status" role="status">Verifying your Google account…</p>}
        <p className="switch-copy">New here? <Link href="/register">Create an account</Link></p>
      </div>
    </section>
    <footer className="auth-proof-strip auth-motion-footer">
      {loginProof.map(({Icon,title,copy})=><div key={title}><Icon/><span><b>{title}</b><small>{copy}</small></span></div>)}
    </footer>
  </main>;
}
