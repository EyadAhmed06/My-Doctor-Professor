"use client";

import { apiRequest, ApiError } from "@/lib/api";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { FiArrowLeft, FiCheck, FiClock, FiMail, FiRefreshCw, FiShield } from "react-icons/fi";
import { Brand, Field, icons } from "./ui";
import { AuthMotion, type AuthMotionVariant } from "./auth-motion";
import styles from "./account-action-page.module.css";

type LayoutProps = { eyebrow:string; title:string; description:string; variant:AuthMotionVariant; children:ReactNode };

function ActionLayout({eyebrow,title,description,variant,children}:LayoutProps){
  return <main className={`${styles.page} auth-motion-page`} data-auth-motion-root>
    <AuthMotion variant={variant}/>
    <section className={`${styles.story} auth-motion-story`}>
      <Brand/>
      <div className={styles.illustration} aria-hidden="true">
        <span className={styles.orbit}/><span className={styles.mail}><FiMail/></span>
        <span className={styles.shield}><FiShield/></span>
      </div>
      <div className={styles.storyCopy}>
        <span>{eyebrow}</span><h1>{title}</h1><p>{description}</p>
        <div className={styles.assurances}>
          <p><FiShield/><span><b>Secure by design</b><small>Single-use, time-limited account verification.</small></span></p>
          <p><FiClock/><span><b>Quick recovery</b><small>Return to your learning without losing progress.</small></span></p>
        </div>
      </div>
    </section>
    <section className={`${styles.formSide} auth-motion-form`}>
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
  return <ActionLayout variant="forgot" eyebrow="ACCOUNT RECOVERY" title="Forgot your password?" description="It happens. We will help you securely return to your account.">
    <div className={styles.heading}><span className={styles.step}>1</span><div><h2>Reset your password</h2><p>Enter the email associated with your account. We will send you a secure reset link.</p></div></div>
    {message?<div className={styles.complete}><span><FiMail/></span><h2>Check your inbox</h2><p>We sent password-recovery instructions to <b>{email}</b>. The link expires in 30 minutes.</p><button className={styles.secondaryButton} onClick={()=>setMessage(null)}>Use another email</button><Notice message={message} error={null}/></div>:
    <form className={styles.form} onSubmit={submit} noValidate><Field label="Email address" icon={icons.Mail} placeholder="you@example.com" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/><p className={styles.helper}>For security, we will show the same confirmation whether or not an account exists.</p><SubmitButton loading={loading} label="Send reset link"/><Notice message={null} error={error}/></form>}
  </ActionLayout>;
}

export function VerifyEmailPage(){
  const search=useSearchParams();
  const email=(search.get("email")||"").trim();
  const [digits,setDigits]=useState<string[]>(()=>Array(6).fill(""));
  const inputs=useRef<Array<HTMLInputElement|null>>([]);
  const [message,setMessage]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const [verified,setVerified]=useState(false);
  const [cooldown,setCooldown]=useState(0);
  const code=digits.join("");

  useEffect(()=>{if(cooldown<=0)return;const id=window.setInterval(()=>setCooldown(value=>Math.max(0,value-1)),1000);return()=>window.clearInterval(id);},[cooldown]);

  function setDigit(index:number,value:string){
    const numeric=value.replace(/\D/g,"");
    const next=[...digits];
    next[index]=numeric.slice(-1);
    setDigits(next);
    if(numeric&&index<5)inputs.current[index+1]?.focus();
  }

  function handleKeyDown(index:number,event:KeyboardEvent<HTMLInputElement>){
    if(event.key==="Backspace"&&!digits[index]&&index>0)inputs.current[index-1]?.focus();
    if(event.key==="ArrowLeft"&&index>0){event.preventDefault();inputs.current[index-1]?.focus();}
    if(event.key==="ArrowRight"&&index<5){event.preventDefault();inputs.current[index+1]?.focus();}
  }

  function handlePaste(event:ClipboardEvent<HTMLInputElement>){
    const pasted=event.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);
    if(!pasted)return;
    event.preventDefault();
    const next=Array(6).fill("");
    pasted.split("").forEach((digit,index)=>{next[index]=digit;});
    setDigits(next);
    inputs.current[Math.min(pasted.length,6)-1]?.focus();
  }

  async function submit(event:FormEvent){
    event.preventDefault();
    setError(null);
    setMessage(null);
    if(!email){setError("This verification page is missing the account email. Return to registration and try again.");return;}
    if(!/^\d{6}$/.test(code)){setError("Enter the complete 6-digit code from your email.");return;}
    setLoading(true);
    try{
      const result=await apiRequest<{message:string}>("/auth/email-verification/confirm-code",{method:"POST",body:{email,code}});
      setVerified(true);
      setMessage(result.message);
    }catch(cause){
      setError(cause instanceof ApiError?cause.message:"Unable to verify this code. Request a new code and try again.");
    }finally{setLoading(false);}
  }

  async function resend(){
    if(!email||cooldown||loading)return;
    setLoading(true);setError(null);setMessage(null);setVerified(false);
    try{
      const result=await apiRequest<{message:string}>("/auth/email-verification/request",{method:"POST",body:{email}});
      setDigits(Array(6).fill(""));
      setMessage(result.message);
      setCooldown(60);
      window.setTimeout(()=>inputs.current[0]?.focus(),0);
    }catch(cause){
      setError(cause instanceof ApiError?cause.message:"Unable to send a new verification code.");
    }finally{setLoading(false);}
  }

  return <ActionLayout variant="verify" eyebrow="EMAIL VERIFICATION" title={verified?"You are verified.":"One final step."} description={verified?"Your account is active and ready for your learning journey.":"Enter the one-time code we sent to your inbox to activate your account."}>
    <div className={styles.heading}><span className={styles.step}>{verified?<FiCheck/>:"2"}</span><div><h2>{verified?"Email verified":"Enter your verification code"}</h2><p>{email?<>We sent a 6-digit code to <b>{email}</b>.</>:<>Return to registration so we know which account to verify.</>}</p></div></div>
    {verified?<div className={styles.complete}><span><FiCheck/></span><h2>You're all set</h2><p>Your email is confirmed and your account is now active.</p><Notice message={message} error={null}/><Link className={`primary-button ${styles.submit}`} href="/login">Continue to login <icons.Arrow/></Link></div>:
    email?<form className={styles.otpForm} onSubmit={submit} noValidate>
      <div className={styles.otpPanel}>
        <span className={styles.otpLabel}>6-DIGIT CODE</span>
        <div className={styles.otpGrid} onPaste={handlePaste}>
          {digits.map((digit,index)=><input
            key={index}
            ref={element=>{inputs.current[index]=element;}}
            className={styles.otpCell}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            autoComplete={index===0?"one-time-code":"off"}
            aria-label={`Verification digit ${index+1}`}
            disabled={loading}
            onChange={event=>setDigit(index,event.target.value)}
            onKeyDown={event=>handleKeyDown(index,event)}
          />)}
        </div>
        <div className={styles.otpMeta}><FiClock/><span>Code expires in 10 minutes. A new code automatically invalidates the previous one.</span></div>
      </div>
      <SubmitButton loading={loading} label="Verify email"/>
      <Notice message={message} error={error}/>
      <div className={styles.resendRow}>
        <span>Didn't receive it?</span>
        <button type="button" onClick={resend} disabled={loading||cooldown>0}>{cooldown?`Resend in ${cooldown}s`:"Send a new code"}</button>
      </div>
    </form>:<div className={styles.actions}><Notice message={null} error={error}/><Link className={`primary-button ${styles.submit}`} href="/register">Return to registration <icons.Arrow/></Link></div>}
  </ActionLayout>;
}

