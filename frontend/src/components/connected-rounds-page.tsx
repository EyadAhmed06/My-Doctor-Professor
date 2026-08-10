"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FiArrowRight, FiBookOpen, FiChevronDown, FiChevronRight, FiFileText,
  FiLayers, FiPlayCircle, FiRefreshCw
} from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell, Progress } from "./product-shell";
import "./product-pages.css";

type Bundle={id:string;title:string;read_only?:boolean};
type Lecture={id:string;title:string;description:string|null;lectureNumber:number;question_count:number;flashcard_deck_count:number;resource_count:number};
type Week={id:string;weekNumber:number;title:string|null;description:string|null;lectures:Lecture[]};
type Course={id:string;courseName:string;courseCode:string;description:string|null;weeks:Week[]};
type Content={bundle:Bundle;courses:Course[]};
type Generated={test:{id:string};attempt:{id:string};question_count:number};

export function ConnectedRoundsPage(){
  const {request}=useAuth(); const router=useRouter(); const searchParams=useSearchParams();
  const requestedBundle=searchParams.get("bundle");
  const requestedCourse=searchParams.get("course");
  const requestedLecture=searchParams.get("lecture");
  const [bundles,setBundles]=useState<Bundle[]>([]); const [bundleId,setBundleId]=useState("");
  const [courses,setCourses]=useState<Course[]>([]); const [courseId,setCourseId]=useState("");
  const [selected,setSelected]=useState<Lecture|null>(null); const [openWeeks,setOpenWeeks]=useState<string[]>([]);
  const [loading,setLoading]=useState(true); const [starting,setStarting]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{let active=true;void request<Bundle[]>("/bundles/mine").then(result=>{
    if(!active)return;
    setBundles(result);
    const target=result.find(item=>item.id===requestedBundle)||result[0];
    setBundleId(target?.id||"");
    if(!result.length)setLoading(false);
  }).catch(cause=>{if(active){setError(cause instanceof Error?cause.message:"Unable to load your bundles.");setLoading(false);}});
  return()=>{active=false};},[request,requestedBundle]);

  useEffect(()=>{if(!bundleId)return;let active=true;setLoading(true);
    void request<Content>("/bundles/"+bundleId+"/content").then(result=>{
      if(!active)return;
      setCourses(result.courses);
      const lectureCourse=requestedLecture?result.courses.find(item=>item.weeks.some(week=>week.lectures.some(lecture=>lecture.id===requestedLecture))):undefined;
      const target=lectureCourse||result.courses.find(item=>item.id===requestedCourse)||result.courses[0];
      setCourseId(target?.id||"");
      setError(null);
    }).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Unable to load bundle curriculum.");})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[bundleId,request,requestedCourse,requestedLecture]);

  const course=useMemo(()=>courses.find(item=>item.id===courseId),[courseId,courses]);
  const weeks=useMemo(()=>course?.weeks??[],[course]);
  const lectureRows=useMemo(()=>weeks.flatMap(week=>week.lectures.map(lecture=>({week,lecture}))),[weeks]);
  const totals=useMemo(()=>lectureRows.reduce((value,row)=>({
    questions:value.questions+row.lecture.question_count,
    decks:value.decks+row.lecture.flashcard_deck_count,
    resources:value.resources+row.lecture.resource_count
  }),{questions:0,decks:0,resources:0}),[lectureRows]);
  const currentBundle=bundles.find(item=>item.id===bundleId);

  useEffect(()=>{
    const requested=requestedLecture?weeks.flatMap(item=>item.lectures).find(lecture=>lecture.id===requestedLecture):undefined;
    const first=requested||weeks.flatMap(item=>item.lectures)[0]||null;
    setSelected(first);
    const firstWeek=first?weeks.find(item=>item.lectures.some(lecture=>lecture.id===first.id)):undefined;
    setOpenWeeks(firstWeek?[firstWeek.id]:[]);
  },[requestedLecture,weeks]);

  function toggleWeek(id:string){setOpenWeeks(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);}

  async function startTutor(){
    if(!selected||selected.question_count<1||currentBundle?.read_only)return;
    setStarting(true);setError(null);
    try{
      const generated=await request<Generated>("/tests/practice/generate",{method:"POST",body:{
        bundle_id:bundleId,lecture_ids:[selected.id],question_count:Math.min(20,selected.question_count),test_mode:"TUTOR"
      }});
      router.push("/mock-exam/session?attempt="+generated.attempt.id+"&test="+generated.test.id+"&mode=TUTOR&source=rounds&bundle="+bundleId+"&lecture="+selected.id);
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to start tutor questions.");}
    finally{setStarting(false);}
  }

  return <ProductShell search="Search courses, weeks, or lectures"><main className="pp-page rounds-reference-page">
    <header className="rounds-reference-header">
      <div><span className="page-eyebrow">QUESTION PRACTICE</span><h1>{course?.courseName||"Lecture Questions"}</h1>
        <p>{course?.description||"Choose a lecture, then solve the published questions assigned to it."}</p></div>
      <div className="rounds-reference-selectors">
        <label>Bundle<select value={bundleId} onChange={event=>setBundleId(event.target.value)}>{bundles.map(item=><option key={item.id} value={item.id}>{item.title}{item.read_only?" · read-only":""}</option>)}</select></label>
        <label>Course<select value={courseId} onChange={event=>setCourseId(event.target.value)}>{courses.map(item=><option key={item.id} value={item.id}>{item.courseCode} · {item.courseName}</option>)}</select></label>
      </div>
    </header>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {loading?<div className="product-auth-loading">Loading your question workspace…</div>:
    !bundles.length?<Panel title="No bundle access"><p>An administrator or instructor must assign a bundle before you can solve its questions.</p></Panel>:
    !course?<Panel title="No course available"><p>The selected bundle does not contain a visible course.</p></Panel>:
    <div className="rounds-reference-layout">
      <aside className="rounds-week-nav">
        <div className="rounds-nav-title"><span>LECTURE QUESTIONS</span><b>{course.courseCode}</b></div>
        {weeks.map(week=>{const isOpen=openWeeks.includes(week.id);const weekQuestions=week.lectures.reduce((sum,item)=>sum+item.question_count,0);return <section key={week.id}>
          <button className="rounds-week-button" onClick={()=>toggleWeek(week.id)}><span><b>Week {week.weekNumber}</b><small>{week.title||"Untitled week"} · {weekQuestions} questions</small></span><FiChevronDown className={isOpen?"open":""}/></button>
          {isOpen&&<div className="rounds-lecture-list">{week.lectures.map(lecture=><button key={lecture.id} className={selected?.id===lecture.id?"active":""} onClick={()=>setSelected(lecture)}>
            <span className="lecture-index">{lecture.lectureNumber}</span><span><b>{lecture.title}</b><small>{lecture.question_count} Qs · {lecture.flashcard_deck_count} decks</small></span><FiChevronRight/>
          </button>)}</div>}
        </section>})}
      </aside>
      <section className="rounds-learning-stage">{selected?<><div className="rounds-lecture-hero">
        <div className="rounds-lecture-icon"><FiBookOpen/></div><div><small>LECTURE {selected.lectureNumber}</small><h2>{selected.title}</h2><p>{selected.description||"The instructor has not published a lecture description yet."}</p></div>
      </div>
      <div className="rounds-action-grid">
        <article><FiFileText/><div><b>{selected.question_count}</b><span>Questions</span><small>Answer each published question for this lecture.</small></div></article>
        <article><FiLayers/><div><b>{selected.flashcard_deck_count}</b><span>Flashcard decks</span><small>Review material linked to this lecture.</small></div></article>
        <article><FiBookOpen/><div><b>{selected.resource_count}</b><span>Resources</span><small>Instructor-published lecture files.</small></div></article>
      </div>
      <div className="rounds-primary-action"><div><small>START QUESTIONS</small><h3>Solve {selected.question_count} published {selected.question_count===1?"question":"questions"}</h3><p>The attempt opens the real question workspace, saves answers to the backend, and shows explanations in Tutor mode.</p></div>
        <button className="pp-button" disabled={starting||selected.question_count<1||Boolean(currentBundle?.read_only)} onClick={()=>void startTutor()}><FiPlayCircle/>{starting?"Preparing…":selected.question_count?"Start "+Math.min(20,selected.question_count)+" questions":"No questions published"}<FiArrowRight/></button>
      </div>
      <div className="rounds-secondary-actions"><Link className="pp-button secondary" href={"/flashcards?bundle="+bundleId+"&lecture="+selected.id}>Review flashcards</Link><Link className="pp-button secondary" href="/notebook/new">Create lecture note</Link></div>
      </>:<Panel title="No lecture selected"><p>Choose a lecture from the week navigator.</p></Panel>}</section>
      <aside className="rounds-context-rail">
        <Panel title="Course coverage"><div className="rounds-coverage-number">{lectureRows.length}<small> lectures</small></div><Progress value={lectureRows.length?100:0}/>
          <dl><div><dt>Questions</dt><dd>{totals.questions}</dd></div><div><dt>Flashcard decks</dt><dd>{totals.decks}</dd></div><div><dt>Resources</dt><dd>{totals.resources}</dd></div></dl>
        </Panel>
        <Panel title={currentBundle?.read_only?"Read-only access":"Entitlement active"}><p>{currentBundle?.read_only?"You may review existing content, but cannot start a new attempt from this bundle.":"Every question on this screen is scoped to the selected bundle and lecture."}</p></Panel>
        <button className="rounds-refresh" onClick={()=>setBundleId(value=>value)}><FiRefreshCw/> Refresh content</button>
      </aside>
    </div>}
  </main></ProductShell>;
}
