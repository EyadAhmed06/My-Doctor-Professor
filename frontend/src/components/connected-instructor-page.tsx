"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FiBookOpen, FiCheck, FiClipboard, FiEdit3, FiLayers } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import "./product-pages.css";

type Dashboard={questions:number;tests:number;decks:number;attempts:number;students:number;average_score:string;pending_essay_answers:number};
type Test={id:string;title:string;description:string|null;testType:string;durationMinutes:number|null;totalMarks:string|null;isPublished:boolean;createdAt:string;course?:{courseName?:string}|null};
type Page<T>={data:T[];page:number;limit:number;total?:number};

export function ConnectedInstructorPage(){const {user,request}=useAuth();const [dashboard,setDashboard]=useState<Dashboard|null>(null);const [tests,setTests]=useState<Test[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);
 useEffect(()=>{if(!user||user.role==="STUDENT")return;let active=true;void Promise.all([request<Dashboard>(user.role==="SYSTEM_ADMIN"?"/dashboard/admin":"/dashboard/instructor"),request<Page<Test>>("/tests?limit=50")]).then(([stats,list])=>{if(active){setDashboard(stats as Dashboard);setTests(list.data);}}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Unable to load instructor workspace.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[user,request]);
 if(user?.role==="STUDENT")return <ProductShell><main className="pp-page"><Panel title="Instructor access required"><p>This workspace is available only to instructor and administrator accounts.</p></Panel></main></ProductShell>;
 const metrics = [
  {label:"Questions",value:dashboard?.questions||0,Icon:FiBookOpen},
  {label:"Tests",value:dashboard?.tests||0,Icon:FiClipboard},
  {label:"Decks",value:dashboard?.decks||0,Icon:FiLayers},
  {label:"Attempts",value:dashboard?.attempts||0,Icon:FiCheck},
  {label:"Students",value:dashboard?.students||0,Icon:FiBookOpen},
  {label:"Essays to grade",value:dashboard?.pending_essay_answers||0,Icon:FiEdit3},
 ];
 return <ProductShell search="Search your assessments"><main className="pp-page"><div className="pp-title hero"><div><small className="page-eyebrow">INSTRUCTOR WORKSPACE</small><h1>Assessment Builder</h1><p>Counts and assessments are loaded from instructor-owned backend records.</p></div><div><Link className="pp-button" href="/instructor/flashcards"><FiLayers/> Flashcards</Link></div></div>{error&&<p className="form-error" role="alert">{error}</p>}{loading?<div className="product-auth-loading">Loading instructor workspace…</div>:<><div className="pp-metrics">{metrics.map(({label,value,Icon})=><Panel className="pp-metric" key={label}><span><Icon/></span><div><b>{value}</b><small>{label}</small></div></Panel>)}</div><Panel title="Your assessments">{tests.length?<div className="quiz-grid">{tests.map(test=><article className="pp-panel" key={test.id}><small>{test.isPublished?"PUBLISHED":"DRAFT"} · {test.testType}</small><h2>{test.title}</h2><p>{test.course?.courseName||"No course"}{test.durationMinutes?` · ${test.durationMinutes} minutes`:""}</p><p>{test.description||"No description"}</p><Link className="pp-button secondary" href={`/past-exams`}>Open assessment area</Link></article>)}</div>:<p>You have not created any assessments yet.</p>}</Panel></>}</main></ProductShell>}
