"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FiActivity, FiBookOpen, FiCheck, FiClipboard, FiRefreshCw, FiUsers } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell, Progress } from "./product-shell";
import "./product-pages.css";

type StudentCourse = {
  id:string; completionPercentage:string; lecturesCompleted:number; totalLectures:number;
  averageScore:string|null; course:{id:string;courseName:string;courseCode:string};
};
type Attempt = {id:string;status:string;score:string|null;submitted_at:string|null;test_id:string;title:string;total_marks:string|null;passing_marks:string|null};
type StudentDashboard = {
  courses:StudentCourse[];
  recent_attempts:Attempt[];
  questions:{attempts:number;correct_attempts:number;accuracy:string;bookmarked:number};
  flashcards:{reviewed:number;mastered:number;due:number};
};
type InstructorDashboard = {questions:number;tests:number;decks:number;attempts:number;students:number;average_score:string;pending_essay_answers:number};
type AdminDashboard = {users:number;active_users:number;students:number;instructors:number;courses:number;questions:number;tests:number;attempts:number;flashcard_decks:number};
type DashboardData = StudentDashboard|InstructorDashboard|AdminDashboard;

function number(value:string|number|null|undefined){return Number(value||0);}

export function ConnectedDashboardPage(){
  const {user,request}=useAuth();
  const [data,setData]=useState<DashboardData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const displayName=user?.fullName||user?.full_name||user?.email||"User";
  const firstName=displayName.trim().split(/\s+/)[0]||displayName;

  async function load(){
    if(!user)return;
    setLoading(true);setError(null);
    const endpoint=user.role==="SYSTEM_ADMIN"?"/dashboard/admin":user.role==="INSTRUCTOR"?"/dashboard/instructor":"/dashboard/student";
    try{setData(await request<DashboardData>(endpoint));}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to load your dashboard.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{
    if(!user)return;
    let active=true;
    const endpoint=user.role==="SYSTEM_ADMIN"?"/dashboard/admin":user.role==="INSTRUCTOR"?"/dashboard/instructor":"/dashboard/student";
    void request<DashboardData>(endpoint)
      .then(value=>{if(active)setData(value);})
      .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Unable to load your dashboard.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[user,request]);

  return <ProductShell><main className="pp-page"><div className="pp-title hero"><div><small className="page-eyebrow">LIVE WORKSPACE</small><h1>Welcome back, {firstName}</h1><p>Everything below is calculated from your current database records.</p></div><button className="pp-button secondary" onClick={()=>void load()} disabled={loading}><FiRefreshCw/> Refresh</button></div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {loading?<div className="product-auth-loading">Loading your dashboard…</div>:!data?<Panel title="No dashboard data"><p>The server returned no dashboard data for this account.</p></Panel>:user?.role==="STUDENT"?<StudentView data={data as StudentDashboard}/>:user?.role==="INSTRUCTOR"?<InstructorView data={data as InstructorDashboard}/>:<AdminView data={data as AdminDashboard}/>}</main></ProductShell>;
}

function StudentView({data}:{data:StudentDashboard}){
  return <><div className="pp-metrics"><Panel className="pp-metric"><FiClipboard/><div><b>{number(data.questions.attempts)}</b><small>Questions answered</small></div></Panel><Panel className="pp-metric"><FiCheck/><div><b>{number(data.questions.accuracy)}%</b><small>Question accuracy</small></div></Panel><Panel className="pp-metric"><FiBookOpen/><div><b>{number(data.flashcards.due)}</b><small>Flashcards due</small></div></Panel><Panel className="pp-metric"><FiActivity/><div><b>{number(data.flashcards.mastered)}</b><small>Flashcards mastered</small></div></Panel></div>
    <div className="pp-duo"><Panel title="Course progress" action={<Link href="/rounds">Open curriculum</Link>}>{data.courses.length?data.courses.map(item=><article className="selected-scope" key={item.id}><div><b>{item.course.courseCode} · {item.course.courseName}</b><p>{item.lecturesCompleted} of {item.totalLectures} lectures completed</p><Progress value={number(item.completionPercentage)}/></div><strong>{number(item.completionPercentage)}%</strong></article>):<p>No active course progress exists yet. Open a lecture to begin tracking.</p>}</Panel>
      <Panel title="Recent assessments" action={<Link href="/past-exams">Open assessments</Link>}>{data.recent_attempts.length?data.recent_attempts.map(item=><article className="selected-scope" key={item.id}><div><b>{item.title}</b><p>{item.status}{item.submitted_at?` · ${new Date(item.submitted_at).toLocaleDateString()}`:""}</p></div><strong>{item.score??"—"}{item.total_marks?` / ${item.total_marks}`:""}</strong></article>):<p>No assessment attempts yet.</p>}</Panel></div>
    <div className="pp-duo"><Panel title="Review queue"><p><b>{data.flashcards.due}</b> flashcards are currently due based on the spaced-repetition schedule.</p><Link className="pp-button" href="/flashcards">Start review</Link></Panel><Panel title="Saved questions"><p><b>{data.questions.bookmarked}</b> questions are bookmarked in your progress records.</p><Link className="pp-button secondary" href="/past-exams">Practice questions</Link></Panel></div></>;
}

function InstructorView({data}:{data:InstructorDashboard}){return <><div className="pp-metrics">{[["Questions",data.questions],["Tests",data.tests],["Flashcard decks",data.decks],["Student attempts",data.attempts],["Unique students",data.students],["Average score",`${number(data.average_score)}%`],["Essays awaiting grading",data.pending_essay_answers]].map(([label,value])=><Panel className="pp-metric" key={label}><FiClipboard/><div><b>{value}</b><small>{label}</small></div></Panel>)}</div><Panel title="Instructor actions"><Link className="pp-button" href="/instructor/quizzes">Manage assessments</Link> <Link className="pp-button secondary" href="/instructor/flashcards">Manage flashcards</Link></Panel></>}

function AdminView({data}:{data:AdminDashboard}){return <div className="pp-metrics">{Object.entries(data).map(([label,value])=><Panel className="pp-metric" key={label}><FiUsers/><div><b>{value}</b><small>{label.replaceAll("_"," ")}</small></div></Panel>)}</div>}
