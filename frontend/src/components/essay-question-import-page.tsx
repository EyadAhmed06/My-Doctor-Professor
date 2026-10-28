"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiArrowLeft, FiCheck, FiFileText, FiRefreshCw, FiSearch, FiUploadCloud } from "react-icons/fi";
import { EssayV3Organize } from "./essay-v3-organize";
import { EssayV3Publish } from "./essay-v3-publish";
import { EssayHybridWorkspace } from "./essay-hybrid-workspace";
import { useEssayReviewHistory } from "./use-essay-review-history";
import { splitEssayPublishBatches } from "@/lib/essay-import-batching";
import type { Candidate, Inspection, ReviewCandidate } from "./essay-import-model";
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
type StoredEssayReview = {
  courseId?: string;
  candidates?: Array<Partial<ReviewCandidate> & { candidate_id: string }>;
  groupTopics?: Record<string,string>;
  caseWeeks?: Record<string,string>;
  globalTopicId?: string;
  published?: string[];
};
type EssaySessionSummary = {
  session_id: string;
  original_filename: string;
  total: number;
  revision?: number;
  updated_at?: string;
};
type EssaySessionInspection = Inspection & {
  session_id: string;
  total: number;
  revision: number;
  review?: StoredEssayReview;
};
type ExistingCaseCurriculum = { weeks: Array<{ id:string; cases:Array<{ weekId:string; sourceCaseNumber:number|null; section:string|null; stem:string; id:string; isPublished:boolean }> }> };

function topicsFor(course: Course | null) {
  return (course?.weeks || []).flatMap((week) => (week.lectures || []).flatMap((lecture) => (lecture.topics || []).map((topic) => ({ ...topic, label: `Week ${week.weekNumber} · ${lecture.title} · ${topic.topicName}` }))));
}

function normalizedSubject(value: string) {
  return value.toLowerCase().replace(/^lecture\\s+\\d+\\s*[:.-]?\\s*/,"").replace(/[^a-z0-9]+/g," ").trim();
}

