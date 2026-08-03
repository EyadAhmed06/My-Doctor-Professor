"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  FiActivity, FiAward, FiBarChart2, FiBell, FiBookOpen, FiChevronRight,
  FiClipboard, FiClock, FiFileText, FiHeart, FiHome, FiMenu, FiMoon,
  FiRefreshCw, FiSearch, FiSettings, FiSun, FiUsers, FiX,
} from "react-icons/fi";
import { useAppTheme } from "./app-theme";
import { useAuth } from "./auth-provider";
import { BrandLockup } from "./brand";
import { Panel, ProductShell } from "./product-shell";
import "./dashboard.css";
import "./product-pages.css";

type StudentCourse = { id:string; completionPercentage:string; lecturesCompleted:number; totalLectures:number; averageScore:string|null; course:{id:string;courseName:string;courseCode:string} };
type Attempt = { id:string;status:string;score:string|null;submitted_at:string|null;test_id:string;title:string;total_marks:string|null;passing_marks:string|null };
type StudentDashboard = { courses:StudentCourse[];recent_attempts:Attempt[];questions:{attempts:number;correct_attempts:number;accuracy:string;bookmarked:number};flashcards:{reviewed:number;mastered:number;due:number} };
type InstructorDashboard = {questions:number;tests:number;decks:number;attempts:number;students:number;average_score:string;pending_essay_answers:number};
type AdminDashboard = {users:number;active_users:number;students:number;instructors:number;courses:number;questions:number;tests:number;attempts:number;flashcard_decks:number};
type NotebookPage = {data:Array<{id:string;title:string;content:string}>};

const number = (value:string|number|null|undefined) => Number(value || 0);
const clamp = (value:number) => Math.max(0, Math.min(100, value));

