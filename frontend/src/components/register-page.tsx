"use client";

import Link from "next/link";
import { FiArrowLeft, FiBookOpen, FiCloud, FiShield, FiUsers } from "react-icons/fi";
import { Brand, Field, icons, SubmitForm } from "./ui";
import { apiRequest } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import type { GoogleOnboardingResult } from "./auth-provider";
import { GoogleSignInButton } from "./google-sign-in-button";
import { AuthMotion } from "./auth-motion";
import styles from "./register-page.module.css";

const registrationProof=[
  {Icon:FiShield,title:"Secure & Private",copy:"Your account actions use protected links"},
  {Icon:FiBookOpen,title:"For Medical Students",copy:"Built specially for your journey"},
  {Icon:FiCloud,title:"Access Anywhere",copy:"Continue from your signed-in browser"},
  {Icon:FiUsers,title:"Structured Learning",copy:"Courses, questions, notes, and review"},
];

const ARAB_COUNTRY_CODES=[
  {code:"+20",label:"Egypt",flag:"🇪🇬"},
  {code:"+966",label:"Saudi Arabia",flag:"🇸🇦"},
  {code:"+971",label:"UAE",flag:"🇦🇪"},
  {code:"+965",label:"Kuwait",flag:"🇰🇼"},
  {code:"+974",label:"Qatar",flag:"🇶🇦"},
  {code:"+973",label:"Bahrain",flag:"🇧🇭"},
  {code:"+968",label:"Oman",flag:"🇴🇲"},
  {code:"+962",label:"Jordan",flag:"🇯🇴"},
  {code:"+961",label:"Lebanon",flag:"🇱🇧"},
  {code:"+964",label:"Iraq",flag:"🇮🇶"},
  {code:"+963",label:"Syria",flag:"🇸🇾"},
  {code:"+970",label:"Palestine",flag:"🇵🇸"},
  {code:"+967",label:"Yemen",flag:"🇾🇪"},
  {code:"+212",label:"Morocco",flag:"🇲🇦"},
  {code:"+213",label:"Algeria",flag:"🇩🇿"},
  {code:"+216",label:"Tunisia",flag:"🇹🇳"},
  {code:"+218",label:"Libya",flag:"🇱🇾"},
  {code:"+249",label:"Sudan",flag:"🇸🇩"},
  {code:"+252",label:"Somalia",flag:"🇸🇴"},
  {code:"+253",label:"Djibouti",flag:"🇩🇯"},
  {code:"+269",label:"Comoros",flag:"🇰🇲"},
  {code:"+222",label:"Mauritania",flag:"🇲🇷"},
] as const;

const GOOGLE_ONBOARDING_KEY="mdp_google_onboarding";

function readGoogleOnboarding():GoogleOnboardingResult|null{
  try{
    const raw=sessionStorage.getItem(GOOGLE_ONBOARDING_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw) as GoogleOnboardingResult;
    return parsed?.requires_onboarding===true&&Boolean(parsed.onboarding_token)&&Boolean(parsed.profile?.email)?parsed:null;
  }catch{return null;}
}

