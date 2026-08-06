"use client";

import { apiRequest, ApiError } from "@/lib/api";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { FiArrowLeft, FiCheck, FiClock, FiMail, FiRefreshCw, FiShield } from "react-icons/fi";
import { Brand, Field, icons } from "./ui";
import styles from "./account-action-page.module.css";

type LayoutProps = { eyebrow:string; title:string; description:string; children:ReactNode };

function ActionLayout({eyebrow,title,description,children}:LayoutProps){
  return <main className={styles.page}>
    <section className={styles.story}>
      <Brand/>
      <div className={styles.illustration} aria-hidden="true">
        <span className={styles.orbit}/><span className={styles.mail}><FiMail/></span>
        <span className={styles.shield}><FiShield/></span>
      </div>
      <div className={styles.storyCopy}>
        <span>{eyebrow}</span><h1>{title}</h1><p>{description}</p>
        <div className={styles.assurances}>
          <p><FiShield/><span><b>Secure by design</b><small>Single-use, time-limited account links.</small></span></p>
          <p><FiClock/><span><b>Quick recovery</b><small>Return to your learning without losing progress.</small></span></p>
        </div>
      </div>
    </section>
    <section className={styles.formSide}>
      <div className={styles.card}>
        <Link className={styles.back} href="/login"><FiArrowLeft/> Back to login</Link>
        {children}
        <div className={styles.security}><FiShield/> Your account information is encrypted and protected.</div>
      </div>
    </section>
  </main>;
}

function Notice({message,error}:{message:string|null;error:string|null}){
  if(!message&&!error)return null;
  return <div className={`${styles.notice} ${error?styles.noticeError:styles.noticeSuccess}`} role={error?"alert":"status"}>{error?null:<FiCheck/>}<span>{error||message}</span></div>;
}

function SubmitButton({loading,label}:{loading:boolean;label:string}){
  return <button className={`primary-button ${styles.submit}`} type="submit" disabled={loading} aria-busy={loading}>{loading?<><FiRefreshCw className={styles.spin}/> Please wait…</>:<>{label}<icons.Arrow/></>}</button>;
}

export function ForgotPasswordPage(){
  const [email,setEmail]=useState(""); const [message,setMessage]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null); const [loading,setLoading]=useState(false);
  async function submit(event:FormEvent){event.preventDefault();setLoading(true);setError(null);setMessage(null);try{const result=await apiRequest<{message:string}>("/auth/password/forgot",{method:"POST",body:{email:email.trim()}});setMessage(result.message);}catch(cause){setError(cause instanceof ApiError?cause.message:"Unable to send the reset link. Check your connection and try again.");}finally{setLoading(false);}}
  return <ActionLayout eyebrow="ACCOUNT RECOVERY" title="Forgot your password?" description="It happens. We will help you securely return to your account.">
    <div className={styles.heading}><span className={styles.step}>1</span><div><h2>Reset your password</h2><p>Enter the email associated with your account. We will send you a secure reset link.</p></div></div>
    {message?<div className={styles.complete}><span><FiMail/></span><h2>Check your inbox</h2><p>We sent password-recovery instructions to <b>{email}</b>. The link expires in 30 minutes.</p><button className={styles.secondaryButton} onClick={()=>setMessage(null)}>Use another email</button><Notice message={message} error={null}/></div>:
    <form className={styles.form} onSubmit={submit} noValidate><Field label="Email address" icon={icons.Mail} placeholder="you@example.com" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/><p className={styles.helper}>For security, we will show the same confirmation whether or not an account exists.</p><SubmitButton loading={loading} label="Send reset link"/><Notice message={null} error={error}/></form>}
  </ActionLayout>;
}

