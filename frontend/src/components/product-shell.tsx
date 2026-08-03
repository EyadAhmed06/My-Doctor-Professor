"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FiBell, FiChevronDown, FiMenu, FiSearch, FiX } from "react-icons/fi";
import { ThemeToggle } from "./app-theme";
import { BrandLockup } from "./brand";
import { useAuth } from "./auth-provider";

const nav = [["Rounds","/rounds"],["Past Exams","/past-exams"],["Flashcards","/flashcards"],["Notebook","/notebook"],["Study Guides","/guidelines"],["Drug Reference","/references/drugs/lisinopril"],["Study Plan","/study-plan"]];

export function ProductShell({ children, search = "Search cases, topics, or concepts" }: { children: React.ReactNode; search?: string }) {
  const path = usePathname();
  const router = useRouter();
  const {user,loading,logout}=useAuth();
  const [open,setOpen] = useState(false);
  useEffect(()=>{if(!loading&&!user)router.replace(`/login?next=${encodeURIComponent(path)}`);},[loading,user,router,path]);
  if(loading||!user)return <div className="product-auth-loading" role="status">Loading your workspace…</div>;
  const displayName=user.fullName||user.full_name||user.email;
  const roleLabel=user.role==="SYSTEM_ADMIN"?"System Administrator":user.role==="INSTRUCTOR"?"Instructor":"Medical Student";
  return <div className="product-app">
    <header className="pp-topbar">
      <BrandLockup className="pp-brand" href="/dashboard" />
      <button className="pp-menu" onClick={()=>setOpen(true)} aria-label="Open menu"><FiMenu /></button>
      <nav className={open ? "open" : ""}><button className="pp-nav-close" onClick={()=>setOpen(false)}><FiX /></button>{nav.map(([label,href])=><Link key={href} className={path.startsWith(href) ? "active" : ""} href={href} onClick={()=>setOpen(false)}>{label}</Link>)}{user.role!=="STUDENT"&&<Link href="/instructor/quizzes">Instructor</Link>}<Link href="/settings">Settings</Link></nav>
      <label className="pp-search"><FiSearch/><input placeholder={search}/></label>
      <div className="pp-profile"><ThemeToggle compact/><button><FiBell/><i>3</i></button><span className="avatar-fallback">{displayName.slice(0,2).toUpperCase()}</span><span><b>{displayName}</b><small>{roleLabel}</small></span><button className="pp-logout" onClick={()=>void logout().then(()=>router.replace("/login"))}>Log out</button><FiChevronDown/></div>
    </header>
    {children}
  </div>;
}

export function Panel({ title, action, children, className="" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`pp-panel ${className}`}>{(title || action) && <header><h2>{title}</h2>{action}</header>}{children}</section>;
}

export function Progress({ value, tone="teal" }: { value:number; tone?:"teal"|"violet"|"orange" }) { return <div className={`pp-progress ${tone}`}><i style={{width:`${value}%`}}/></div>; }
