"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiCheck, FiFileText, FiRefreshCw, FiSearch, FiUploadCloud } from "react-icons/fi";
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
  candidate_id: string; section: string; block_type?: "CASE" | "LECTURE"; case_number: number; case_label: string; case_stem: string;
  question_number: number; question_text: string; model_answer: string | null; answer_origin?: "SOURCE" | "MISSING" | "MANUAL"; source_page: number | null;
  answer_page: number | null; extraction_confidence: number; status: "VALID" | "NEEDS_REVIEW" | "INVALID"; issues: Issue[];
};
type Inspection = { original_filename: string; file_sha256: string; page_count: number; file_size: number; status: string; summary: { cases:number; lectures?:number; extracted:number; valid:number; needs_review:number; invalid:number }; issues: Issue[]; candidates: Candidate[] };
type ReviewCandidate = Candidate & { approved: boolean; difficulty: "EASY"|"MEDIUM"|"HARD"; marks: number };
type ExistingCaseCurriculum = { weeks: Array<{ id:string; cases:Array<{ weekId:string; sourceCaseNumber:number|null; section:string|null; stem:string }> }> };

function topicsFor(course: Course | null) {
  return (course?.weeks || []).flatMap((week) => (week.lectures || []).flatMap((lecture) => (lecture.topics || []).map((topic) => ({ ...topic, label: `Week ${week.weekNumber} · ${lecture.title} · ${topic.topicName}` }))));
}