export function VerifyEmailPage(){
  const search=useSearchParams(); const token=search.get("token"); const email=search.get("email")||"";
  const [message,setMessage]=useState<string|null>(null); const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(Boolean(token)); const [cooldown,setCooldown]=useState(0);
  useEffect(()=>{if(!token)return;void apiRequest<{message:string}>("/auth/email-verification/confirm",{method:"POST",body:{token}}).then(result=>setMessage(result.message)).catch(cause=>setError(cause instanceof ApiError?cause.message:"Unable to verify this email.")).finally(()=>setLoading(false));},[token]);
  useEffect(()=>{if(cooldown<=0)return;const id=window.setInterval(()=>setCooldown(value=>Math.max(0,value-1)),1000);return()=>window.clearInterval(id);},[cooldown]);
  async function resend(){if(!email||cooldown)return;setLoading(true);setError(null);setMessage(null);try{const result=await apiRequest<{message:string}>("/auth/email-verification/request",{method:"POST",body:{email}});setMessage(result.message);setCooldown(60);}catch(cause){setError(cause instanceof ApiError?cause.message:"Unable to resend verification.");}finally{setLoading(false);}}
  const verified=Boolean(token&&message&&!error);
  return <ActionLayout eyebrow="EMAIL VERIFICATION" title={verified?"You are verified.":"One final step."} description={verified?"Your account is active and ready for your learning journey.":"Verify your email to protect your account and activate every feature."}>
    <div className={styles.heading}><span className={styles.step}>{verified?<FiCheck/>:"2"}</span><div><h2>{loading?"Verifying your link…":verified?"Email verified":"Check your inbox"}</h2><p>{token?"We are confirming your secure verification link.":<>We sent a verification link{email?<> to <b>{email}</b></>:null}.</>}</p></div></div>
    {loading?<div className={styles.loadingState}><span/><span/><span/></div>:<>
      <Notice message={message} error={error}/>
      {verified?<Link className={`primary-button ${styles.submit}`} href="/login">Continue to login <icons.Arrow/></Link>:<div className={styles.actions}>{error&&token?<p className={styles.helper}>This link may have expired or already been used. Request a fresh email below.</p>:null}{email?<button className={`primary-button ${styles.submit}`} onClick={resend} disabled={loading||cooldown>0}>{cooldown?`Resend available in ${cooldown}s`:"Resend verification email"}</button>:<Link className={`primary-button ${styles.submit}`} href="/register">Return to registration <icons.Arrow/></Link>}</div>}
    </>}
  </ActionLayout>;
}

export function ResetPasswordPage(){
  const token=useSearchParams().get("token")||""; const [password,setPassword]=useState(""); const [confirm,setConfirm]=useState("");
  const [message,setMessage]=useState<string|null>(null); const [error,setError]=useState<string|null>(null); const [loading,setLoading]=useState(false);
  const checks={length:password.length>=12,upper:/[A-Z]/.test(password),lower:/[a-z]/.test(password),number:/\d/.test(password),match:Boolean(password)&&password===confirm};
  async function submit(event:FormEvent){event.preventDefault();setError(null);setMessage(null);if(!token){setError("This reset link is incomplete. Request a new one.");return;}if(!checks.length||!checks.upper||!checks.lower||!checks.number){setError("Your password does not meet all security requirements.");return;}if(!checks.match){setError("Passwords do not match.");return;}setLoading(true);try{const result=await apiRequest<{message:string}>("/auth/password/reset",{method:"POST",body:{token,new_password:password,confirm_password:confirm}});setMessage(result.message);}catch(cause){setError(cause instanceof ApiError?cause.message:"Unable to reset this password.");}finally{setLoading(false);}}
  return <ActionLayout eyebrow="ACCOUNT RECOVERY" title="Create a new password." description="Choose a strong password you have not used for this account before.">
    <div className={styles.heading}><span className={styles.step}>2</span><div><h2>{message?"Password updated":"Choose a new password"}</h2><p>{message?"Your other sessions were signed out to protect your account.":"Complete every requirement below before continuing."}</p></div></div>
    {message?<div className={styles.complete}><span><FiCheck/></span><Notice message={message} error={null}/><Link className={`primary-button ${styles.submit}`} href="/login">Log in with new password <icons.Arrow/></Link></div>:<form className={styles.form} onSubmit={submit}><Field label="New password" icon={icons.Lock} placeholder="Create a secure password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="new-password"/><Field label="Confirm password" icon={icons.Lock} placeholder="Repeat your password" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required autoComplete="new-password"/><div className={styles.requirements}><Check ok={checks.length}>At least 12 characters</Check><Check ok={checks.upper&&checks.lower}>Uppercase and lowercase letters</Check><Check ok={checks.number}>At least one number</Check><Check ok={checks.match}>Passwords match</Check></div><SubmitButton loading={loading} label="Reset password"/><Notice message={null} error={error}/></form>}
  </ActionLayout>;
}

function Check({ok,children}:{ok:boolean;children:ReactNode}){return <span className={ok?styles.met:""}><FiCheck/>{children}</span>;}