export function ResetPasswordPage(){
  const token=useSearchParams().get("token")||""; const [password,setPassword]=useState(""); const [confirm,setConfirm]=useState("");
  const [message,setMessage]=useState<string|null>(null); const [error,setError]=useState<string|null>(null); const [loading,setLoading]=useState(false);
  const checks={length:password.length>=12,upper:/[A-Z]/.test(password),lower:/[a-z]/.test(password),number:/\d/.test(password),match:Boolean(password)&&password===confirm};
  async function submit(event:FormEvent){event.preventDefault();setError(null);setMessage(null);if(!token){setError("This reset link is incomplete. Request a new one.");return;}if(!checks.length||!checks.upper||!checks.lower||!checks.number){setError("Your password does not meet all security requirements.");return;}if(!checks.match){setError("Passwords do not match.");return;}setLoading(true);try{const result=await apiRequest<{message:string}>("/auth/password/reset",{method:"POST",body:{token,new_password:password,confirm_password:confirm}});setMessage(result.message);}catch(cause){setError(cause instanceof ApiError?cause.message:"Unable to reset this password.");}finally{setLoading(false);}}
  return <ActionLayout variant="reset" eyebrow="ACCOUNT RECOVERY" title="Create a new password." description="Choose a strong password you have not used for this account before.">
    <div className={styles.heading}><span className={styles.step}>2</span><div><h2>{message?"Password updated":"Choose a new password"}</h2><p>{message?"Your other sessions were signed out to protect your account.":"Complete every requirement below before continuing."}</p></div></div>
    {message?<div className={styles.complete}><span><FiCheck/></span><Notice message={message} error={null}/><Link className={`primary-button ${styles.submit}`} href="/login">Log in with new password <icons.Arrow/></Link></div>:<form className={styles.form} onSubmit={submit}><Field label="New password" icon={icons.Lock} placeholder="Create a secure password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="new-password"/><Field label="Confirm password" icon={icons.Lock} placeholder="Repeat your password" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required autoComplete="new-password"/><div className={styles.requirements}><Check ok={checks.length}>At least 12 characters</Check><Check ok={checks.upper&&checks.lower}>Uppercase and lowercase letters</Check><Check ok={checks.number}>At least one number</Check><Check ok={checks.match}>Passwords match</Check></div><SubmitButton loading={loading} label="Reset password"/><Notice message={null} error={error}/></form>}
  </ActionLayout>;
}

function Check({ok,children}:{ok:boolean;children:ReactNode}){return <span className={ok?styles.met:""}><FiCheck/>{children}</span>;}
