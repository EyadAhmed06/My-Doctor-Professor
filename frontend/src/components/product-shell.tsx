"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FiBell, FiChevronDown, FiMenu, FiSearch, FiX } from "react-icons/fi";
import { ThemeToggle } from "./app-theme";
import { BrandLockup } from "./brand";

const nav = [["Rounds","/rounds"],["Past Exams","/past-exams"],["Notebook","/notebook"],["Study Guides","/guidelines"],["Drug Reference","/references/drugs/lisinopril"],["Study Plan","/study-plan"]];

export function ProductShell({ children, search = "Search cases, topics, or concepts" }: { children: React.ReactNode; search?: string }) {
  const path = usePathname();
  const [open,setOpen] = useState(false);
  return <div className="product-app">
    <header className="pp-topbar">
      <BrandLockup className="pp-brand" href="/dashboard" />
      <button className="pp-menu" onClick={()=>setOpen(true)} aria-label="Open menu"><FiMenu /></button>
      <nav className={open ? "open" : ""}><button className="pp-nav-close" onClick={()=>setOpen(false)}><FiX /></button>{nav.map(([label,href])=><Link key={href} className={path.startsWith(href) ? "active" : ""} href={href} onClick={()=>setOpen(false)}>{label}</Link>)}<Link href="/instructor/quizzes">Instructor</Link><Link href="/settings">Settings</Link></nav>
      <label className="pp-search"><FiSearch/><input placeholder={search}/></label>
      <div className="pp-profile"><ThemeToggle compact/><button><FiBell/><i>3</i></button><Image src="/dashboard/amr-avatar.png" alt="Amr Hassan" width={38} height={38}/><span><b>Amr Hassan</b><small>Medical Student</small></span><FiChevronDown/></div>
    </header>
    {children}
  </div>;
}

export function Panel({ title, action, children, className="" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`pp-panel ${className}`}>{(title || action) && <header><h2>{title}</h2>{action}</header>}{children}</section>;
}

export function Progress({ value, tone="teal" }: { value:number; tone?:"teal"|"violet"|"orange" }) { return <div className={`pp-progress ${tone}`}><i style={{width:`${value}%`}}/></div>; }