export function EssayQuestionImportPage() {
  const { user, loading: authLoading, request } = useAuth();
  const { notify } = useUx();
  const [courses, setCourses] = useState<Course[]>([]); const [courseId,setCourseId]=useState(""); const [course,setCourse]=useState<Course|null>(null);
  const [file,setFile]=useState<File|null>(null); const [standaloneType,setStandaloneType]=useState<'LECTURE'|'CASE'>('LECTURE'); const [rights,setRights]=useState(false); const [inspection,setInspection]=useState<Inspection|null>(null); const [candidates,setCandidates]=useState<ReviewCandidate[]>([]);
  const [loading,setLoading]=useState(true); const [inspecting,setInspecting]=useState(false); const [publishing,setPublishing]=useState(false); const [error,setError]=useState<string|null>(null);
  const [candidateSearch,setCandidateSearch]=useState(""); const [statusFilter,setStatusFilter]=useState<"ALL"|Candidate["status"]>("ALL"); const [globalTopicId,setGlobalTopicId]=useState(""); const [groupTopics,setGroupTopics]=useState<Record<string,string>>({});
  const [caseWeeks,setCaseWeeks]=useState<Record<string,string>>({}); const [creatingCases,setCreatingCases]=useState(false);
  const topics = useMemo(() => topicsFor(course), [course]);

  const load = useCallback(async()=>{ if(!user||user.role==="STUDENT")return; setLoading(true); try{setCourses((await request<PageResponse<Course>>("/academic/courses?limit=100")).data);}catch(c){setError(c instanceof Error?c.message:"Unable to load courses.");}finally{setLoading(false)}},[request,user]);
  useEffect(()=>{void load()},[load]);
  async function chooseCourse(id:string){setCourseId(id);setCourse(null);setGlobalTopicId("");setGroupTopics({});setCaseWeeks({}); if(!id)return; try{setCourse(await request<Course>(`/academic/courses/${id}`));}catch(c){setError(c instanceof Error?c.message:"Unable to load course structure.")}}

  async function inspect(event:FormEvent){event.preventDefault(); if(!courseId){notify({title:"Choose a course",description:"The review queue needs the destination course structure.",tone:"info"});return} if(!file){notify({title:"Choose an essay file",tone:"info"});return} if(!rights){notify({title:"Permission confirmation required",tone:"info"});return}
    const json=/\.(json|txt)$/i.test(file.name);
    if(!(/\.pdf$/i.test(file.name)||json)||!file.size||file.size>(json?2:50)*1024*1024){notify({title:"Unsupported essay file",description:"Choose a non-empty PDF (50 MB), JSON or JSON text (2 MB).",tone:"error"});return}
    setInspecting(true);setError(null);setInspection(null);setCandidates([]);setGlobalTopicId("");setGroupTopics({});setCaseWeeks({}); try{const body=new FormData();body.append("file",file);body.append("copyright_confirmed","true");body.append("content_type",standaloneType); const result=await request<Inspection>("/questions/imports/essay/inspect",{method:"POST",body,signal:AbortSignal.timeout(60000)}); setInspection(result);setCandidates(result.candidates.map((item)=>({...item,approved:item.status==="VALID",difficulty:"MEDIUM",marks:1}))); notify({title:"Essay file inspected",description:`${result.summary.cases} cases · ${result.summary.lectures ?? 0} lectures · ${result.summary.extracted} essay questions detected.`,tone:"success"});}catch(c){const msg=c instanceof Error?c.message:"Unable to inspect essay PDF.";setError(msg);notify({title:"Essay inspection failed",description:msg,tone:"error"});}finally{setInspecting(false)}}

  function update(id:string, patch:Partial<ReviewCandidate>){
    setCandidates(items=>items.map(item=>{
      if(item.candidate_id!==id)return item;
      const next={...item,...patch};
      if(patch.model_answer!==undefined){
        const present=Boolean(next.model_answer?.trim());
        const issues=next.issues.filter(issue=>issue.code!=="MODEL_ANSWER_MISSING");
        if(!present)issues.push({code:"MODEL_ANSWER_MISSING",severity:"ERROR",message:"A model answer is required before publication."});
        next.issues=issues;
        next.status=issues.some(issue=>issue.severity==="ERROR")?"INVALID":issues.length?"NEEDS_REVIEW":"VALID";
        next.answer_origin=present&&item.answer_origin==="MISSING"?"MANUAL":item.answer_origin;
        next.approved=present&&next.approved;
      }
      return next;
    }));
  }
  function updateStem(key:string,stem:string){
    setCandidates(items=>items.map(item=>{
      if(`${item.section}::${item.case_number}`!==key)return item;
      const issues=item.issues.filter(issue=>issue.code!=="CASE_STEM_MISSING");
      if(!stem.trim()&&item.block_type==="CASE")issues.push({code:"CASE_STEM_MISSING",severity:"WARNING",message:"Provide the clinical case stem."});
      return {...item,case_stem:stem,issues,status:issues.some(issue=>issue.severity==="ERROR")?"INVALID":issues.length?"NEEDS_REVIEW":"VALID"};
    }));
  }
  function setGroupApproved(key:string,approved:boolean){setCandidates(items=>items.map(item=>`${item.section}::${item.case_number}`===key?{...item,approved:approved&&item.status!=="INVALID"}:item))}
  const statusCounts=useMemo(()=>({ALL:candidates.length,VALID:candidates.filter((item)=>item.status==="VALID").length,NEEDS_REVIEW:candidates.filter((item)=>item.status==="NEEDS_REVIEW").length,INVALID:candidates.filter((item)=>item.status==="INVALID").length}),[candidates]);
  const filteredCandidates=useMemo(()=>{const query=candidateSearch.trim().toLowerCase();return candidates.filter((item)=>{if(statusFilter!=="ALL"&&item.status!==statusFilter)return false;if(!query)return true;return [item.section,item.case_number,item.question_number,item.case_stem,item.question_text,item.model_answer,item.status,item.answer_origin,...item.issues.flatMap((issue)=>[issue.code,issue.message])].some((value)=>String(value??"").toLowerCase().includes(query))})},[candidateSearch,candidates,statusFilter]);
  const groups=useMemo(()=>{const map=new Map<string,ReviewCandidate[]>();for(const item of filteredCandidates){const key=`${item.section}::${item.case_number}`;map.set(key,[...(map.get(key)||[]),item])}return [...map.entries()]},[filteredCandidates]);
  const groupKey=(item:Candidate)=>`${item.section}::${item.case_number}`;
  const topicFor=(item:Candidate)=>groupTopics[groupKey(item)] || globalTopicId;
  const publishable=candidates.filter((item)=>item.approved&&item.model_answer?.trim()&&topicFor(item)).length;
  const unassignedApproved=candidates.filter((item)=>item.approved&&item.model_answer?.trim()&&!topicFor(item)).length;
  const caseDraftGroups=useMemo(()=>{const grouped=new Map<string,ReviewCandidate[]>();for(const item of candidates){if(item.block_type!=="CASE"||!item.approved||!item.model_answer?.trim())continue;const key=`${item.section}::${item.case_number}`;grouped.set(key,[...(grouped.get(key)||[]),item]);}return [...grouped.entries()]},[candidates]);
  const mappedCaseDraftGroups=caseDraftGroups.filter(([key])=>caseWeeks[key] && course?.weeks?.some((week)=>week.id===caseWeeks[key]));

  async function publish(){if(!inspection||!publishable||unassignedApproved)return;setPublishing(true);setError(null);try{const result=await request<{created:number;reused:number;skipped:number}>("/questions/imports/essay/publish",{method:"POST",body:{original_filename:inspection.original_filename,file_sha256:inspection.file_sha256,copyright_confirmed:true,candidates:candidates.map((item)=>({approved:Boolean(item.approved&&item.model_answer?.trim()),topic_id:topicFor(item)||globalTopicId||Object.values(groupTopics).find(Boolean)||topics[0]?.id||"",case_label:item.case_label,case_stem:item.case_stem,question_text:item.question_text,model_answer:item.model_answer||"",difficulty:item.difficulty,marks:Number(item.marks),source_page:item.source_page||undefined,answer_page:item.answer_page||undefined}))}});notify({title:"Essay question bank updated",description:`${result.created} created · ${result.reused} reused · ${result.skipped} skipped. Case Studio drafts can also be created below.`,tone:"success"});}catch(c){setError(c instanceof Error?c.message:"Unable to publish essay questions.");}finally{setPublishing(false)}}

  async function createCaseDrafts(){
    if(!inspection||!courseId||!mappedCaseDraftGroups.length||creatingCases||publishing||user?.role!=="INSTRUCTOR")return;
    setCreatingCases(true);setError(null);
    let created=0,skipped=0;
    try{
      // Retry-safe preflight: do not duplicate an existing case with matching
      // source case number, section, stem and destination week.
      const current=await request<ExistingCaseCurriculum>(`/essay-cases?course_id=${encodeURIComponent(courseId)}`);
      const existing=new Set(current.weeks.flatMap((week)=>week.cases.map((item)=>
        JSON.stringify([item.weekId,item.sourceCaseNumber,item.section||"",item.stem.trim()]))));
      for(const [key,items] of mappedCaseDraftGroups){
        const first=items[0];
        const weekId=caseWeeks[key];
        const dedupKey=JSON.stringify([weekId,first.case_number,first.section||"",first.case_stem.trim()]);
        if(existing.has(dedupKey)){skipped++;continue;}
        await request("/essay-cases",{method:"POST",body:{
          week_id:weekId,title:`Case ${first.case_number}`,stem:first.case_stem,
          section:first.section.slice(0,120),source_case_number:first.case_number,
          is_published:false,questions:items.sort((a,b)=>a.question_number-b.question_number).map((item)=>({
            prompt:item.question_text,model_answer:item.model_answer!.trim(),
          })),
        }});
        existing.add(dedupKey);created++;
      }
      notify({title:"Case Studio drafts created",description:`${created} created · ${skipped} already existed. Drafts remain hidden from students until you publish them.`,tone:"success"});
    }catch(c){
      const message=c instanceof Error?c.message:"Unable to create Case Studio drafts.";
      setError(`${message} (${created} case drafts created before the error; retry will skip existing drafts.)`);
    }finally{setCreatingCases(false)}
  }

  if(authLoading||loading)return <ProductShell><main className="pp-page"><PageSkeleton variant="workspace" label="Loading essay importer"/></main></ProductShell>;
  if(!user||user.role==="STUDENT")return <ProductShell><main className="pp-page"><Panel title="Instructor access required"><p>This workflow is restricted to instructors and administrators.</p></Panel></main></ProductShell>;

  return <ProductShell search="Search essay imports"><main className="pp-page question-import-page"><header className="question-import-heading"><div><Link className="question-import-back" href={user.role==="SYSTEM_ADMIN"?"/admin/questions":"/instructor/essay-cases"}><FiArrowLeft/>{user.role==="SYSTEM_ADMIN"?"Question bank":"Essay cases"}</Link><span className="page-eyebrow">CASE & LECTURE ESSAY INGESTION</span><h1>Essay & JSON Inspector</h1><p>Detect clinical cases and lecture questions, numbered essay prompts, and their source answer keys. Nothing is published until you review and approve it. Case Studio entries are created as unpublished drafts.</p></div></header>
    <Panel><form onSubmit={inspect} className="question-import-upload-form"><div className="question-import-fields"><label><span>Destination course</span><select value={courseId} onChange={(e)=>void chooseCourse(e.target.value)} required><option value="">Select course…</option>{courses.map((item)=><option key={item.id} value={item.id}>{item.courseCode} · {item.courseName}</option>)}</select></label><label className="question-import-file"><span>Essay PDF or JSON</span><input type="file" accept="application/pdf,.pdf,application/json,.json,.txt" onChange={(e)=>setFile(e.target.files?.[0]||null)}/><small>Recognizes CASE N and Lecture N: Title, numbered questions, and their source answers. Standalone or multi-section JSON is supported; PDFs require an extractable text layer.</small></label><label><span>When the file has no Case/Lecture heading</span><select aria-label="Standalone essay content type" value={standaloneType} onChange={e=>setStandaloneType(e.target.value as 'LECTURE'|'CASE')}><option value="LECTURE">Treat as a lecture or section</option><option value="CASE">Treat as one clinical case</option></select></label></div><label className="question-import-rights"><input type="checkbox" checked={rights} onChange={(e)=>setRights(e.target.checked)}/><span>I confirm I have permission to use and publish this material.</span></label><button className="pp-button" disabled={inspecting} type="submit">{inspecting?<><FiRefreshCw className="spin"/>Inspecting essay file…</>:<><FiUploadCloud/>Inspect essay file</>}</button></form></Panel>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {inspection&&<><section className="question-import-summary"><Panel><small>CASES</small><strong>{inspection.summary.cases}</strong><span>detected case blocks</span></Panel><Panel><small>LECTURES</small><strong>{inspection.summary.lectures ?? 0}</strong><span>detected lecture blocks</span></Panel><Panel><small>ESSAYS</small><strong>{inspection.summary.extracted}</strong><span>{inspection.summary.valid} valid · {inspection.summary.needs_review} review · {inspection.summary.invalid} invalid</span></Panel><Panel><small>PAGES</small><strong>{inspection.page_count}</strong><span>{inspection.original_filename}</span></Panel><Panel><small>READY TO PUBLISH</small><strong>{publishable}</strong><span>approved + topic assigned + answer present</span></Panel></section>
      {inspection.issues.length>0&&<Panel title="Batch checks">{inspection.issues.map((issue)=><p key={issue.code}>{issue.severity}: {issue.message}</p>)}</Panel>}
      <Panel title="Default destination topic (optional when assigned per group)"><div className="question-import-fields"><label><span>Destination lecture topic</span><select value={globalTopicId} onChange={(e)=>setGlobalTopicId(e.target.value)}><option value="">Choose lecture topic…</option>{topics.map((topic)=><option key={topic.id} value={topic.id}>{topic.label}</option>)}</select><small>Use this as the default for all groups, or choose a separate destination topic for each case and lecture below.</small></label></div></Panel>
      <div className="question-import-filterbar">
        <label className="question-import-search"><FiSearch/><input type="search" value={candidateSearch} onChange={(e)=>setCandidateSearch(e.target.value)} placeholder="Search case, question number, text, answer, issue…" aria-label="Search inspected essay questions"/></label>
        <div className="question-import-status-filters" role="group" aria-label="Filter by review status">{([["ALL","All"],["VALID","Ready"],["NEEDS_REVIEW","Needs review"],["INVALID","Invalid"]] as const).map(([value,label])=><button type="button" key={value} className={statusFilter===value?"active":""} onClick={()=>setStatusFilter(value)}>{label} <span>{statusCounts[value]}</span></button>)}</div>
      </div>
      {groups.length===0&&<div className="question-import-empty-filter">No essay questions match this search and status filter.</div>}
      <section className="essay-import-groups">{groups.map(([key,items])=>{const first=items[0];return <Panel key={key} title={first.block_type==="LECTURE"?first.section:`${first.section} · Case ${first.case_number}`}><div className="essay-case-import-head"><label><input type="checkbox" aria-label={`Include all questions from ${first.section} ${first.case_number}`} checked={items.every(item=>item.approved)} onChange={event=>setGroupApproved(key,event.target.checked)}/> Include this {first.block_type==="LECTURE"?"lecture":"case"}</label><label>{first.block_type==="LECTURE"?"Lecture title":"Clinical case stem"}<textarea aria-label={`Edit ${first.block_type==="LECTURE"?"lecture title":"case stem"} for group ${first.case_number}`} value={first.case_stem} onChange={e=>updateStem(key,e.target.value)}/></label>{first.block_type==="CASE"&&user.role==="INSTRUCTOR"&&<label>Case Studio destination week <select aria-label={`Destination Case Studio week for Case ${first.case_number}`} value={caseWeeks[key]??""} onChange={(e)=>setCaseWeeks((previous)=>({...previous,[key]:e.target.value}))}><option value="">Choose week for draft case…</option>{(course?.weeks||[]).map((week)=><option key={week.id} value={week.id}>Week {week.weekNumber}{week.title?` · ${week.title}`:""}</option>)}</select></label>}<label>Question Bank topic <select aria-label={`Destination topic for ${first.section} ${first.block_type === "LECTURE" ? "lecture" : "case"} ${first.case_number}`} value={groupTopics[key] ?? ""} onChange={(e)=>setGroupTopics((existing)=>({...existing,[key]:e.target.value}))}><option value="">Use default topic</option>{topics.map((topic)=><option key={topic.id} value={topic.id}>{topic.label}</option>)}</select></label></div><div className="essay-import-question-list">{items.map((item)=><article key={item.candidate_id} className={`essay-import-question ${item.status.toLowerCase()}`}><header><label><input type="checkbox" checked={item.approved} disabled={item.status==="INVALID"} onChange={(e)=>update(item.candidate_id,{approved:e.target.checked})}/><FiCheck/>Q{item.question_number}</label><small>Question page {item.source_page??"?"} · Answer page {item.answer_page??"?"} · {item.answer_origin==="SOURCE"?"Source key":item.answer_origin==="MANUAL"?"Instructor supplied":"Answer not mapped"}</small></header><h3>{item.question_text}</h3><label>Model answer<textarea value={item.model_answer||""} onChange={(e)=>update(item.candidate_id,{model_answer:e.target.value})}/></label>{item.issues.map((issue)=><p className="form-error" key={issue.code}>{issue.message}</p>)}</article>)}</div></Panel>})}</section>
      <div className="question-import-publish-bar"><div><b>{publishable} essay questions ready for Question Bank</b><small>{unassignedApproved?`${unassignedApproved} approved questions still need a destination topic. `:""}Each approved question retains its source case or lecture and model answer.</small></div><button className="pp-button" type="button" disabled={!publishable||unassignedApproved>0||publishing} onClick={()=>void publish()}><FiFileText/>{publishing?"Publishing…":`Publish ${publishable} to Question Bank`}</button></div>{user.role==="INSTRUCTOR"&&caseDraftGroups.length>0&&<div className="question-import-publish-bar"><div><b>{mappedCaseDraftGroups.length} of {caseDraftGroups.length} cases ready for Case Studio</b><small>Assign each case to a week. Create unpublished drafts with the inspected questions and model answers; existing matching cases are skipped on retry.</small></div><button className="pp-button" type="button" disabled={!mappedCaseDraftGroups.length||creatingCases||publishing} onClick={()=>void createCaseDrafts()}><FiFileText/>{creatingCases?"Creating case drafts…":`Create ${mappedCaseDraftGroups.length} Case Studio drafts`}</button></div>}</>}
  </main></ProductShell>;
}
