"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiCheck, FiFileText, FiRefreshCw, FiUploadCloud } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { PageSkeleton } from "./async-state";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./question-import.css";
import "./essay-practice.css";

type PageResponse<T> = { data: T[] };
type Topic = { id: string; topicName: string };
type Lecture = { id: string; title: string; topics?: Topic[] };
type Week = { id: string; weekNumber: number; title: string | null; lectures?: Lecture[] };
type Course = { id: string; courseCode: string; courseName: string; weeks?: Week[] };
type Issue = { code: string; severity: "INFO" | "WARNING" | "ERROR"; message: string };
type Candidate = {
  candidate_id: string; section: string; case_number: number; case_label: string; case_stem: string;
  question_number: number; question_text: string; model_answer: string | null; source_page: number | null;
  answer_page: number | null; extraction_confidence: number; status: "VALID" | "NEEDS_REVIEW" | "INVALID"; issues: Issue[];
};
type Inspection = { original_filename: string; file_sha256: string; page_count: number; file_size: number; status: string; summary: { cases:number; extracted:number; valid:number; needs_review:number; invalid:number }; issues: Issue[]; candidates: Candidate[] };
type ReviewCandidate = Candidate & { topic_id: string; approved: boolean; difficulty: "EASY"|"MEDIUM"|"HARD"; marks: number };

function topicsFor(course: Course | null) {
  return (course?.weeks || []).flatMap((week) => (week.lectures || []).flatMap((lecture) => (lecture.topics || []).map((topic) => ({ ...topic, label: `Week ${week.weekNumber} · ${lecture.title} · ${topic.topicName}` }))));
}