function normalizePhone(countryCode:string,localNumber:string):string|null{
  const nationalDigits=localNumber.replace(/\D/g,"").replace(/^0+/,"");
  const normalized=`${countryCode}${nationalDigits}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized)?normalized:null;
}

export function RegisterPage() {
  const router=useRouter();
  const {googleLogin,completeGoogleSignup,user,loading:authLoading}=useAuth();
  const [form,setForm]=useState({full_name:"",email:"",password:"",confirm_password:"",current_semester:"1"});
  const [phoneCountry,setPhoneCountry]=useState("+20");
  const [phoneLocal,setPhoneLocal]=useState("");
  const [googleOnboarding,setGoogleOnboarding]=useState<GoogleOnboardingResult|null>(null);
  const [accepted,setAccepted]=useState(false);
  const [loading,setLoading]=useState(false);
  const [googleLoading,setGoogleLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const update=(key:keyof typeof form)=>(event:React.ChangeEvent<HTMLInputElement>)=>setForm(current=>({...current,[key]:key==="current_semester"?String(Math.min(6,Math.max(1,Number.parseInt(event.target.value||"1",10)||1))):event.target.value}));

  useEffect(()=>{
    if(!authLoading&&user){router.replace("/dashboard");return;}
    const stored=readGoogleOnboarding();
    if(stored){
      setGoogleOnboarding(stored);
      setForm(current=>({...current,full_name:stored.profile.full_name,email:stored.profile.email,password:"",confirm_password:""}));
    }
  },[authLoading,router,user]);

  async function submit(){
    setError(null);
    const phoneNumber=normalizePhone(phoneCountry,phoneLocal);
    if(!phoneNumber){setError("Enter a valid phone number for the selected country.");return;}
    if(!accepted){setError("You must agree to the Terms of Service and Privacy Policy.");return;}
    if(!googleOnboarding&&form.password!==form.confirm_password){setError("Passwords do not match.");return;}
    setLoading(true);
    try{
      if(googleOnboarding){
        await completeGoogleSignup({
          onboarding_token:googleOnboarding.onboarding_token,
          phone_number:phoneNumber,
          current_semester:Number(form.current_semester),
        });
        sessionStorage.removeItem(GOOGLE_ONBOARDING_KEY);
        router.replace("/dashboard");
      }else{
        await apiRequest<{message:string}>("/auth/signup",{method:"POST",body:{full_name:form.full_name,email:form.email,phone_number:phoneNumber,password:form.password,role:"STUDENT",current_semester:Number(form.current_semester)}});
        router.push(`/verify-email?email=${encodeURIComponent(form.email)}`);
      }
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to create your account. Please try again.");}
    finally{setLoading(false);}
  }

  const handleGoogleCredential=useCallback(async(credential:string)=>{
    if(authLoading||googleLoading)return;
    setGoogleLoading(true);setError(null);
    try{
      const result=await googleLogin(credential);
      if("requires_onboarding" in result){
        sessionStorage.setItem(GOOGLE_ONBOARDING_KEY,JSON.stringify(result));
        setGoogleOnboarding(result);
        setForm(current=>({...current,full_name:result.profile.full_name,email:result.profile.email,password:"",confirm_password:""}));
      }else{
        router.replace("/dashboard");
      }
    }catch(cause){setError(cause instanceof Error?cause.message:"Google sign-up could not be started.");}
    finally{setGoogleLoading(false);}
  },[authLoading,googleLoading,googleLogin,router]);

  return <main className="registration-page reference-register auth-motion-page" data-auth-motion-root>
    <AuthMotion variant="register" />
    <section className="registration-story auth-motion-story">
      <Brand />
      <figure className="auth-organ-visual lungs-story-image">
        <img src="/media/register-lungs-reference.png" alt="Luminous respiratory system anatomy illustration" />
      </figure>
    </section>
    <section className="registration-form-side auth-motion-form">
      <div className="registration-card">
        <div className="registration-top"><Link href="/"><FiArrowLeft /> Back to home</Link><span>Already registered? <Link href="/login">Log in</Link></span></div>
        <div className="registration-content">
          <span className="step-label">ACCOUNT SETUP</span><h2>{googleOnboarding?"Complete your student profile":"Create your account"}</h2><p>{googleOnboarding?"Google verified your identity. Add the details required for your student workspace.":<>Tell us where you are in your medical journey.<br/>Your internal student ID will be created automatically.</>}</p>
          {googleOnboarding?<div className="google-linked-profile"><span>{googleOnboarding.profile.picture?<img src={googleOnboarding.profile.picture} alt="" referrerPolicy="no-referrer"/>:<b>G</b>}</span><div><strong>{googleOnboarding.profile.full_name}</strong><small>{googleOnboarding.profile.email}</small></div><em>Verified by Google</em></div>:<><GoogleSignInButton onCredential={handleGoogleCredential} disabled={authLoading||loading||googleLoading}/><div className="or"><span/>or use email<span/></div></>}
          <SubmitForm className="registration-form" buttonText={googleOnboarding?"Create student workspace":"Create account"} onSubmit={submit} loading={loading||authLoading} error={error}>
            <div className="form-grid">
              {!googleOnboarding&&<><Field label="Full name" icon={icons.User} placeholder="Enter your full name" value={form.full_name} onChange={update("full_name")} required autoComplete="name"/><Field label="Email address" icon={icons.Mail} placeholder="you@example.com" type="email" value={form.email} onChange={update("email")} required autoComplete="email"/></>}
              <label className={styles.phoneField}>
                <span>Phone number</span>
                <span className={styles.phoneShell}>
                  <select className={styles.countrySelect} value={phoneCountry} onChange={event=>setPhoneCountry(event.target.value)} aria-label="Country calling code">
                    {ARAB_COUNTRY_CODES.map(country=><option key={`${country.label}-${country.code}`} value={country.code}>{country.flag} {country.code} · {country.label}</option>)}
                  </select>
                  <input className={styles.phoneInput} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="100 123 4567" value={phoneLocal} onChange={event=>setPhoneLocal(event.target.value)} required maxLength={22}/>
                </span>
                <small className={styles.helper}>Choose your country code and enter the local number. We store it in international E.164 format.</small>
              </label>
              {!googleOnboarding&&<><Field label="Password" icon={icons.Lock} placeholder="12+ characters with upper, lower, and number" type="password" value={form.password} onChange={update("password")} required autoComplete="new-password"/><Field label="Confirm password" icon={icons.Lock} placeholder="Repeat your password" type="password" value={form.confirm_password} onChange={update("confirm_password")} required autoComplete="new-password"/></>}
            </div>
            <div className="registration-divider"><span>Academic information</span></div>
            <div className="form-grid academic-grid"><Field label="Current semester" placeholder="1" type="number" min={1} max={6} step={1} value={form.current_semester} onChange={update("current_semester")} required/></div>
            <label className="checkline terms"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>I agree to the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.</span></label>
          </SubmitForm>
          {googleLoading&&<p className="google-auth-status" role="status">Verifying your Google account…</p>}
          <footer className="registration-proof-strip auth-motion-footer">
            {registrationProof.map(({Icon,title,copy})=><div key={title}><Icon/><b>{title}</b><small>{copy}</small></div>)}
          </footer>
        </div>
      </div>
    </section>
  </main>;
}
