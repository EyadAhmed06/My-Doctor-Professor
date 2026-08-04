"use client";

import { useEffect, useState } from "react";
import { FiActivity, FiCheckCircle, FiClock, FiTarget } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell, Progress } from "./product-shell";
import "./product-pages.css";

type Analytics={summary:{questions_answered:number;accuracy:number;bookmarked:number;calibrated_confidence:number;flashcards_mastered:number;flashcards_due:number};accuracy_over_time:{date:string;answered:number;accuracy:number}[];topic_mastery:{id:string;name:string;course:string;mastery:number;confidence:number|null;questions_attempted:number}[];study_activity:{date:string;completed:number;skipped:number;planned:number}[];readiness:{score:number;band:string;components:{accuracy:number;curriculum:number;flashcards:number;consistency:number}}};

export function ConnectedAnalyticsPage(){
 const {user,request}=useAuth();const [data,setData]=useState<Analytics|null>(null);const [error,setError]=useState<string|null>(null);
 useEffect(()=>{if(user?.role!=="STUDENT")return;let active=true;void request<Analytics>("/analytics/student").then(value=>{if(active)setData(value)}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Unable to load analytics.")});return()=>{active=false}},[user,request]);
 return <ProductShell><main className="pp-page analytics-page"><header className="workspace-heading"><div><span className="page-eyebrow">LEARNING INTELLIGENCE</span><h1>Analytics Dashboard</h1><p>Track learning quality, retention, confidence, and exam readiness from your real activity.</p></div></header>
  {error&&<p className="form-error">{error}</p>}{user?.role!=="STUDENT"?<Panel title="Student analytics"><p>This dashboard is calculated for student accounts.</p></Panel>:!data?<div className="product-auth-loading">Calculating analytics…</div>:<>
   <section className="analytics-metrics"><Metric icon={<FiActivity/>} label="Questions answered" value={String(data.summary.questions_answered)}/><Metric icon={<FiCheckCircle/>} label="Accuracy" value={`${data.summary.accuracy}%`}/><Metric icon={<FiTarget/>} label="Calibrated confidence" value={`${data.summary.calibrated_confidence??0}%`}/><Metric icon={<FiClock/>} label="Flashcards due" value={String(data.summary.flashcards_due)}/></section>
   <div className="analytics-grid"><Panel title="Accuracy over time"><div className="trend-chart">{data.accuracy_over_time.length?data.accuracy_over_time.map(point=><div key={point.date} title={`${point.accuracy}% accuracy`}><i style={{height:`${Math.max(8,point.accuracy)}%`}}/><small>{new Date(point.date).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</small></div>):<p>No completed answers yet.</p>}</div></Panel><Panel title="Exam readiness"><div className="readiness-score"><b>{data.readiness.score}</b><span>/100</span><small>{data.readiness.band.replaceAll("_"," ")}</small></div>{Object.entries(data.readiness.components).map(([label,value])=><div className="readiness-component" key={label}><span>{label}</span><b>{Math.round(value)}%</b><Progress value={value}/></div>)}</Panel>
   <Panel title="Topic mastery" className="analytics-topics">{data.topic_mastery.length?data.topic_mastery.map(topic=><div key={topic.id}><span><b>{topic.name}</b><small>{topic.course} · {topic.questions_attempted} questions</small></span><strong>{Math.round(topic.mastery)}%</strong><Progress value={topic.mastery}/></div>):<p>Practice questions to build your topic map.</p>}</Panel><Panel title="Study consistency"><div className="activity-bars">{data.study_activity.slice(-14).map(day=><div key={day.date}><i style={{height:`${Math.max(5,100*day.completed/Math.max(1,day.planned))}%`}}/><small>{new Date(day.date).toLocaleDateString(undefined,{weekday:"short"})}</small></div>)}</div><p>Completed sessions are measured from your generated schedule—not estimated data.</p></Panel></div>
  </>}
 </main></ProductShell>;
}
function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <Panel className="analytics-metric"><span>{icon}</span><div><small>{label}</small><b>{value}</b></div></Panel>}