export function EssayQuestionImportPage() {
  const { user, loading: authLoading, request } = useAuth();
  const { notify } = useUx();
  const [courses, setCourses] = useState<Course[]>([]); const [courseId,setCourseId]=useState(""); const [course,setCourse]=useState<Course|null>(null);
  const [file,setFile]=useState<File|null>(null); const [rights,setRights]=useState(false); const [inspection,setInspection]=useState<Inspection|null>(null); const [candidates,setCandidates]=useState<ReviewCandidate[]>([]);
  const [loading,setLoading]=useState(true); const [inspecting,setInspecting]=useState(false); const [publishing,setPublishing]=useState(false); const [error,setError]=useState<string|null>(null);
  const topics = useMemo(() => topicsFor(course), [course]);

  const load = useCallback(async()=>{ if(!user||user.role==="STUDENT")return; setLoading(true); try{setCourses((await request<PageResponse<Course>>("/academic/courses?limit=100")).data);}catch(c){setError(c instanceof Error?c.message:"Unable to load courses.");}finally{setLoading(false)}},[request,user]);
  useEffect(()=>{void load()},[load]);
  async function chooseCourse(id:string){setCourseId(id);setCourse(null); if(!id)return; try{setCourse(await request<Course>(`/academic/courses/${id}`));}catch(c){setError(c instanceof Error?c.message:"Unable to load course structure.")}}

  async function inspect(event:FormEvent){event.preventDefault(); if(!courseId){notify({title:"Choose a course",description:"The review queue needs the destination course structure.",tone:"info"});return} if(!file){notify({title:"Choose the essay PDF",tone:"info"});return} if(!rights){notify({title:"Permission confirmation required",tone:"info"});return}
    setInspecting(true);setError(null);setInspection(null);setCandidates([]); try{const body=new FormData();body.append("file",file);body.append("copyright_confirmed","true"); const result=await request<Inspection>("/questions/imports/essay/inspect",{method:"POST",body,signal:AbortSignal.timeout(60000)}); setInspection(result);setCandidates(result.candidates.map((item)=>({...item,topic_id:"",approved:item.status==="VALID",difficulty:"MEDIUM",marks:1}))); notify({title:"Essay PDF inspected",description:`${result.summary.cases} cases · ${result.summary.extracted} essay questions detected.`,tone:"success"});}catch(c){const msg=c instanceof Error?c.message:"Unable to inspect essay PDF.";setError(msg);notify({title:"Essay inspection failed",description:msg,tone:"error"});}finally{setInspecting(false)}}

  function update(id:string, patch:Partial<ReviewCandidate>){setCandidates((items)=>items.map((item)=>item.candidate_id===id?{...item,...patch}:item))}
  function setCaseTopic(section:string,caseNumber:number,topicId:string){setCandidates((items)=>items.map((item)=>item.section===section&&item.case_number===caseNumber?{...item,topic_id:topicId}:item))}
  const groups=useMemo(()=>{const map=new Map<string,ReviewCandidate[]>();for(const item of candidates){const key=`${item.section}::${item.case_number}`;map.set(key,[...(map.get(key)||[]),item])}return [...map.entries()]},[candidates]);
  const publishable=candidates.filter((item)=>item.approved&&item.topic_id&&item.model_answer?.trim()).length;

  async function publish(){if(!inspection||!publishable)return;setPublishing(true);setError(null);try{const result=await request<{created:number;reused:number;skipped:number}>("/questions/imports/essay/publish",{method:"POST",body:{original_filename:inspection.original_filename,file_sha256:inspection.file_sha256,copyright_confirmed:true,candidates:candidates.map((item)=>({approved:Boolean(item.approved&&item.topic_id&&item.model_answer?.trim()),topic_id:item.topic_id||topics[0]?.id||"00000000-0000-0000-0000-000000000000",case_label:item.case_label,case_stem:item.case_stem,question_text:item.question_text,model_answer:item.model_answer||"",difficulty:item.difficulty,marks:Number(item.marks),source_page:item.source_page||undefined,answer_page:item.answer_page||undefined}))}});notify({title:"Essay question bank updated",description:`${result.created} created · ${result.reused} reused · ${result.skipped} skipped.`,tone:"success"});setInspection(null);setCandidates([]);setFile(null);}catch(c){setError(c instanceof Error?c.message:"Unable to publish essay questions.");}finally{setPublishing(false)}}

  if(authLoading||loading)return <ProductShell><main className="pp-page"><PageSkeleton variant="workspace" label="Loading essay importer"/></main></ProductShell>;
  if(!user||user.role==="STUDENT")return <ProductShell><main className="pp-page"><Panel title="Instructor access required"><p>This workflow is restricted to instructors and administrators.</p></Panel></main></ProductShell>;

  return <ProductShell search="Search essay imports"><main className="pp-page question-import-page"><header className="question-import-heading"><div><Link className="question-import-back" href={user.role==="SYSTEM_ADMIN"?"/admin/questions":"/instructor/questions"}><FiArrowLeft/>Question bank</Link><span className="page-eyebrow">CASE-BASED ESSAY INGESTION</span><h1>Essay PDF Inspector</h1><p>Detect case stems, numbered essay prompts, and their published answer keys. Nothing is published until you assign the extracted case to a real lecture topic and approve it.</p></div></header>
    <Panel><form onSubmit={inspect} className="question-import-upload-form"><div className="question-import-fields"><label><span>Destination course</span><select value={courseId} onChange={(e)=>void chooseCourse(e.target.value)} required><option value="">Select course…</option>{courses.map((item)=><option key={item.id} value={item.id}>{item.courseCode} · {item.courseName}</option>)}</select></label><label className="question-import-file"><span>Essay PDF</span><input type="file" accept="application/pdf,.pdf" onChange={(e)=>setFile(e.target.files?.[0]||null)}/><small>Case N → Q N → Answers of case N is recognized. Text-layer PDF required.</small></label></div><label className="question-import-rights"><input type="checkbox" checked={rights} onChange={(e)=>setRights(e.target.checked)}/><span>I confirm I have permission to use and publish this material.</span></label><button className="pp-button" disabled={inspecting} type="submit">{inspecting?<><FiRefreshCw className="spin"/>Inspecting essay PDF…</>:<><FiUploadCloud/>Inspect essay PDF</>}</button></form></Panel>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {inspection&&<><section className="question-import-summary"><Panel><small>CASES</small><strong>{inspection.summary.cases}</strong><span>detected case blocks</span></Panel><Panel><small>ESSAYS</small><strong>{inspection.summary.extracted}</strong><span>{inspection.summary.valid} valid · {inspection.summary.needs_review} review · {inspection.summary.invalid} invalid</span></Panel><Panel><small>PAGES</small><strong>{inspection.page_count}</strong><span>{inspection.original_filename}</span></Panel><Panel><small>READY TO PUBLISH</small><strong>{publishable}</strong><span>approved + topic assigned + answer present</span></Panel></section>
      {inspection.issues.length>0&&<Panel title="Batch checks">{inspection.issues.map((issue)=><p key={issue.code}>{issue.severity}: {issue.message}</p>)}</Panel>}
      <section className="essay-import-groups">{groups.map(([key,items])=>{const first=items[0];const selectedTopic=items.find((item)=>item.topic_id)?.topic_id||"";return <Panel key={key} title={`${first.section} · Case ${first.case_number}`}><div className="essay-case-import-head"><p>{first.case_stem}</p><label>Assign this case to topic<select value={selectedTopic} onChange={(e)=>setCaseTopic(first.section,first.case_number,e.target.value)}><option value="">Choose lecture topic…</option>{topics.map((topic)=><option key={topic.id} value={topic.id}>{topic.label}</option>)}</select></label></div><div className="essay-import-question-list">{items.map((item)=><article key={item.candidate_id} className={`essay-import-question ${item.status.toLowerCase()}`}><header><label><input type="checkbox" checked={item.approved} disabled={item.status==="INVALID"} onChange={(e)=>update(item.candidate_id,{approved:e.target.checked})}/><FiCheck/>Q{item.question_number}</label><small>Question page {item.source_page??"?"} · Answer page {item.answer_page??"?"}</small></header><h3>{item.question_text}</h3><label>Model answer<textarea value={item.model_answer||""} onChange={(e)=>update(item.candidate_id,{model_answer:e.target.value})}/></label>{item.issues.map((issue)=><p className="form-error" key={issue.code}>{issue.message}</p>)}</article>)}</div></Panel>})}</section>
      <div className="question-import-publish-bar"><div><b>{publishable} essay questions ready</b><small>Each approved question is published as ESSAY with its model answer and case provenance.</small></div><button className="pp-button" type="button" disabled={!publishable||publishing} onClick={()=>void publish()}><FiFileText/>{publishing?"Publishing…":`Publish ${publishable} essays`}</button></div></>}
  </main></ProductShell>;
}
