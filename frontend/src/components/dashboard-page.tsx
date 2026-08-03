"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FiActivity, FiBell, FiBookOpen, FiBookmark, FiChevronDown,
  FiChevronRight, FiClipboard, FiClock, FiFileText, FiGrid, FiHeart,
  FiHome, FiMenu, FiSearch, FiSettings, FiTrendingUp, FiX, FiZap,
} from "react-icons/fi";
import { ThemeToggle, useAppTheme } from "./app-theme";
import { BrandLockup } from "./brand";
import { useAuth } from "./auth-provider";
import "./dashboard.css";

const navItems = [
  ["Dashboard", FiHome, "/dashboard"], ["Rounds", FiBookOpen, "/rounds"], ["Cases", FiClipboard, "/past-exams"],
  ["Review", FiActivity, "/study-plan"], ["Notebook", FiBookmark, "/notebook"], ["References", FiFileText, "/guidelines"],
] as const;

const plan = [
  ["8:00 AM", "Cardiology Rounds", "Heart Failure – Dyspnea", FiHeart, "In progress"],
  ["10:30 AM", "Respiratory Case", "Asthma Exacerbation", FiActivity, "Start"],
  ["1:00 PM", "Neurology Review", "Stroke – Localization", FiZap, "Start"],
  ["3:30 PM", "Notebook Session", "Summarize key takeaways", FiBookmark, "Open"],
] as const;

const deadlines = [
  ["Tomorrow, 7:30 PM", "Live Case Discussion: Acute MI", "Live", "purple"],
  ["May 18, 11:59 PM", "Clinical Reasoning Quiz #4", "Due soon", "orange"],
  ["May 20, 11:59 PM", "Pharmacology Assignment", "5 days left", "neutral"],
  ["May 22, 7:00 PM", "Endocrinology Office Hours", "Add to calendar", "teal"],
] as const;

const topics = [
  ["Cardiology", 78, FiHeart], ["Respiratory", 64, FiActivity],
  ["Neurology", 58, FiZap], ["Pharmacology", 71, FiGrid],
  ["Endocrinology", 62, FiTrendingUp], ["Hematology", 53, FiActivity],
] as const;

function Card({ title, action, children, className = "" }: { title: string; action?: string; children: React.ReactNode; className?: string }) {
  return <section className={`dash-card ${className}`}><header><h2>{title}</h2>{action && <button>{action} <FiChevronRight /></button>}</header>{children}</section>;
}

