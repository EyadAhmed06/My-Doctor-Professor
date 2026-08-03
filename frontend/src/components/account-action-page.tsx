"use client";

import { apiRequest, ApiError } from "@/lib/api";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Brand, Field, icons } from "./ui";

function ActionLayout({ title, description, children }: { title:string; description:string; children:React.ReactNode }) {
  return <main className="registration-page account-action-page"><section className="registration-story"><Brand/><div><h1>{title}</h1><p>{description}</p></div></section><section className="registration-form-side"><div className="registration-card">{children}</div></section></main>;
}

function Notice({ message, error }: { message:string|null; error:string|null }) {
  return <>{message&&<p className="form-success" role="status">{message}</p>}{error&&<p className="form-error" role="alert">{error}</p>}</>;
}

export function ForgotPasswordPage(){
  const [email,setEmail]=useState("");const [message,setMessage]=useState<string|null>(null);const [error,setError]=useState<string|null>(null);const [loading,setLoading]=useState(false);
  async function submit(event:FormEvent){event.preventDefault();setLoading(true);setError(null);try{const result=await apiRequest<{message:string}>("/auth/password/forgot",{method:"POST",body:{email}});setMessage(result.message);}catch(cause){setError(cause instanceof ApiError?cause.message:"Unable to submit the request.");}finally{setLoading(false);}}
  return <ActionLayout title="Reset your password" description="Enter your account email. If it is eligible, we will send a secure reset link."><form className="login-form" onSubmit={submit}><Field label="Email address" icon={icons.Mail} placeholder="you@example.com" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><button className="primary-button" disabled={loading}>{loading?"Please wait…":"Send reset link"}</button><Notice message={message} error={error}/><p className="switch-copy"><Link href="/login">Back to login</Link></p></form></ActionLayout>;
}

export function VerifyEmailPage(){
  const search=useSearchParams();const token=search.get("token");const email=search.get("email")||"";const [message,setMessage]=useState<string|null>(null);const [error,setError]=useState<string|null>(null);const [loading,setLoading]=useState(Boolean(token));
  useEffect(()=>{if(!token)return;void apiRequest<{message:string}>("/auth/email-verification/confirm",{method:"POST",body:{token}}).then(result=>setMessage(result.message)).catch(cause=>setError(cause instanceof ApiError?cause.message:"Unable to verify this email.")).finally(()=>setLoading(false));},[token]);
  async function resend(){setLoading(true);setError(null);try{const result=await apiRequest<{message:string}>("/auth/email-verification/request",{method:"POST",body:{email}});setMessage(result.message);}catch(cause){setError(cause instanceof ApiError?cause.message:"Unable to resend verification.");}finally{setLoading(false);}}
  return <ActionLayout title="Verify your email" description={token?"We are confirming your secure verification link.":"Check your inbox to activate your account before signing in."}><Notice message={loading?"Verifying…":message} error={error}/>{!token&&email&&<button className="primary-button" onClick={resend} disabled={loading}>Resend verification email</button>}<p className="switch-copy"><Link href="/login">Continue to login</Link></p></ActionLayout>;
}

export function ResetPasswordPage(){
  const token=useSearchParams().get("token")||"";const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");const [message,setMessage]=useState<string|null>(null);const [error,setError]=useState<string|null>(null);const [loading,setLoading]=useState(false);
  async function submit(event:FormEvent){event.preventDefault();setError(null);if(!token){setError("The reset link is missing its token.");return;}if(password!==confirm){setError("Passwords do not match.");return;}setLoading(true);try{const result=await apiRequest<{message:string}>("/auth/password/reset",{method:"POST",body:{token,new_password:password,confirm_password:confirm}});setMessage(result.message);}catch(cause){setError(cause instanceof ApiError?cause.message:"Unable to reset this password.");}finally{setLoading(false);}}
  return <ActionLayout title="Choose a new password" description="Use at least 12 characters with uppercase, lowercase, and a number."><form className="login-form" onSubmit={submit}><Field label="New password" icon={icons.Lock} placeholder="Create a secure password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/><Field label="Confirm password" icon={icons.Lock} placeholder="Repeat your password" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required/><button className="primary-button" disabled={loading}>{loading?"Please wait…":"Reset password"}</button><Notice message={message} error={error}/>{message&&<p className="switch-copy"><Link href="/login">Log in</Link></p>}</form></ActionLayout>;
}