export function ConnectedDashboardPage() {
  const { user, request } = useAuth();
  const [data,setData] = useState<StudentDashboard|InstructorDashboard|AdminDashboard|null>(null);
  const [pearl,setPearl] = useState<NotebookPage["data"][number]|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);

  async function load() {
    if (!user) return;
    setLoading(true); setError(null);
    const endpoint = user.role === "SYSTEM_ADMIN" ? "/dashboard/admin" : user.role === "INSTRUCTOR" ? "/dashboard/instructor" : "/dashboard/student";
    try {
      const dashboard = await request<StudentDashboard|InstructorDashboard|AdminDashboard>(endpoint);
      setData(dashboard);
      if (user.role === "STUDENT") {
        const notes = await request<NotebookPage>("/notebook/notes?note_type=PEARL&limit=1").catch(() => ({data:[]}));
        setPearl(notes.data[0] || null);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load your dashboard."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    const endpoint = user.role === "SYSTEM_ADMIN" ? "/dashboard/admin" : user.role === "INSTRUCTOR" ? "/dashboard/instructor" : "/dashboard/student";
    void request<StudentDashboard|InstructorDashboard|AdminDashboard>(endpoint)
      .then(async dashboard => {
        if (!active) return;
        setData(dashboard);
        if (user.role === "STUDENT") {
          const notes = await request<NotebookPage>("/notebook/notes?note_type=PEARL&limit=1").catch(() => ({data:[]}));
          if (active) setPearl(notes.data[0] || null);
        }
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load your dashboard."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user,request]);

  if (user?.role === "STUDENT") return <StudentDashboardScreen data={data as StudentDashboard|null} pearl={pearl} loading={loading} error={error} reload={load}/>;
  return <ProductShell><main className="pp-page"><div className="pp-title hero"><div><small className="page-eyebrow">LIVE WORKSPACE</small><h1>{user?.role === "INSTRUCTOR" ? "Instructor dashboard" : "Administration dashboard"}</h1><p>All totals below come from current database records.</p></div><button className="pp-button secondary" onClick={() => void load()}><FiRefreshCw/> Refresh</button></div>{error&&<p className="form-error">{error}</p>}{loading?<div className="product-auth-loading">Loading dashboard…</div>:data?<RoleTotals data={data as InstructorDashboard|AdminDashboard}/>:null}</main></ProductShell>;
}

function StudentDashboardScreen({data,pearl,loading,error,reload}:{data:StudentDashboard|null;pearl:NotebookPage["data"][number]|null;loading:boolean;error:string|null;reload:()=>Promise<void>}) {
  const router = useRouter();
  const {user,logout,request} = useAuth();
  const {theme,toggleTheme} = useAppTheme();
  const [menu,setMenu] = useState(false);
  const [unread,setUnread] = useState(0);
  const displayName = user?.fullName || user?.full_name || user?.email || "Student";
  const firstName = displayName.trim().split(/\s+/)[0];
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase();
  const accuracy = clamp(number(data?.questions.accuracy));
  const completedLectures = data?.courses.reduce((sum,item)=>sum+item.lecturesCompleted,0) || 0;
  const totalLectures = data?.courses.reduce((sum,item)=>sum+item.totalLectures,0) || 0;
  const overallProgress = totalLectures ? clamp(Math.round(completedLectures*100/totalLectures)) : 0;
  const reviewed = number(data?.flashcards.reviewed);
  const mastered = number(data?.flashcards.mastered);
  const level = Math.max(1, Math.floor((number(data?.questions.correct_attempts)+mastered)/100)+1);
  const levelProgress = (number(data?.questions.correct_attempts)+mastered)%100;
  const activity = useMemo(()=>[0,0,0,0,0,0,0],[]);

  useEffect(()=>{let active=true;void request<{count:number}>("/notifications/unread/count").then(value=>{if(active)setUnread(value.count)}).catch(()=>{});return()=>{active=false}},[request]);

  return <div className="dashboard-shell" data-theme={theme}>
    <aside className={`dash-sidebar ${menu?"open":""}`}><button className="sidebar-close" onClick={()=>setMenu(false)}><FiX/></button><BrandLockup className="dash-brand" href="/dashboard"/>
      <nav><Link className="active" href="/dashboard"><FiHome/>Dashboard</Link><Link href="/rounds"><FiBookOpen/>Rounds</Link><Link href="/past-exams"><FiClipboard/>Cases</Link><Link href="/flashcards"><FiActivity/>Review</Link><Link href="/notebook"><FiFileText/>Notebook</Link><Link href="/guidelines"><FiBookOpen/>References</Link></nav>
      <Link className="settings-link" href="/settings"><FiSettings/>Settings</Link>
      <div className="level-mini"><div className="level-badge">{level}</div><div><strong>Level {level}</strong><span>Clinical Learner</span><div className="mini-progress"><i style={{width:`${levelProgress}%`}}/></div><small>{levelProgress} / 100 XP</small></div><FiChevronRight/></div>
      <div className="cme-card"><FiAward/><div><strong>Study resources</strong><span>Continue learning from your real courses and lectures.</span><button onClick={()=>router.push("/rounds")}>Explore</button></div></div>
    </aside>
    <div className="dash-body"><header className="dash-topbar"><button className="mobile-menu" onClick={()=>setMenu(true)}><FiMenu/></button><label className="dash-search"><FiSearch/><input placeholder="Search cases, topics, or concepts"/><kbd>⌘ K</kbd></label><div className="top-actions"><button className="theme-toggle" onClick={toggleTheme}><FiSun/><span className="toggle-track"><i/></span><FiMoon/></button><button className="notification" onClick={()=>router.push("/notifications")}><FiBell/>{unread>0&&<span>{unread>99?"99+":unread}</span>}</button><span className="avatar avatar-user">{initials}</span><div className="profile-copy"><strong>{displayName}</strong><span>Medical Student</span></div><button className="pp-logout" onClick={()=>void logout().then(()=>router.replace("/login"))}>Log out</button></div></header>
      <main className="dash-content">
        {error&&<p className="form-error" role="alert">{error} <button onClick={()=>void reload()}>Retry</button></p>}
        <section className="welcome"><p className="eyebrow">TODAY&apos;S FOCUS</p><h1>Welcome back, {firstName}</h1><p>You&apos;re building clinical expertise every day.</p><strong>{data?.courses[0]?`Continue ${data.courses[0].course.courseName}: ${data.courses[0].lecturesCompleted} of ${data.courses[0].totalLectures} lectures completed.`:"Your focus will appear after you open your first course."}</strong></section>
        <Card title="Clinical Momentum" subtitle="Your progress at a glance" className="momentum-card"><div className="metrics"><div className="metric primary"><span className="metric-icon"><FiClipboard/></span><div><small>Questions answered</small><b>{number(data?.questions.attempts)}</b><span>All time</span><em>{accuracy}% accuracy</em></div><FiBarChart2/></div><div className="metric"><span className="metric-icon flame"><FiActivity/></span><div><small>Study streak</small><b>0 <sup>days</sup></b><span>Tracking not available yet</span><div className="streak">{[0,1,2,3,4,5,6].map(day=><i className="off" key={day}/>)}</div></div></div><div className="metric"><span className="retention-ring" style={{background:`conic-gradient(var(--db-teal) 0 ${accuracy}%,var(--db-soft) ${accuracy}%)`}}>{accuracy}%</span><div><small>Retention</small><b>{accuracy}%</b><span>Question accuracy</span></div></div><div className="metric"><span className="metric-icon"><FiClock/></span><div><small>Study hours</small><b>0 <sup>hrs</sup></b><span>Tracking not available yet</span></div></div></div></Card>
        {loading&&!data?<div className="product-auth-loading">Loading your dashboard…</div>:<div className="main-grid"><div className="column-main"><div className="two-col"><Card title="Today&apos;s Plan" action={<Link href="/study-plan">View study plan →</Link>} className="plan-card"><div className="plan-list">{data?.courses.length?data.courses.slice(0,4).map((item,index)=><div className="plan-row" key={item.id}><time>Course</time><i className={`timeline-dot d${index}`}/><span className="plan-icon"><FiHeart/></span><div><strong>{item.course.courseName}</strong><small>{item.lecturesCompleted} / {item.totalLectures} lectures</small></div><button onClick={()=>router.push("/rounds")}>Open</button></div>):<EmptyRow text="No active courses yet."/>}</div></Card><Card title="Upcoming Sessions & Deadlines" action={<Link href="/past-exams">View assessments →</Link>} className="deadlines-card"><div className="deadline-list">{data?.recent_attempts.length?data.recent_attempts.slice(0,4).map(item=><div className="deadline" key={item.id}><i className="deadline-dot purple"/><div><small>{item.submitted_at?new Date(item.submitted_at).toLocaleDateString():"Not submitted"}</small><strong>{item.title}</strong></div><button>{item.status}</button></div>):<EmptyRow text="No assessment activity yet."/>}</div></Card></div>
          <div className="two-col lower-cards"><Card title="Continue Learning" action={<Link href="/rounds">View all courses →</Link>} className="learning-card"><div className="learning-grid">{data?.courses.length?data.courses.slice(0,3).map(item=><article key={item.id}><span className="tag">{item.course.courseCode}</span><small>{item.lecturesCompleted}/{item.totalLectures}</small><strong>{item.course.courseName}</strong><div className="progress"><i style={{width:`${clamp(number(item.completionPercentage))}%`}}/></div><span>{clamp(number(item.completionPercentage))}% complete</span></article>):<p>No courses started yet.</p>}</div></Card><Card title="Spaced Repetition Due" action={<Link href="/flashcards">Review queue →</Link>} className="review-card"><div className="review-body"><div><b>{number(data?.flashcards.due)}</b><span>Cards due for review</span><small>{reviewed} cards reviewed overall</small></div><ul><li>Due now <b>{number(data?.flashcards.due)}</b></li><li>Mastered <b>{mastered}</b></li><li>Reviewed <b>{reviewed}</b></li></ul></div><button className="review-button" onClick={()=>router.push("/flashcards")}>Start Review</button></Card></div>
          <Card title="Weekly Activity" action={<span>Activity tracking pending</span>} className="activity-card"><div className="chart-legend"><span><i/>Questions answered</span></div><div className="bar-chart">{activity.map((value,index)=><div key={index}><span style={{height:`${Math.max(2,value)}px`}}/><small>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][index]}</small></div>)}</div></Card></div>
          <aside className="column-side"><Card title="Your Progress" action={<span>{overallProgress}% complete</span>} className="progress-card"><div className="progress-content"><div className="level-badge large">{level}</div><div><strong>Level {level} <small>Clinical Learner</small></strong><span>{levelProgress} / 100 XP</span><div className="xp-bar"><i style={{width:`${levelProgress}%`}}/></div><small>{completedLectures} lectures completed</small></div></div></Card><Card title="Topic Mastery" action={<Link href="/rounds">View all courses →</Link>} className="mastery-card"><div className="mastery-list">{data?.courses.length?data.courses.slice(0,6).map(item=><div key={item.id}><span><FiActivity/>{item.course.courseName}</span><b>{clamp(number(item.completionPercentage))}%</b><div><i style={{width:`${clamp(number(item.completionPercentage))}%`}}/></div></div>):<p>No course progress yet.</p>}</div></Card><Card title="Professor&apos;s Pearls" action={<Link href="/notebook">More pearls →</Link>} className="pearl-card"><blockquote>{pearl?.content||"Save a PEARL note in your notebook and it will appear here."}</blockquote>{pearl&&<cite>— {pearl.title}</cite>}</Card></aside></div>}
      </main></div>
  </div>;
}

function Card({title,subtitle,action,className="",children}:{title:string;subtitle?:string;action?:React.ReactNode;className?:string;children:React.ReactNode}){return <section className={`dash-card ${className}`}><header><h2>{title}</h2>{action&&<div>{action}</div>}</header>{subtitle&&<p className="card-subtitle">{subtitle}</p>}{children}</section>}
function EmptyRow({text}:{text:string}){return <div className="plan-row"><time>—</time><i className="timeline-dot"/><span className="plan-icon"><FiActivity/></span><div><strong>{text}</strong><small>Real data will appear here when available.</small></div></div>}
function RoleTotals({data}:{data:InstructorDashboard|AdminDashboard}){return <div className="pp-metrics">{Object.entries(data).map(([label,value])=><Panel className="pp-metric" key={label}><FiUsers/><div><b>{value}</b><small>{label.replaceAll("_"," ")}</small></div></Panel>)}</div>}