export function DashboardPage() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=%2Fdashboard");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="product-auth-loading" role="status">Loading your workspace…</div>;
  }

  const displayName = user.fullName || user.full_name || user.email;
  const firstName = displayName.trim().split(/\s+/)[0] || displayName;
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0]).join("").toUpperCase();
  const roleLabel = user.role === "SYSTEM_ADMIN"
    ? "System Administrator"
    : user.role === "INSTRUCTOR" ? "Instructor" : "Medical Student";

  return <main className="dashboard-shell" data-theme={theme}>
    <aside className={`dash-sidebar ${menuOpen ? "open" : ""}`}>
      <BrandLockup className="dash-brand" href="/dashboard" />
      <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><FiX /></button>
      <nav>{navItems.map(([label, Icon, href], index) => <Link className={index === 0 ? "active" : ""} key={label} href={href}><Icon />{label}</Link>)}</nav>
      <Link className="settings-link" href="/settings"><FiSettings />Settings</Link>
      <div className="level-mini"><div className="level-badge">14</div><div><strong>Level 14</strong><span>Clinical Learner</span><div className="mini-progress"><i /></div><small>620 / 1000 XP</small></div><FiChevronRight /></div>
      <div className="cme-card"><FiActivity /><div><strong>Earn CME Credits</strong><span>Complete studies and claim CME credits.</span><button>Explore CME</button></div></div>
    </aside>

    <div className="dash-body">
      <header className="dash-topbar">
        <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><FiMenu /></button>
        <label className="dash-search"><FiSearch /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search cases, topics, or concepts" /><kbd>⌘ K</kbd></label>
        <div className="top-actions">
          <ThemeToggle />
          <button className="notification" aria-label="Notifications"><FiBell /><span>2</span></button>
          <span className="avatar avatar-user" aria-label={`${displayName} profile`} style={user.profilePictureUrl ? { backgroundImage: `url(${user.profilePictureUrl})` } : undefined}>{user.profilePictureUrl ? "" : initials}</span>
          <div className="profile-copy"><strong>{displayName}</strong><span>{roleLabel}</span></div><FiChevronDown />
        </div>
      </header>

      <div className="dash-content">
        <section className="welcome"><p className="eyebrow">TODAY’S FOCUS</p><h1>Welcome back, {firstName}</h1><p>You’re building clinical expertise every day.</p><strong>Strengthen cardiovascular reasoning and apply evidence-based<br />management to real-world cases.</strong></section>
        <Card title="Clinical Momentum" className="momentum-card">
          <p className="card-subtitle">Your progress at a glance</p>
          <div className="metrics">
            <div className="metric primary"><span className="metric-icon"><FiClipboard /></span><div><small>Cases solved</small><b>156</b><span>This month</span><em>↑ 18% vs last month</em></div><FiTrendingUp /></div>
            <div className="metric"><span className="metric-icon flame"><FiZap /></span><div><small>Study streak</small><b>11 <sup>days</sup></b><span>Keep it going!</span><div className="streak">M T W T F S S<i/><i/><i/><i/><i/><i/><i className="off"/></div></div></div>
            <div className="metric"><span className="retention-ring">72%</span><div><small>Retention</small><span>Last 30 days!</span><em>↑ 6% vs prior 30 days</em></div></div>
            <div className="metric"><span className="metric-icon"><FiClock /></span><div><small>Study hours</small><b>28.6 <sup>hrs</sup></b><span>This week</span><em className="violet">↓ 4% vs last week</em></div></div>
          </div>
        </Card>

        <div className="main-grid">
          <div className="column-main">
            <div className="two-col">
              <Card title="Today’s Plan" action="View full schedule" className="schedule-card">
                <div className="plan-list">{plan.map(([time, title, sub, Icon, status], index) => <div className="plan-row" key={title}><time>{time}</time><span className={`timeline-dot d${index}`} /><span className="plan-icon"><Icon /></span><div><strong>{title}</strong><small>{sub}</small></div><button>{status}</button></div>)}</div>
              </Card>
              <Card title="Upcoming Sessions & Deadlines" action="View all" className="deadlines-card">
                <div className="deadline-list">{deadlines.map(([date, title, status, tone]) => <div className="deadline" key={title}><span className={`deadline-dot ${tone}`} /><div><small>{date}</small><strong>{title}</strong></div><button className={tone}>{status}</button></div>)}</div>
              </Card>
            </div>
            <div className="two-col lower-cards">
              <Card title="Continue Learning" action="View all cases" className="learning-card">
                <div className="learning-grid">{[["Cardiology", "A 62-year-old man with progressive dyspnea", 68], ["Neurology", "A 45-year-old woman with sudden weakness", 48], ["Respiratory", "A 28-year-old with acute asthma exacerbation", 35]].map(([tag, text, progress]) => <article key={String(tag)}><span className="tag">{tag}</span><small>Step 2 CK</small><strong>{text}</strong><div className="progress"><i style={{width:`${progress}%`}} /></div><span>{progress}% complete</span></article>)}</div>
              </Card>
              <Card title="Spaced Repetition Due" action="Review queue" className="review-card"><div className="review-body"><div><b>24</b><span>Items due for review</span><small>Optimal time to review today</small></div><ul><li>Cardiology <b>8 items</b></li><li>Pharmacology <b>6 items</b></li><li>Neurology <b>5 items</b></li><li>Respiratory <b>3 items</b></li></ul></div><button className="review-button">Start Review</button></Card>
            </div>
            <Card title="Weekly Activity" action="View full analytics" className="activity-card">
              <div className="chart-legend"><span><i />Cases solved</span><span><i />Hours studied</span></div>
              <div className="bar-chart">{[[18,12],[25,19],[33,23],[24,20],[24,19],[14,12],[10,9]].map(([a,b],i)=><div key={i}><span style={{height:a*2}}/><i style={{height:b*2}}/><small>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}</small></div>)}</div>
            </Card>
          </div>

          <div className="column-side">
            <Card title="Your Progress" action="View analytics" className="progress-card"><div className="progress-content"><div className="level-badge large">14</div><div><strong>Level 14 <small>Clinical Learner</small></strong><span>620 / 1000 XP</span><div className="xp-bar"><i /></div><small>Next: Level 15</small></div></div></Card>
            <Card title="Topic Mastery" action="View all topics" className="mastery-card"><div className="mastery-list">{topics.map(([name,value,Icon])=><div key={name}><span><Icon />{name}</span><b>{value}%</b><div><i style={{width:`${value}%`}}/></div></div>)}</div></Card>
            <Card title="Professor’s Pearls" action="More pearls" className="pearl-card"><blockquote>“In medicine, pattern recognition gets you to the door, but mechanism understanding opens it. Always ask ‘why’ behind every finding.”</blockquote><cite>— Dr. James Wilson<br/><span>Attending Physician</span></cite><Image src="/dashboard/professor-pearl.png" width={768} height={512} alt="Professor James Wilson illustration" /></Card>
          </div>
        </div>
      </div>
    </div>
  </main>;
}
