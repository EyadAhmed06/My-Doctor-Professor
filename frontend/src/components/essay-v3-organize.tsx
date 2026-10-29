"use client";
import { useMemo, useState } from "react";
import type { ReviewCandidate } from "./essay-import-model";

type Topic={id:string;label:string};
type Course={id:string;courseCode:string;courseName:string;weeks?:Array<{id:string;weekNumber:number;title:string|null}>};
type GroupDestination="QUESTION_BANK"|"CASE_STUDIO"|"BOTH"|"SKIP";
const groupId=(q:ReviewCandidate)=>`${q.section}::${q.case_number}`;
export function EssayV3Organize({items,courses,courseId,course,topics,groupTopics,globalTopicId,caseWeeks,groupDestinations,onGroupDestination,busy,destination,allowCaseStudio,onDestination,onChooseCourse,onDefaultTopic,onGroupTopic,onCaseWeek,onSuggest,onSelectGroup,onContinue,onBack}:{
items:ReviewCandidate[];courses:Course[];courseId:string;course:Course|null;topics:Topic[];groupTopics:Record<string,string>;globalTopicId:string;caseWeeks:Record<string,string>;groupDestinations:Record<string,GroupDestination>;onGroupDestination:(id:string,value:GroupDestination)=>void;busy:boolean;destination:"QUESTION_BANK"|"CASE_STUDIO";allowCaseStudio:boolean;onDestination:(value:"QUESTION_BANK"|"CASE_STUDIO")=>void;
onChooseCourse:(id:string)=>void;onDefaultTopic:(id:string)=>void;onGroupTopic:(id:string,topic:string)=>void;onCaseWeek:(id:string,week:string)=>void;onSuggest:()=>void;onSelectGroup:(id:string,approved:boolean)=>void;onContinue:()=>void;onBack:()=>void;
}){
const scope=destination;
const [topicSearch,setTopicSearch]=useState("");
const [bulkTopic,setBulkTopic]=useState("");
const [bulkWeek,setBulkWeek]=useState("");
const groups=useMemo(()=>{const map=new Map<string,ReviewCandidate[]>();for(const q of items){const id=groupId(q);if(!map.has(id))map.set(id,[]);map.get(id)!.push(q);}return [...map];},[items]);
const selected=items.filter(q=>q.approved);
const filteredTopics=topics.filter(t=>t.label.toLowerCase().includes(topicSearch.toLowerCase()));
const pending=groups.filter(([id,rows])=>{
  if(!rows.some(q=>q.approved))return false;
  const target=groupDestinations[id]||"QUESTION_BANK";
  if(target==="SKIP")return false;
  return ((target==="QUESTION_BANK"||target==="BOTH")&&!(groupTopics[id]||globalTopicId))||
    ((target==="CASE_STUDIO"||target==="BOTH")&&!caseWeeks[id]);
}).length;
return <section className="essay-v3-organization" aria-label="Organize essay publication">
  <header className="essay-v3-step-head"><div><h2>Organize your questions</h2><p>Choose Question Bank, Studio, both, or skip for each section. Set its topic and/or week below.</p></div><span>{selected.length} selected · {pending} sections need destinations</span></header>
  <div className="essay-v3-organization-controls">
    <label>Destination course<select value={courseId} disabled={busy} onChange={e=>onChooseCourse(e.target.value)}><option value="">Choose course…</option>{courses.map(c=><option key={c.id} value={c.id}>{c.courseCode} · {c.courseName}</option>)}</select></label>
    <div className="essay-v3-destination-switch" role="group" aria-label="Destination type">
      <button type="button" aria-pressed={scope==="QUESTION_BANK"} onClick={()=>onDestination("QUESTION_BANK")}>Question Bank topics</button>
      {allowCaseStudio&&<button type="button" aria-pressed={scope==="CASE_STUDIO"} onClick={()=>onDestination("CASE_STUDIO")}>Clinical Case Studio</button>}
    </div>
    {scope==="QUESTION_BANK"&&<label>Default lecture topic<select value={globalTopicId} disabled={busy||!courseId} onChange={e=>onDefaultTopic(e.target.value)}><option value="">No default topic</option>{topics.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}
    {scope==="QUESTION_BANK"&&<button type="button" className="essay-v3-secondary" disabled={!topics.length||busy} onClick={onSuggest}>Suggest exact topic matches</button>}
  </div>
  <div className="essay-v31-bulk">
    {scope==="QUESTION_BANK"?<>
      <label>Find destination topics<input type="search" value={topicSearch} onChange={e=>setTopicSearch(e.target.value)} placeholder="Filter by week, lecture, or topic…"/></label>
      <label>Bulk topic<select aria-label="Bulk destination topic" value={bulkTopic} disabled={!courseId||busy} onChange={e=>setBulkTopic(e.target.value)}><option value="">Choose a topic…</option>{filteredTopics.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      <button type="button" className="essay-v3-secondary" disabled={!bulkTopic||busy} onClick={()=>{for(const [id,rows] of groups)if(rows.some(q=>q.approved))onGroupTopic(id,bulkTopic);}}>Apply topic to selected sections</button>
    </>:<>
      <label>Bulk week<select aria-label="Bulk Case Studio week" value={bulkWeek} disabled={!courseId||busy} onChange={e=>setBulkWeek(e.target.value)}><option value="">Choose a week…</option>{(course?.weeks||[]).map(w=><option key={w.id} value={w.id}>Week {w.weekNumber}{w.title?` · ${w.title}`:""}</option>)}</select></label>
      <button type="button" className="essay-v3-secondary" disabled={!bulkWeek||busy} onClick={()=>{for(const [id,rows] of groups)if(rows[0].block_type==="CASE"&&rows.some(q=>q.approved))onCaseWeek(id,bulkWeek);}}>Apply week to selected clinical cases</button>
    </>}
  </div>
  <p className="essay-v3-instruction">Question Bank accepts essay questions extracted from both lectures and cases, organized by topic. Studio stores complete question sets by week; lecture-based sets use their lecture title rather than being labeled clinical cases. Routing is configured independently for each section.</p>
  <div className="essay-v3-organization-table"><table><thead><tr><th scope="col">Source section</th><th scope="col">Selected</th><th scope="col">Destination</th><th scope="col">Readiness</th></tr></thead><tbody>
  {groups.map(([id,rows])=>{const first=rows[0];const n=rows.filter(q=>q.approved).length;const isCase=first.block_type!=="LECTURE";const target=groupDestinations[id]||"QUESTION_BANK";const needBank=target==="QUESTION_BANK"||target==="BOTH";const needStudio=target==="CASE_STUDIO"||target==="BOTH";const assigned=target==="SKIP"||(!needBank||!!(groupTopics[id]||globalTopicId))&&(!needStudio||!!caseWeeks[id]);const valid=n>0&&rows.filter(q=>q.approved).every(q=>q.status!=="INVALID"&&Boolean(q.model_answer?.trim()));return <tr key={id}><td><strong>{isCase?`Case ${first.case_number}`:first.section}</strong><small>{rows.length} questions · {isCase?first.section:"Lecture"}</small></td><td><span>{n}/{rows.length}</span><div className="essay-v3-row-actions"><button type="button" disabled={busy||rows.every(q=>q.status==="INVALID"||q.approved)} onClick={()=>onSelectGroup(id,true)}>{rows.every(q=>q.status==="INVALID"||q.approved)?"All ready selected":"Select ready"}</button><button type="button" disabled={busy} onClick={()=>onSelectGroup(id,false)}>Clear</button></div></td><td><label className="essay-v3-destination-label">Publish to <select aria-label={`Destination for ${first.section} ${first.case_number}`} value={target} disabled={busy} onChange={e=>onGroupDestination(id,e.target.value as GroupDestination)}>
<option value="QUESTION_BANK">Question Bank</option>{allowCaseStudio&&<option value="CASE_STUDIO">Case Studio</option>}{allowCaseStudio&&<option value="BOTH">Both</option>}<option value="SKIP">Neither</option></select></label>
{needBank&&<label>Topic <select aria-label={`Topic for ${first.section} ${first.case_number}`} disabled={busy||!courseId} value={groupTopics[id]??""} onChange={e=>onGroupTopic(id,e.target.value)}><option value="">{globalTopicId?"Use default topic":"Choose topic…"}</option>{topics.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}
{needStudio&&<label>Studio week <select aria-label={`Case Studio week for ${first.section} ${first.case_number}`} disabled={busy||!courseId} value={caseWeeks[id]??""} onChange={e=>onCaseWeek(id,e.target.value)}><option value="">Choose week…</option>{(course?.weeks||[]).map(w=><option key={w.id} value={w.id}>Week {w.weekNumber}{w.title?` · ${w.title}`:""}</option>)}</select></label>}
{false&& (scope==="CASE_STUDIO"&&!isCase?<span>Lecture practice sets require a separate content type</span>:scope==="QUESTION_BANK"?<select aria-label={`Topic for ${first.section} ${first.case_number}`} disabled={busy||!courseId} value={groupTopics[id]??""} onChange={e=>onGroupTopic(id,e.target.value)}><option value="">{globalTopicId?"Use default topic":"Choose topic…"}</option>{topics.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select>:<select aria-label={`Case Studio week for case ${first.case_number}`} disabled={busy||!courseId} value={caseWeeks[id]??""} onChange={e=>onCaseWeek(id,e.target.value)}><option value="">Choose week…</option>{(course?.weeks||[]).map(w=><option key={w.id} value={w.id}>Week {w.weekNumber}{w.title?` · ${w.title}`:""}</option>)}</select>)}</td><td><span className={n===0?"essay-v3-neutral":!assigned||!valid?"essay-v3-warning":"essay-v3-ready"}>{n===0?"Not selected":target==="SKIP"?"Excluded":!valid?"Check selected answers":!assigned?"Assign destination":"Ready"}</span></td></tr>})}
  </tbody></table></div>

</section>;
}
