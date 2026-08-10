"use client";

import Link from "next/link";
import { BRAND_NAME, BrandLockup } from "./brand";
import {
  FiActivity, FiArrowRight, FiBarChart2, FiBookOpen, FiCalendar, FiCheck,
  FiChevronDown, FiClipboard, FiEye, FiEyeOff, FiLock, FiMail, FiShield,
  FiTrendingUp, FiUser, FiUsers, FiStar
} from "react-icons/fi";
import { ChangeEventHandler, FormEvent, ReactNode, useState } from "react";

export const icons = { Activity:FiActivity, Arrow:FiArrowRight, Bar:FiBarChart2, Book:FiBookOpen,
  Calendar:FiCalendar, Check:FiCheck, Down:FiChevronDown, Clipboard:FiClipboard, Eye:FiEye,
  EyeOff:FiEyeOff, Lock:FiLock, Mail:FiMail, Shield:FiShield, Trend:FiTrendingUp,
  User:FiUser, Users:FiUsers, Star:FiStar };

export function Brand() {
  return <BrandLockup className="brand" />;
}

export function Field({label,icon:Icon,placeholder,type="text",select=false,name,value,onChange,required=false,autoComplete}:{
  label:string; icon?:typeof FiUser; placeholder:string; type?:string; select?:boolean;
  name?:string; value?:string; onChange?:ChangeEventHandler<HTMLInputElement>; required?:boolean; autoComplete?:string;
}) {
  const [visible,setVisible]=useState(false);
  const password=type==="password";
  return <label className="field">
    <span>{label}</span>
    <span className="input-shell">
      {Icon && <Icon className="input-icon" />}
      <input name={name} value={value} onChange={onChange} required={required} autoComplete={autoComplete}
        type={password && visible ? "text" : type} placeholder={placeholder} />
      {select && <FiChevronDown className="input-tail" />}
      {password && <button type="button" className="input-tail icon-button" onClick={()=>setVisible(!visible)}
        aria-label={visible?"Hide password":"Show password"}>{visible?<FiEyeOff/>:<FiEye/>}</button>}
    </span>
  </label>;
}

export function SubmitForm({children,className="",buttonText,afterSubmit,onSubmit,loading=false,error}:{
  children:ReactNode; className?:string; buttonText:string; afterSubmit?:string;
  onSubmit?:(event:FormEvent<HTMLFormElement>)=>void|Promise<void>; loading?:boolean; error?:string|null;
}) {
  const [done,setDone]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setDone(false);
    if (onSubmit) await onSubmit(e);
    else setDone(true);
  }
  return <form className={className} onSubmit={submit}>{children}
    <button className="primary-button" type="submit" disabled={loading}><span>{loading?"Please wait…":done?"Ready to continue":buttonText}</span><FiArrowRight/></button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {done && afterSubmit && <p className="form-success">{afterSubmit}</p>}
  </form>;
}

export function Benefit({icon:Icon,title,children}:{icon:typeof FiUser;title:string;children:ReactNode}) {
  return <div className="benefit"><span className="benefit-icon"><Icon/></span><div><strong>{title}</strong><p>{children}</p></div></div>;
}

export function TrustStrip() {
  return <div className="trust-strip">
    <div><FiShield/><p><strong>Trusted by learners<br/>and educators.</strong><span>Across 1000+ teaching<br/>hospitals and universities.</span></p></div>
    <div><FiTrendingUp/><p><strong>Stronger reasoning.<br/>Better retention.</strong><span>Clinically proven methods<br/>that make knowledge stick.</span></p></div>
    <div><FiBarChart2/><p><strong>Measurable impact.<br/>Real results.</strong><span>Learners report improved<br/>confidence and decision-making.</span></p></div>
  </div>;
}

export function PageFooter() {
  return <footer><span>© 2026 {BRAND_NAME}. All rights reserved.</span>
    <nav><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link></nav></footer>;
}

export function SecureNote() { return <div className="secure-note"><FiShield/> Your data is secure and encrypted.</div>; }
