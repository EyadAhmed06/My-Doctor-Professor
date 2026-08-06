"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FiBell, FiChevronDown, FiMenu, FiSearch, FiX } from "react-icons/fi";
import { ThemeToggle } from "./app-theme";
import { BrandLockup } from "./brand";
import { useAuth } from "./auth-provider";
import { CommandPalette } from "./command-palette";
import { PageSkeleton } from "./async-state";

const nav = [["My Bundles","/bundles"],["Flashcards","/flashcards"],["Notebook","/notebook"],["Study Guides","/guidelines"],["Analytics","/analytics"],["Study Plan","/study-plan"]];

export function ProductShell({ children, search = "Search cases, topics, or concepts" }: { children: React.ReactNode; search?: string }) {
  const path = usePathname();
  const router = useRouter();
  const {user,loading,logout,request}=useAuth();
  const [open,setOpen] = useState(false);
  const [paletteOpen,setPaletteOpen] = useState(false);
  const [unread,setUnread] = useState(0);
  const openPalette=useCallback(()=>setPaletteOpen(true),[]);
  const closePalette=useCallback(()=>setPaletteOpen(false),[]);
  const loadUnread=useCallback(async()=>{
    if(!user)return;
    try{setUnread((await request<{count:number}>("/notifications/unread/count")).count);}
    catch{setUnread(0);}
  },[user,request]);

  useEffect(()=>{if(!loading&&!user)router.replace(`/login?next=${encodeURIComponent(path)}`);},[loading,user,router,path]);
  useEffect(()=>{void loadUnread();},[loadUnread]);
  useEffect(()=>{
    const refresh=()=>void loadUnread();
    window.addEventListener("mdp:notifications-changed",refresh);
    return()=>window.removeEventListener("mdp:notifications-changed",refresh);
  },[loadUnread]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false);};
    window.addEventListener("keydown",close);
    return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",close);};
  },[open]);
  useEffect(()=>setOpen(false),[path]);

  if(loading||!user)return <main className="product-auth-loading"><PageSkeleton variant="workspace" label="Loading your workspace"/></main>;
  const displayName=user.fullName||user.full_name||user.email;
  const roleLabel=user.role==="SYSTEM_ADMIN"?"System Administrator":user.role==="INSTRUCTOR"?"Instructor":"Medical Student";
  return <div className="product-app">
    <header className="pp-topbar">
      <BrandLockup className="pp-brand" href="/dashboard" />
      <button className="pp-menu" onClick={()=>setOpen(true)} aria-label="Open menu" aria-expanded={open}><FiMenu /></button>
      {open&&<button className="pp-mobile-overlay" type="button" aria-label="Close navigation" onClick={()=>setOpen(false)}/>} 
      <nav className={open ? "open" : ""} aria-label="Primary navigation"><button className="pp-nav-close" type="button" onClick={()=>setOpen(false)} aria-label="Close menu"><FiX /></button>{nav.map(([label,href])=><Link key={href} className={path.startsWith(href) ? "active" : ""} href={href} onClick={()=>setOpen(false)}>{label}</Link>)}{user.role!=="STUDENT"&&<Link href="/instructor/quizzes">Instructor</Link>}<Link href="/settings">Settings</Link></nav>
      <button className="pp-search-command" type="button" onClick={openPalette} aria-label={`Open command palette. ${search}`}><FiSearch/><span>{search}</span><kbd>⌘ K</kbd></button>
      <div className="pp-profile"><ThemeToggle compact/><button aria-label={`${unread} unread notifications`} onClick={()=>router.push("/notifications")}><FiBell/>{unread>0&&<i>{unread>99?"99+":unread}</i>}</button><span className="avatar-fallback">{displayName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase()}</span><span><b>{displayName}</b><small>{roleLabel}</small></span><button className="pp-logout" onClick={()=>void logout().then(()=>router.replace("/login"))}>Log out</button><FiChevronDown/></div>
    </header>
    {children}
    <CommandPalette open={paletteOpen} onOpen={openPalette} onClose={closePalette} role={user.role}/>
  </div>;
}

export function Panel({ title, action, children, className="" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`pp-panel ${className}`}>{(title || action) && <header><h2>{title}</h2>{action}</header>}{children}</section>;
}

export function Progress({ value, tone="teal" }: { value:number; tone?:"teal"|"violet"|"orange" }) { return <div className={`pp-progress ${tone}`}><i style={{width:`${value}%`}}/></div>; }
