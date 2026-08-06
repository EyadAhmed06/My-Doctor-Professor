"use client";

import { useAuth } from "./auth-provider";
import { Panel, ProductShell, Progress } from "./product-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiArrowRight, FiCheck, FiClock, FiFlag, FiSave } from "react-icons/fi";
import { useRouter } from "next/navigation";
import { getQuestionVisual } from "./medical-image-assets";
import "./product-pages.css";

type Option={id:string;optionText:string;displayOrder:number};
type Question={id:string;questionText:string;questionType:"MCQ"|"ESSAY";options:Option[]};
type Assignment={questionId:string;displayOrder:number;question:Question};
type Attempt={id:string;testId:string;testMode:"TUTOR"|"TIMED";status:string;deadline:string|null;test?:{title:string}};
type Answer={questionId:string;selectedOptionId:string|null;isCorrect?:boolean|null};
type WorkspaceState={attempt:Attempt;answers:Answer[];flagged_question_ids:string[];notes:Array<{question_id:string;note:string}>};
type TutorFeedback={isCorrect:boolean|null;explanation?:string|null};
type Review={attempt:Attempt;questions:Array<Assignment&{answer:{selectedOptionId:string|null;isCorrect:boolean|null}|null}>};

export function ConnectedAssessmentSession({attemptId,testId,source="assessments"}:{attemptId:string;testId:string;source?:string}){
 const {request}=useAuth();const router=useRouter();
 const [attempt,setAttempt]=useState<Attempt|null>(null),[items,setItems]=useState<Assignment[]>([]),[index,setIndex]=useState(0);
 const [answers,setAnswers]=useState<Record<string,string>>({}),[flags,setFlags]=useState<string[]>([]);
 const [notes,setNotes]=useState<Record<string,string>>({}),[feedback,setFeedback]=useState<Record<string,TutorFeedback>>({});
 const [review,setReview]=useState<Review|null>(null),[visualOpen,setVisualOpen]=useState(false),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null),[now,setNow]=useState<number|null>(null);
 const autoSubmitStarted=useRef(false);
 useEffect(()=>{if(!attemptId||!testId)return;let active=true;void Promise.all([
  request<WorkspaceState>(`/tests/attempts/${attemptId}/workspace-state`),
  request<Assignment[]>(`/tests/${testId}/questions`)
 ]).then(([state,questions])=>{if(active){setAttempt(state.attempt);setItems(questions);setAnswers(Object.fromEntries(state.answers.filter(item=>item.selectedOptionId).map(item=>[item.questionId,item.selectedOptionId!])));
 setFlags(state.flagged_question_ids);setNotes(Object.fromEntries(state.notes.map(item=>[item.question_id,item.note])));}})
 .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Unable to load this attempt.");}).finally(()=>{if(active)setLoading(false)});
 return()=>{active=false};},[attemptId,testId,request]);
 useEffect(()=>{
  if(!attempt?.deadline){setNow(null);return;}
  setNow(Date.now());
  const timer=window.setInterval(()=>setNow(Date.now()),1000);
  return()=>window.clearInterval(timer);
 },[attempt?.deadline]);
 const current=items[index];const questionVisual=current?getQuestionVisual(current.question.questionText):null;const answered=Object.keys(answers).length;const progress=items.length?Math.round(answered/items.length*100):0;
 const secondsLeft=attempt?.deadline&&now!==null?Math.max(0,Math.floor((new Date(attempt.deadline).getTime()-now)/1000)):null;
 const clock=secondsLeft===null?"Untimed":`${String(Math.floor(secondsLeft/3600)).padStart(2,"0")}:${String(Math.floor(secondsLeft%3600/60)).padStart(2,"0")}:${String(secondsLeft%60).padStart(2,"0")}`;
 const tutor=attempt?.testMode==="TUTOR"||source==="rounds";
 const expired=attempt?.testMode==="TIMED"&&secondsLeft===0;
 async function choose(optionId:string){if(!current||saving||expired)return;setSaving(true);setError(null);try{const result=await request<Answer&TutorFeedback>(`/tests/attempts/${attemptId}/answers/${current.question.id}`,{method:"PUT",body:{selected_option_id:optionId}});setAnswers(value=>({...value,[current.question.id]:optionId}));if(tutor)setFeedback(value=>({...value,[current.question.id]:{isCorrect:result.isCorrect??null,explanation:result.explanation}}));}catch(cause){setError(cause instanceof Error?cause.message:"Unable to save this answer.");}finally{setSaving(false);}}
 async function toggleFlag(){if(!current||expired)return;const active=flags.includes(current.question.id);try{await request(`/tests/attempts/${attemptId}/flags/${current.question.id}`,{method:active?"DELETE":"POST"});setFlags(value=>active?value.filter(id=>id!==current.question.id):[...value,current.question.id]);}catch(cause){setError(cause instanceof Error?cause.message:"Unable to update the flag.");}}
 async function saveNote(){if(!current||expired)return;const value=notes[current.question.id]?.trim()||"";try{if(value)await request(`/tests/attempts/${attemptId}/notes/${current.question.id}`,{method:"PUT",body:{note:value}});else if(notes[current.question.id]!==undefined)await request(`/tests/attempts/${attemptId}/notes/${current.question.id}`,{method:"DELETE"});}catch(cause){setError(cause instanceof Error?cause.message:"Unable to save the note.");}}
 const finalize=useCallback(async(auto=false)=>{
  if(!auto&&!confirm(`Submit this assessment with ${answered} of ${items.length} questions answered?`))return;
  setSaving(true);setError(null);
  try{
   await request(`/tests/attempts/${attemptId}/submit`,{method:"POST"});
   setReview(await request<Review>(`/tests/attempts/${attemptId}/review`));
  }catch(cause){
   if(auto){
    try{setReview(await request<Review>(`/tests/attempts/${attemptId}/review`));return;}catch{
     // The server may still be finalizing; keep the attempt locked and allow a manual retry.
    }
   }
   setError(cause instanceof Error?cause.message:"Unable to submit the assessment.");
  }finally{setSaving(false);}
 },[answered,attemptId,items.length,request]);
 useEffect(()=>{
  if(!expired||review||autoSubmitStarted.current)return;
  autoSubmitStarted.current=true;
  void finalize(true);
 },[expired,finalize,review]);
 const exitPath=source==="rounds"?"/rounds":"/past-exams";
 if(!attemptId||!testId)return <ProductShell><div className="product-auth-loading">Missing attempt information. Return to Questions &amp; Assessments and generate a quiz.</div></ProductShell>;
 return <ProductShell><main className={`pp-page mock-page ${tutor?"tutor-workspace":""}`}>{error&&<p className="form-error" role="alert">{error}</p>}{expired&&!review&&<p className="form-success" role="status">Time expired. Answers are locked while the server finalizes this assessment.</p>}{loading?<div className="product-auth-loading">Loading assessment…</div>:review?<Panel title="Assessment submitted"><h2>{review.attempt.test?.title||"Assessment complete"}</h2><p>Your answers and explanations are available below.</p>{review.questions.map((item,i)=><article className="review-answer" key={item.question.id}><b>{i+1}. {item.question.questionText}</b><p>{item.answer?.isCorrect===true?"Correct":item.answer?.isCorrect===false?"Incorrect":"Not answered / pending grading"}</p></article>)}<button className="pp-button" onClick={()=>router.push(exitPath)}>Back</button></Panel>:current?<>
 <Panel className="exam-strip"><button onClick={()=>router.push(exitPath)}><FiArrowLeft/> Exit {tutor?"round":"exam"}</button><div><small>{tutor?"Tutor round":"Assessment"}</small><b>{attempt?.test?.title||"Custom Practice"}</b></div><div><small>Mode</small><b>{attempt?.testMode}</b></div>{attempt?.testMode==="TIMED"&&<div><small>Time remaining</small><b><FiClock/> {clock}</b></div>}<div><small>Progress</small><b>{answered} / {items.length} · {progress}%</b><Progress value={progress}/></div></Panel>
 <div className="mock-layout"><Panel title={tutor?"Lecture questions":"Question Navigator"} className="navigator"><div className="number-grid">{items.map((item,i)=><button className={i===index?"current":flags.includes(item.question.id)?"flagged":answers[item.question.id]?"done":""} onClick={()=>setIndex(i)} key={item.question.id}>{i+1}</button>)}</div></Panel>
 <Panel className="question-card"><div className="question-tools"><span className="pp-chip">{expired?"Time expired":tutor?"Tutor mode":"Exam question"}</span><button disabled={expired} onClick={()=>void toggleFlag()}><FiFlag/> {flags.includes(current.question.id)?"Unflag":"Flag"}</button></div>{questionVisual&&<><button type="button" className={`question-visual question-visual--${questionVisual.specialty}`} onClick={()=>setVisualOpen(true)} aria-label={`Open larger ${questionVisual.specialty} illustration`}><img src={questionVisual.src} alt={questionVisual.alt}/><span>{questionVisual.specialty} · open image</span></button>{visualOpen&&<div className="question-visual-modal" role="dialog" aria-modal="true" aria-label={questionVisual.alt} onClick={()=>setVisualOpen(false)}><button type="button" aria-label="Close image" onClick={()=>setVisualOpen(false)}>×</button><img src={questionVisual.src} alt={questionVisual.alt}/></div>}</>}<h2>{current.question.questionText}</h2><div className="answer-list">{current.question.options.map((option,i)=>{const selected=answers[current.question.id]===option.id;return <button disabled={saving||expired||Boolean(tutor&&feedback[current.question.id])} className={selected?"selected":""} onClick={()=>void choose(option.id)} key={option.id}><b>{String.fromCharCode(65+i)}</b>{option.optionText}{selected&&<FiCheck/>}</button>})}</div>
 {tutor&&feedback[current.question.id]&&<div className={`tutor-explanation ${feedback[current.question.id].isCorrect?"correct":"incorrect"}`}><b>{feedback[current.question.id].isCorrect?"Correct answer":"Review this answer"}</b><p>{feedback[current.question.id].explanation||"No explanation has been published for this question."}</p></div>}
 <Panel title="Private question note"><textarea disabled={expired} value={notes[current.question.id]||""} onChange={event=>setNotes(value=>({...value,[current.question.id]:event.target.value}))} placeholder="Save a private note for this question…"/><button className="pp-button secondary" disabled={expired} onClick={()=>void saveNote()}><FiSave/> Save note</button></Panel></Panel>
 <Panel title={tutor?"Round progress":"Exam Overview"} className="exam-overview"><p>Answered <b>{answered}/{items.length}</b></p><p>Flagged <b>{flags.length}</b></p><Progress value={progress}/><button className="pp-button" disabled={saving} onClick={()=>void finalize(Boolean(expired))}>{expired?(saving?"Submitting…":"Retry submission"):`Finish ${tutor?"round":"assessment"}`}</button></Panel></div>
 <footer className="mock-footer"><button disabled={index===0} className="pp-button secondary" onClick={()=>setIndex(i=>i-1)}>Previous</button><b>Question {index+1} of {items.length}</b><button disabled={index===items.length-1} className="pp-button" onClick={()=>setIndex(i=>i+1)}>Next <FiArrowRight/></button></footer></>:<Panel title="No questions"><p>This assessment contains no accessible questions.</p></Panel>}</main></ProductShell>;
}