export function EssayQuestionImportPage() {
  const { user, loading: authLoading, request } = useAuth();
  const { notify } = useUx();
  const [savedSessions, setSavedSessions] = useState<EssaySessionSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionRevision = useRef(0);
  const lastSavedReview = useRef("");
  const [savingReview, setSavingReview] = useState(false);
  const [reviewSaveError, setReviewSaveError] = useState<string | null>(null);
  const [reviewSavedAt, setReviewSavedAt] = useState<number | null>(null);
  const [courses, setCourses] = useState<Course[]>([]); const [courseId,setCourseId]=useState(""); const [course,setCourse]=useState<Course|null>(null);
  const [file,setFile]=useState<File|null>(null); const [standaloneType,setStandaloneType]=useState<'LECTURE'|'CASE'>('LECTURE'); const [rights,setRights]=useState(false); const [inspection,setInspection]=useState<Inspection|null>(null); const {items:candidates,setItems:setCandidates,resetItems:resetCandidates,undo,redo,canUndo,canRedo}=useEssayReviewHistory<ReviewCandidate>([]);
  const [loading,setLoading]=useState(true); const [inspecting,setInspecting]=useState(false); const [publishing,setPublishing]=useState(false); const [error,setError]=useState<string|null>(null);
  const [candidateSearch,setCandidateSearch]=useState(""); const [statusFilter,setStatusFilter]=useState<"ALL"|Candidate["status"]>("ALL"); const [globalTopicId,setGlobalTopicId]=useState(""); const [groupTopics,setGroupTopics]=useState<Record<string,string>>({});
  const [caseWeeks,setCaseWeeks]=useState<Record<string,string>>({}); const [creatingCases,setCreatingCases]=useState(false);
  const [stage,setStage]=useState<"UPLOAD"|"REVIEW"|"ORGANIZE"|"PUBLISH">("UPLOAD");
  const [publishDestination,setPublishDestination]=useState<"QUESTION_BANK"|"CASE_STUDIO">("QUESTION_BANK");
  const [publishProgress,setPublishProgress]=useState<{done:number;total:number}|null>(null);
  const [publishedQuestionIds,setPublishedQuestionIds]=useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activeGroup, setActiveGroup] = useState<string>("ALL");
  const topics = useMemo(() => topicsFor(course), [course]);
  const saveInFlight = useRef(false);
  useEffect(() => {
    if (!sessionId || !candidates.length || saveInFlight.current) return;
    if(!inspection)return;
    const originals = new Map(inspection.candidates.map(item=>[item.candidate_id,item]));
    const changes:Array<Partial<ReviewCandidate>&{candidate_id:string}>=[];
    for(const item of candidates){
      const base=originals.get(item.candidate_id);
      if(!base)continue;
      const change:Partial<ReviewCandidate>&{candidate_id:string}={candidate_id:item.candidate_id};
      if(item.approved!==(base.status==="VALID"))change.approved=item.approved;
      if(item.model_answer!==base.model_answer)change.model_answer=item.model_answer;
      if(item.question_text!==base.question_text)change.question_text=item.question_text;
      if(item.case_stem!==base.case_stem)change.case_stem=item.case_stem;
      if(item.difficulty!=="MEDIUM")change.difficulty=item.difficulty;
      if(item.marks!==1)change.marks=item.marks;
      if(Object.keys(change).length>1)changes.push(change);
    }
    const review:StoredEssayReview = {
      courseId,groupTopics,caseWeeks,globalTopicId,published:[...publishedQuestionIds],
      candidates:changes,
    };
    const serialized=JSON.stringify(review);
    if(serialized===lastSavedReview.current)return;
    const timer=window.setTimeout(()=>{
      if(saveInFlight.current)return;
      saveInFlight.current=true;setSavingReview(true);setReviewSaveError(null);
      void request<{revision:number}>(`/questions/imports/essay/sessions/${sessionId}/review`,{
        method:"PUT",body:{revision:sessionRevision.current,review},
      }).then(response=>{
        sessionRevision.current=response.revision;
        lastSavedReview.current=serialized;
        setReviewSavedAt(Date.now());
      }).catch(c=>{
        setReviewSaveError(c instanceof Error ? c.message : "Review could not be saved.");
      }).finally(()=>{saveInFlight.current=false;setSavingReview(false);});
    },1800);
    return ()=>window.clearTimeout(timer);
  },[sessionId,inspection,candidates,courseId,groupTopics,caseWeeks,globalTopicId,publishedQuestionIds,request,savingReview]);

  // Store the in-progress review in this tab only. The uploaded source itself
  // is never persisted, and another instructor cannot load this tab's snapshot.
  const reviewStorageKey = inspection && user?.id ? `mdp:essay-review:v2:${user.id}:${inspection.file_sha256}` : null;
  useEffect(() => {
    if (!reviewStorageKey || !candidates.length) return;
    const timer=window.setTimeout(()=>{
    try {
      sessionStorage.setItem(reviewStorageKey, JSON.stringify({
        version: 2, courseId, updatedAt: Date.now(),
        candidates: candidates.map(item => ({
          candidate_id: item.candidate_id, approved: item.approved, model_answer: item.model_answer,
          question_text: item.question_text, case_stem: item.case_stem, marks: item.marks, difficulty: item.difficulty,
        })),
        groupTopics, caseWeeks, globalTopicId, published: [...publishedQuestionIds],
      }));
    } catch { /* quota exceeded or storage restricted: imports remain usable in memory */ }
    }, 500);
    return ()=>window.clearTimeout(timer);
  }, [reviewStorageKey, candidates, courseId, groupTopics, caseWeeks, globalTopicId, publishedQuestionIds]);


  const load = useCallback(async()=>{ if(!user||user.role==="STUDENT")return; setLoading(true);
    try { setCourses((await request<PageResponse<Course>>("/academic/courses?limit=100")).data); }
    catch(c) { setError(c instanceof Error?c.message:"Unable to load courses."); }
    try { setSavedSessions(await request<EssaySessionSummary[]>("/questions/imports/essay/sessions")); }
    catch { /* The importer remains usable if saved-session listing is unavailable. */ }
    setLoading(false);
  },[request,user]);
  useEffect(()=>{void load()},[load]);
  async function chooseCourse(id:string){setCourseId(id);setCourse(null);setGlobalTopicId("");setGroupTopics({});setCaseWeeks({}); if(!id)return; try{setCourse(await request<Course>(`/academic/courses/${id}`));}catch(c){setError(c instanceof Error?c.message:"Unable to load course structure.")}}

  async function fetchSavedSession(id:string): Promise<EssaySessionInspection> {
    const meta=await request<EssaySessionInspection>(`/questions/imports/essay/sessions/${id}`);
    const all:Candidate[]=[];
    for(let offset=0;offset<meta.total;offset+=200) {
      const page=await request<{candidates:Candidate[]}>(`/questions/imports/essay/sessions/${id}/candidates?offset=${offset}&limit=200`);
      all.push(...page.candidates);
    }
    if(all.length!==meta.total)throw new Error("The saved essay import is incomplete. Please reopen it.");
    return {...meta,candidates:all};
  }

  function reviewedCandidates(result:Inspection, restored:StoredEssayReview|null):ReviewCandidate[] {
    const overrides=new Map((restored?.candidates||[]).map(item=>[item.candidate_id,item]));
    return result.candidates.map(item=>{
      const prior=overrides.get(item.candidate_id);
      const question_text=prior?.question_text ?? item.question_text;
      const model_answer=prior?.model_answer ?? item.model_answer;
      const case_stem=prior?.case_stem ?? item.case_stem;
      const issues=item.issues.filter(issue=>!["MODEL_ANSWER_MISSING","QUESTION_TOO_SHORT","CASE_STEM_MISSING"].includes(issue.code));
      if(!model_answer?.trim())issues.push({code:"MODEL_ANSWER_MISSING",severity:"ERROR",message:"A model answer is required before publication."});
      if(question_text.trim().length<8)issues.push({code:"QUESTION_TOO_SHORT",severity:"ERROR",message:"The essay question must contain at least 8 characters."});
      if(item.block_type==="CASE"&&!case_stem.trim())issues.push({code:"CASE_STEM_MISSING",severity:"WARNING",message:"Provide the clinical case stem."});
      const status=issues.some(issue=>issue.severity==="ERROR")?"INVALID":issues.length?"NEEDS_REVIEW":"VALID";
      return {...item,approved:(prior?.approved ?? item.status==="VALID")&&status!=="INVALID",
        model_answer,question_text,case_stem,issues,status,
        answer_origin:model_answer?.trim()&&item.answer_origin==="MISSING"?"MANUAL":item.answer_origin,
        difficulty:prior?.difficulty ?? "MEDIUM",marks:prior?.marks ?? 1};
    });
  }

  async function resumeSession(id:string) {
    setInspecting(true);setError(null);
    try {
      const result=await fetchSavedSession(id);
      sessionRevision.current=result.revision;setReviewSaveError(null);setReviewSavedAt(null);
      lastSavedReview.current="";
      setSessionId(id);
      if(result.review?.courseId) await chooseCourse(result.review.courseId);
      setInspection(result);
      resetCandidates(reviewedCandidates(result,result.review||null));
      setGroupTopics(result.review?.groupTopics||{});
      setCaseWeeks(result.review?.caseWeeks||{});
      setGlobalTopicId(result.review?.globalTopicId||"");
      setPublishedQuestionIds(new Set(result.review?.published||[]));
      setStage("REVIEW");setRights(true);setCollapsed({});setActiveGroup("ALL");
      notify({title:"Essay review restored",description:`${result.total} questions loaded from your saved import.`,tone:"success"});
    } catch(c) { setError(c instanceof Error?c.message:"Could not resume saved import."); }
    finally {setInspecting(false);}
  }

  async function inspect(event:FormEvent){event.preventDefault(); if(!file){notify({title:"Choose an essay file",tone:"info"});return} if(!rights){notify({title:"Permission confirmation required",tone:"info"});return}
    const json=/\.(json|txt)$/i.test(file.name);
    if(!(/\.pdf$/i.test(file.name)||json)||!file.size||file.size>(json?2:50)*1024*1024){notify({title:"Unsupported essay file",description:"Choose a non-empty PDF (50 MB), JSON or JSON text (2 MB).",tone:"error"});return}
    setInspecting(true);setError(null);setSessionId(null);setReviewSaveError(null);setReviewSavedAt(null);setInspection(null);resetCandidates([]);setCollapsed({});setActiveGroup("ALL");setGlobalTopicId("");setGroupTopics({});setCaseWeeks({});setPublishedQuestionIds(new Set());setPublishDestination("QUESTION_BANK");setStage("UPLOAD"); try{const body=new FormData();body.append("file",file);body.append("copyright_confirmed","true");body.append("content_type",standaloneType); const created=await request<{session_id:string}>("/questions/imports/essay/sessions/inspect",{method:"POST",body,signal:AbortSignal.timeout(60000)});
      const result=await fetchSavedSession(created.session_id);
      setSessionId(created.session_id);sessionRevision.current=result.revision;lastSavedReview.current="";
      setSavedSessions(previous=>[{session_id:created.session_id,original_filename:result.original_filename,total:result.total},...previous].slice(0,10)); let restored: StoredEssayReview|null = null;
      try { const raw=sessionStorage.getItem(`mdp:essay-review:v2:${user?.id}:${result.file_sha256}`); if(raw) restored=JSON.parse(raw); } catch { /* corrupt or unavailable saved review */ }
      setInspection(result);setStage("REVIEW");
      resetCandidates(reviewedCandidates(result,restored));
      if(restored && restored.courseId===courseId){setGroupTopics(restored.groupTopics||{});setCaseWeeks(restored.caseWeeks||{});setGlobalTopicId(restored.globalTopicId||"");}
      if(restored?.published)setPublishedQuestionIds(new Set(restored.published)); notify({title:"Essay file inspected",description:`${result.summary.cases} cases · ${result.summary.lectures ?? 0} lectures · ${result.summary.extracted} essay questions detected.`,tone:"success"});}catch(c){const msg=c instanceof Error?c.message:"Unable to inspect essay PDF.";setError(msg);notify({title:"Essay inspection failed",description:msg,tone:"error"});}finally{setInspecting(false)}}

  const update=useCallback((id:string, patch:Partial<ReviewCandidate>)=>{
    setCandidates(items=>items.map(item=>{
      if(item.candidate_id!==id)return item;
      const next={...item,...patch};
      if(patch.model_answer!==undefined || patch.question_text!==undefined){
        const present=Boolean(next.model_answer?.trim());
        const issues=next.issues.filter(issue=>issue.code!=="MODEL_ANSWER_MISSING"&&issue.code!=="QUESTION_TOO_SHORT");
        if(next.question_text.trim().length<8)issues.push({code:"QUESTION_TOO_SHORT",severity:"ERROR",message:"The essay question must contain at least 8 characters."});
        if(!present)issues.push({code:"MODEL_ANSWER_MISSING",severity:"ERROR",message:"A model answer is required before publication."});
        next.issues=issues;
        next.status=issues.some(issue=>issue.severity==="ERROR")?"INVALID":issues.length?"NEEDS_REVIEW":"VALID";
        next.answer_origin=present&&item.answer_origin==="MISSING"?"MANUAL":item.answer_origin;
        next.approved=present&&next.approved;
      }
      return next;
    }));
  },[setCandidates]);
  function updateStem(key:string,stem:string){
    setCandidates(items=>items.map(item=>{
      if(`${item.section}::${item.case_number}`!==key)return item;
      const issues=item.issues.filter(issue=>issue.code!=="CASE_STEM_MISSING");
      if(!stem.trim()&&item.block_type==="CASE")issues.push({code:"CASE_STEM_MISSING",severity:"WARNING",message:"Provide the clinical case stem."});
      return {...item,case_stem:stem,issues,status:issues.some(issue=>issue.severity==="ERROR")?"INVALID":issues.length?"NEEDS_REVIEW":"VALID"};
    }));
  }
  function suggestTopicMatches() {
    const updates: Record<string,string> = {};
    const representatives = new Map<string,ReviewCandidate>();
    for (const item of candidates) if (!representatives.has(groupKey(item))) representatives.set(groupKey(item),item);
    for (const [key,item] of representatives) {
      if (groupTopics[key] || item.block_type!=="LECTURE") continue;
      const subject=normalizedSubject(item.case_stem||item.section);
      if (!subject) continue;
      const matches=topics.filter(topic=>normalizedSubject(topic.topicName)===subject);
      if (matches.length===1) updates[key]=matches[0].id;
    }
    if (!Object.keys(updates).length) {
      notify({title:"No unambiguous matches",description:"Assign destination topics manually. No topics were changed.",tone:"info"});
      return;
    }
    setGroupTopics(existing=>({...updates,...existing}));
    notify({title:"Topic suggestions applied",description:`${Object.keys(updates).length} lecture group(s) matched exactly. Review their destinations before publishing.`,tone:"success"});
  }

  function setGroupApproved(key:string,approved:boolean){setCandidates(items=>items.map(item=>`${item.section}::${item.case_number}`===key?{...item,approved:approved&&item.status!=="INVALID"}:item))}
  const statusCounts=useMemo(()=>({ALL:candidates.length,VALID:candidates.filter((item)=>item.status==="VALID").length,NEEDS_REVIEW:candidates.filter((item)=>item.status==="NEEDS_REVIEW").length,INVALID:candidates.filter((item)=>item.status==="INVALID").length}),[candidates]);
  const filteredCandidates=useMemo(()=>{const query=candidateSearch.trim().toLowerCase();return candidates.filter((item)=>{if(statusFilter!=="ALL"&&item.status!==statusFilter)return false;if(activeGroup!=="ALL"&&`${item.section}::${item.case_number}`!==activeGroup)return false;if(!query)return true;return [item.section,item.case_number,item.question_number,item.case_stem,item.question_text,item.model_answer,item.status,item.answer_origin,...item.issues.flatMap((issue)=>[issue.code,issue.message])].some((value)=>String(value??"").toLowerCase().includes(query))})},[candidateSearch,candidates,statusFilter,activeGroup]);
  const groups=useMemo(()=>{const map=new Map<string,ReviewCandidate[]>();for(const item of filteredCandidates){const key=`${item.section}::${item.case_number}`;if(!map.has(key))map.set(key,[]);map.get(key)!.push(item)}return [...map.entries()]},[filteredCandidates]);
  const groupKey=(item:Candidate)=>`${item.section}::${item.case_number}`;
  const topicFor=(item:Candidate)=>groupTopics[groupKey(item)] || globalTopicId;
  const publishable=candidates.filter((item)=>item.approved&&item.status!=="INVALID"&&item.model_answer?.trim()&&Number.isFinite(item.marks)&&item.marks>0&&topicFor(item)&&!publishedQuestionIds.has(item.candidate_id)).length;
  const unassignedApproved=candidates.filter((item)=>item.approved&&item.status!=="INVALID"&&item.model_answer?.trim()&&!topicFor(item)&&!publishedQuestionIds.has(item.candidate_id)).length;
  const invalidApproved=candidates.filter(item=>item.approved&&item.status==="INVALID").length;
  const publicationPreview = useMemo(() => {
    const grouped = new Map<string, { label: string; count: number; missingTopic: number; invalid: number; topicLabel: string }>();
    for (const item of candidates) {
      if (!item.approved || publishedQuestionIds.has(item.candidate_id)) continue;
      const key = `${item.section}::${item.case_number}`;
      const destinationId = groupTopics[key] || globalTopicId;
      const current = grouped.get(key) || { label: item.block_type === "LECTURE" ? item.section : `Case ${item.case_number} · ${item.section}`,
        count: 0, missingTopic: 0, invalid: 0, topicLabel: topics.find(topic=>topic.id===destinationId)?.label || "Not assigned" };
      current.count++;
      if (!destinationId) current.missingTopic++;
      if (item.status==="INVALID" || !item.model_answer?.trim() || !Number.isFinite(item.marks) || item.marks<=0) current.invalid++;
      grouped.set(key,current);
    }
    return [...grouped.values()];
  }, [candidates, publishedQuestionIds, groupTopics, globalTopicId, topics]);
  const caseDraftGroups=useMemo(()=>{const grouped=new Map<string,ReviewCandidate[]>();for(const item of candidates){if(item.block_type!=="CASE"||!item.approved)continue;const key=`${item.section}::${item.case_number}`;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key)!.push(item);}return [...grouped.entries()]},[candidates]);
  const mappedCaseDraftGroups=caseDraftGroups.filter(([key,items])=>caseWeeks[key] && course?.weeks?.some((week)=>week.id===caseWeeks[key]) && items.every(item=>item.status!=="INVALID"&&Boolean(item.model_answer?.trim())&&item.question_text.trim().length>=8));

  async function publish(scopeIds?: string[]){
    if(!inspection||publishing||creatingCases)return;
    const selected = candidates.filter(item => (scopeIds ? scopeIds.includes(item.candidate_id) : item.approved) && !publishedQuestionIds.has(item.candidate_id));
    if(!selected.length){setError("Select at least one essay question to publish.");return;}
    const blocked = selected.find(item=>item.status==="INVALID"||!item.question_text.trim()||!item.model_answer?.trim()||!topicFor(item)||!Number.isFinite(item.marks)||item.marks<=0);
    if(blocked){setError("Selected essay questions need a valid source answer and an assigned destination topic before publication.");return;}
    if(!window.confirm(`Publish ${selected.length} selected essay question(s) to the Question Bank? Each question will be placed in its assigned topic. Review the destination first.`))return;
    setPublishing(true);setError(null);setPublishProgress({done:0,total:selected.length});
    let processed=0, created=0, reused=0, skipped=0;
    const batches=splitEssayPublishBatches(selected);
    try{
      for(const batch of batches){
        const result=await request<{created:number;reused:number;skipped:number}>("/questions/imports/essay/publish",{
          method:"POST",
          body:{
            original_filename:inspection.original_filename,
            file_sha256:inspection.file_sha256,
            copyright_confirmed:rights,
            candidates:batch.map(item=>({
              approved:true,
              block_type:item.block_type||"CASE",
              topic_id:topicFor(item),
              case_label:item.case_label,
              case_stem:item.case_stem,
              question_text:item.question_text,
              model_answer:item.model_answer||"",
              difficulty:item.difficulty,
              marks:Number(item.marks),
              source_page:item.source_page||undefined,
              answer_page:item.answer_page||undefined,
            })),
          },
        });
        processed+=batch.length;created+=result.created;reused+=result.reused;skipped+=result.skipped;
        setPublishedQuestionIds(previous=>new Set([...previous,...batch.map(item=>item.candidate_id)]));
        setPublishProgress({done:processed,total:selected.length});
      }
      notify({title:"Essay question bank updated",description:`${created} created · ${reused} reused · ${skipped} skipped across ${batches.length} batches.`,tone:"success"});
    }catch(c){
      setError(`${c instanceof Error?c.message:"Unable to publish essay questions."} ${processed} of ${selected.length} questions were submitted successfully. Those selections are marked as published; retry to submit the remaining questions only.`);
    }
    finally{setPublishing(false);setPublishProgress(null);}
  }

  async function createCaseDrafts(publishNow=false){
    if(!inspection||!courseId||!mappedCaseDraftGroups.length||creatingCases||publishing||user?.role!=="INSTRUCTOR")return;
    if(publishNow&&!window.confirm(`Publish ${mappedCaseDraftGroups.length} selected clinical case(s) to students in their assigned weeks? Existing matching cases will be skipped, not changed.`))return;
    setCreatingCases(true);setError(null);
    let created=0,skipped=0,publishedExisting=0;
    try{
      // Retry-safe preflight: do not duplicate an existing case with matching
      // source case number, section, stem and destination week.
      const current=await request<ExistingCaseCurriculum>(`/essay-cases?course_id=${encodeURIComponent(courseId)}`);
      const existing=new Map(current.weeks.flatMap((week)=>week.cases.map((item)=>[
        JSON.stringify([item.weekId,item.sourceCaseNumber,item.section||"",item.stem.trim()]),item] as const)));
      for(const [key,items] of mappedCaseDraftGroups){
        const first=items[0];
        const weekId=caseWeeks[key];
        const dedupKey=JSON.stringify([weekId,first.case_number,first.section||"",first.case_stem.trim()]);
        const prior=existing.get(dedupKey);
        if(prior){
          if(publishNow&&!prior.isPublished){ await request(`/essay-cases/${prior.id}`,{method:"PUT",body:{is_published:true}}); publishedExisting++; }
          else skipped++;
          continue;
        }
        await request("/essay-cases",{method:"POST",body:{
          week_id:weekId,title:`Case ${first.case_number}`,stem:first.case_stem,
          section:first.section.slice(0,120),source_case_number:first.case_number,
          is_published:publishNow,questions:[...items].sort((a,b)=>a.question_number-b.question_number).map((item)=>({
            prompt:item.question_text,model_answer:item.model_answer!.trim(),
          })),
        }});
        existing.set(dedupKey,{id:"",isPublished:publishNow,weekId,sourceCaseNumber:first.case_number,section:first.section,stem:first.case_stem});created++;
      }
      notify({title:publishNow?"Clinical cases published":"Case Studio drafts created",description:`${created} new cases · ${publishedExisting} existing drafts published · ${skipped} matching cases unchanged.`,tone:"success"});
    }catch(c){
      const message=c instanceof Error?c.message:"Unable to create Case Studio drafts.";
      setError(`${message} (${created} case drafts created before the error; retry will skip existing drafts.)`);
    }finally{setCreatingCases(false)}
  }

  if(authLoading||loading)return <ProductShell><main className="pp-page"><PageSkeleton variant="workspace" label="Loading essay importer"/></main></ProductShell>;
  if(!user||user.role==="STUDENT")return <ProductShell><main className="pp-page"><Panel title="Instructor access required"><p>This workflow is restricted to instructors and administrators.</p></Panel></main></ProductShell>;

  return <ProductShell search="Search essay imports"><main className="pp-page question-import-page"><header className="question-import-heading"><div><Link className="question-import-back" href={user.role==="SYSTEM_ADMIN"?"/admin/questions":"/instructor/essay-cases"}><FiArrowLeft/>{user.role==="SYSTEM_ADMIN"?"Question bank":"Essay cases"}</Link><span className="page-eyebrow">ESSAY IMPORT WORKSPACE</span><h1>Import Essay Questions</h1><p>Upload a PDF or JSON file, check the detected cases and lectures, choose their destinations, and publish only what you approve. Nothing becomes visible to students during inspection.</p></div></header>
    <nav className="essay-v2-stepper" aria-label="Essay import steps">
      {([["UPLOAD","1. Upload"],["REVIEW","2. Review"],["ORGANIZE","3. Organize"],["PUBLISH","4. Publish"]] as const).map(([value,label])=>
        <button type="button" key={value} className={stage===value?"active":""} aria-current={stage===value?"step":undefined} disabled={value!=="UPLOAD"&&!inspection} onClick={()=>setStage(value)}>{label}</button>)}
    </nav>
    {inspection&&stage!=="UPLOAD"&&<div className="question-import-bulk-actions"><button className="pp-button secondary" type="button" onClick={()=>setStage("UPLOAD")}>Change source file</button><small>{inspection.original_filename} · {inspection.summary.extracted} questions found</small></div>}
    {stage==="UPLOAD"&&<Panel><form onSubmit={inspect} className="question-import-upload-form"><div className="question-import-fields"><label><span>Destination course (can be chosen after inspection)</span><select value={courseId} onChange={(e)=>void chooseCourse(e.target.value)}><option value="">Select course…</option>{courses.map((item)=><option key={item.id} value={item.id}>{item.courseCode} · {item.courseName}</option>)}</select></label><label className="question-import-file"><span>Essay PDF or JSON</span><input type="file" accept="application/pdf,.pdf,application/json,.json,.txt" onChange={(e)=>setFile(e.target.files?.[0]||null)}/><small>Recognizes CASE N and Lecture N: Title, numbered questions, and their source answers. Standalone or multi-section JSON is supported; PDFs require an extractable text layer.</small></label><label><span>When the file has no Case/Lecture heading</span><select aria-label="Standalone essay content type" value={standaloneType} onChange={e=>setStandaloneType(e.target.value as 'LECTURE'|'CASE')}><option value="LECTURE">Treat as a lecture or section</option><option value="CASE">Treat as one clinical case</option></select></label></div><label className="question-import-rights"><input type="checkbox" checked={rights} onChange={(e)=>setRights(e.target.checked)}/><span>I confirm I have permission to use and publish this material.</span></label><button className="pp-button" disabled={inspecting} type="submit">{inspecting?<><FiRefreshCw className="spin"/>Inspecting essay file…</>:<><FiUploadCloud/>Inspect essay file</>}</button></form></Panel>}
    {stage==="UPLOAD"&&savedSessions.length>0&&<Panel title="Resume a saved essay review">
      <p>Your recent imports are saved securely for seven days. Open one to continue reviewing on this device or another device.</p>
      <div className="essay-v2-saved-sessions">
        {savedSessions.map(saved=><button key={saved.session_id} type="button" className="pp-button secondary" disabled={inspecting}
          onClick={()=>void resumeSession(saved.session_id)}>
          <FiFileText/> {saved.original_filename} · {saved.total} questions
        </button>)}
      </div>
    </Panel>}
    {inspection&&sessionId&&<div role="status" className={`essay-v2-save-status ${reviewSaveError?"is-error":savingReview?"is-saving":"is-saved"}`}>
      <span aria-hidden="true">{reviewSaveError?"⚠":savingReview?"◌":reviewSavedAt?"✓":"◌"}</span>
      <span>{reviewSaveError?"Review not saved — your edits remain in this tab.":savingReview?"Saving changes…":reviewSavedAt?"Changes saved to your account":"Review autosave is ready"}</span>
      {reviewSaveError&&<small>{reviewSaveError}</small>}
    </div>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    {inspection&&stage!=="UPLOAD"&&<><section className="question-import-summary essay-v2-import-summary"><Panel><small>CASES</small><strong>{inspection.summary.cases}</strong><span>detected case blocks</span></Panel><Panel><small>LECTURES</small><strong>{inspection.summary.lectures ?? 0}</strong><span>detected lecture blocks</span></Panel><Panel><small>ESSAYS</small><strong>{inspection.summary.extracted}</strong><span>{statusCounts.VALID} ready · {statusCounts.NEEDS_REVIEW} review · {statusCounts.INVALID} invalid</span></Panel><Panel><small>PAGES</small><strong>{inspection.page_count}</strong><span>{inspection.original_filename}</span></Panel><Panel><small>READY TO PUBLISH</small><strong>{publishable}</strong><span>{stage==="REVIEW"?"Select questions, then assign a destination in Organize":stage==="ORGANIZE"?"Select questions and assign a topic or week":"Approved questions with a valid destination and answer"}</span></Panel></section>
      {inspection.issues.length>0&&<Panel title="Batch checks">{inspection.issues.map((issue)=><p key={issue.code}>{issue.severity}: {issue.message}</p>)}</Panel>}
      {stage==="REVIEW"&&<EssayHybridWorkspace items={candidates} publishedIds={publishedQuestionIds} onUpdate={update} onGroupStem={updateStem} onGroupApproval={setGroupApproved}/>}

      {stage==="ORGANIZE"&&<EssayV3Organize
        items={candidates} courses={courses} courseId={courseId} course={course} topics={topics}
        groupTopics={groupTopics} globalTopicId={globalTopicId} caseWeeks={caseWeeks}
        busy={publishing||creatingCases}
        onChooseCourse={id=>void chooseCourse(id)}
        onDefaultTopic={setGlobalTopicId}
        onGroupTopic={(id,topic)=>setGroupTopics(current=>({...current,[id]:topic}))}
        onCaseWeek={(id,week)=>setCaseWeeks(current=>({...current,[id]:week}))}
        onSuggest={suggestTopicMatches}
        onSelectGroup={setGroupApproved}
        onBack={()=>setStage("REVIEW")}
        onContinue={()=>setStage("PUBLISH")}
      />}
      {stage==="REVIEW"&&<div className="essay-v3-stage-next"><button type="button" className="pp-button" onClick={()=>setStage("ORGANIZE")}>Continue to organize →</button></div>}
      {stage==="PUBLISH"&&<EssayV3Publish
        items={candidates} destination={publishDestination} onDestination={setPublishDestination}
        allowedCaseStudio={user.role==="INSTRUCTOR"} readyCount={publishable}
        unassignedCount={unassignedApproved} invalidCount={invalidApproved}
        rows={publicationPreview} caseGroups={caseDraftGroups.length}
        validCaseGroups={mappedCaseDraftGroups.length}
        publishedIds={publishedQuestionIds} progress={publishProgress}
        busy={publishing||creatingCases}
        onPublishQuestions={()=>void publish()}
        onCreateCases={()=>void createCaseDrafts()}
        onPublishCases={()=>void createCaseDrafts(true)}
        onBack={()=>setStage("ORGANIZE")}
        onReturnToReview={()=>setStage("REVIEW")}
      />}</>}
  </main></ProductShell>;
}
