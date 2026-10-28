"use client";

import { useMemo, useState } from "react";
import type { ReviewCandidate } from "./essay-import-model";

type Mode = "REVIEW" | "MANAGE";
const keyFor = (item:ReviewCandidate) => `${item.section}::${item.case_number}`;

export type EssayReviewPosition = {mode:"REVIEW"|"MANAGE";groupId:string;questionId:string};
export function EssayHybridWorkspace({items, publishedIds, onUpdate, onGroupStem, onGroupApproval, position, onPositionChange}:{
  items:ReviewCandidate[];
  publishedIds:Set<string>;
  onUpdate:(id:string,patch:Partial<ReviewCandidate>)=>void;
  onGroupStem:(group:string,stem:string)=>void;
  onGroupApproval:(group:string,approved:boolean)=>void;
  position?:EssayReviewPosition;
  onPositionChange?:(next:EssayReviewPosition)=>void;
}) {
  const [localMode,setLocalMode]=useState<Mode>("REVIEW");
  const [localGroupId,setLocalGroupId]=useState("");
  const [localQuestionId,setLocalQuestionId]=useState("");
  const mode=position?.mode??localMode;
  const groupId=position?.groupId??localGroupId;
  const questionId=position?.questionId??localQuestionId;
  const setMode=(next:Mode)=>{setLocalMode(next);onPositionChange?.({mode:next,groupId,questionId});};
  const setGroupId=(next:string)=>{const remembered=lastQuestionByGroup[next]??"";setLocalGroupId(next);setLocalQuestionId(remembered);onPositionChange?.({mode,groupId:next,questionId:remembered});};
  const setQuestionId=(next:string)=>{setLocalQuestionId(next);onPositionChange?.({mode,groupId,questionId:next});};
  const [lastQuestionByGroup,setLastQuestionByGroup]=useState<Record<string,string>>({});
  const [query,setQuery]=useState("");
  const [problemOnly,setProblemOnly]=useState(false);
  const [editing,setEditing]=useState(false);
  const [showContextEditor,setShowContextEditor]=useState(false);
  const groups=useMemo(()=>{
    const result=new Map<string,ReviewCandidate[]>();
    for(const item of items){const id=keyFor(item);if(!result.has(id))result.set(id,[]);result.get(id)!.push(item);}
    return [...result.entries()];
  },[items]);
  const activeGroup=groups.find(([id])=>id===groupId) ?? groups[0];
  const groupItems=activeGroup?.[1]??[];
  const active=groupItems.find(item=>item.candidate_id===(questionId||lastQuestionByGroup[activeGroup?.[0]??""])) ?? groupItems[0];
  const currentIndex=active?groupItems.findIndex(item=>item.candidate_id===active.candidate_id):0;
  const allFiltered=useMemo(()=>items.filter(item=>{
    if(problemOnly && item.status==="VALID")return false;
    const text=[item.section,item.question_number,item.question_text,item.model_answer,item.case_stem].join(" ").toLowerCase();
    return text.includes(query.trim().toLowerCase());
  }),[items,problemOnly,query]);
  const byType=(type:"CASE"|"LECTURE")=>groups.filter(([,values])=>(values[0].block_type??"CASE")===type);
  const selectQuestion=(item:ReviewCandidate)=>{setQuestionId(item.candidate_id);setLastQuestionByGroup(prev=>({...prev,[keyFor(item)]:item.candidate_id}));setEditing(false);};
  const open=(item:ReviewCandidate)=>{const id=keyFor(item);setLocalGroupId(id);setLocalQuestionId(item.candidate_id);setLocalMode("REVIEW");setLastQuestionByGroup(prev=>({...prev,[id]:item.candidate_id}));onPositionChange?.({mode:"REVIEW",groupId:id,questionId:item.candidate_id});setEditing(false);};
  const go=(delta:number)=>{const next=groupItems[currentIndex+delta];if(next){selectQuestion(next);}};
  return <div className="essay-v3-workspace">
    <header className="essay-v3-toolbar">
      <div><h2>Review imported questions</h2><p>{items.length} extracted · {items.filter(i=>i.approved).length} selected · {items.filter(i=>i.status==="INVALID").length} invalid</p></div>
      <div className="essay-v3-view-switch" role="group" aria-label="Essay review view">
        <button type="button" aria-pressed={mode==="REVIEW"} onClick={()=>setMode("REVIEW")}>Review</button>
        <button type="button" aria-pressed={mode==="MANAGE"} onClick={()=>setMode("MANAGE")}>Manage all</button>
      </div>
    </header>
    {mode==="REVIEW"?<div className="essay-v3-review">
      <nav className="essay-v3-navigator" aria-label="Essay cases and lectures">
        <h3>Content</h3>
        <label>Jump to section<select value={activeGroup?.[0]??""} onChange={e=>{setGroupId(e.target.value);setEditing(false);}}>
          {groups.map(([id,rows])=><option key={id} value={id}>{rows[0].block_type==="LECTURE"?"Lecture":"Case"} {rows[0].case_number} · {rows.length} Q</option>)}
        </select></label>
        {(["CASE","LECTURE"] as const).map(type=><div key={type}><h4>{type==="CASE"?"Clinical cases":"Lectures"}</h4>
          {byType(type).map(([id,rows])=><button key={id} type="button" className={activeGroup?.[0]===id?"active":""} onClick={()=>{setGroupId(id);setEditing(false);}}>
            <span>{rows[0].section} {type==="CASE"?`· Case ${rows[0].case_number}`:""}</span><small>{rows.length} questions · {rows.filter(i=>i.approved).length} selected</small>
          </button>)}
        </div>)}
        {activeGroup&&<div className="essay-v31-quick-questions"><h4>Questions in this section</h4><div>{groupItems.map(item=><button key={item.candidate_id} type="button" className={active?.candidate_id===item.candidate_id?"active":""} onClick={()=>selectQuestion(item)} aria-current={active?.candidate_id===item.candidate_id?"true":undefined}><span>Q{item.question_number}</span><small>{item.approved?"Included":"Not selected"}{item.status==="INVALID"?" · Invalid":""}</small></button>)}</div></div>}
      </nav>
      <main className="essay-v3-detail">
        {active&&<><section className="essay-v3-context">
          <div className="essay-v3-section-heading"><h3>{active.block_type==="LECTURE"?active.section:`Case ${active.case_number} · ${active.section}`}</h3><button type="button" onClick={()=>setShowContextEditor(v=>!v)}>{showContextEditor?"Done editing":"Edit context"}</button></div>
          <label>{active.block_type==="LECTURE"?"Lecture title":"Clinical case stem"}</label>
          {showContextEditor?<textarea rows={5} value={active.case_stem} onChange={e=>onGroupStem(activeGroup![0],e.target.value)} aria-label="Edit clinical case or lecture context"/>:<p>{active.case_stem||"No clinical context provided in source."}</p>}
        </section>
        <section className="essay-v3-question">
          <div className="essay-v3-section-heading essay-v31-question-heading"><div><strong>Question {active.question_number}</strong><small> {currentIndex+1} of {groupItems.length} · Source p. {active.source_page??"?"} · Answer p. {active.answer_page??"?"}</small></div><div className="essay-v31-heading-actions"><label className="essay-v3-include"><input type="checkbox" checked={active.approved} disabled={active.status==="INVALID"||publishedIds.has(active.candidate_id)} onChange={e=>onUpdate(active.candidate_id,{approved:e.target.checked})}/>Include</label><button type="button" onClick={()=>setEditing(v=>!v)}>{editing?"View":"Edit question"}</button></div></div>
          {editing?<><label>Question text<textarea rows={3} aria-label={`Essay question Q${active.question_number}`} value={active.question_text} onChange={e=>onUpdate(active.candidate_id,{question_text:e.target.value})}/></label><label>Model answer<textarea rows={5} value={active.model_answer??""} onChange={e=>onUpdate(active.candidate_id,{model_answer:e.target.value})}/></label></>:<>
            <div className="essay-v3-prompt">{active.question_text}</div><h4>Model answer</h4><div className="essay-v3-answer">{active.model_answer||"Missing model answer"}</div>
          </>}
          <div className="essay-v3-settings">
            <label>Difficulty<select value={active.difficulty} disabled={publishedIds.has(active.candidate_id)} onChange={e=>onUpdate(active.candidate_id,{difficulty:e.target.value as ReviewCandidate["difficulty"]})}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label>
            <label>Marks<input type="number" min="0.1" max="100" step="any" value={active.marks} disabled={publishedIds.has(active.candidate_id)} onChange={e=>{const n=Number(e.target.value);if(n>0&&n<=100)onUpdate(active.candidate_id,{marks:n});}}/></label>

          </div>
          {active.issues.length>0&&<div role="status" className="essay-v3-issues">{active.issues.map(issue=><p key={issue.code}>{issue.message}</p>)}</div>}
        </section>
        <nav className="essay-v3-question-nav" aria-label="Navigate essay questions">
          <button type="button" disabled={currentIndex===0} onClick={()=>go(-1)}>← Previous</button>
          <label>Go to question<select value={active.candidate_id} onChange={e=>{const row=groupItems.find(x=>x.candidate_id===e.target.value);if(row)selectQuestion(row);}}>{groupItems.map(row=><option key={row.candidate_id} value={row.candidate_id}>Q{row.question_number}</option>)}</select></label>
          <button type="button" disabled={currentIndex>=groupItems.length-1} onClick={()=>go(1)}>Next →</button>
        </nav></>}
      </main>
    </div>:<div className="essay-v3-manager">
      <div className="essay-v3-table-tools"><label>Search questions<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Section, stem, answer…"/></label><label className="essay-v3-include"><input type="checkbox" checked={problemOnly} onChange={e=>setProblemOnly(e.target.checked)}/>Needs attention only</label><span>{allFiltered.length} results</span></div>
      <div className="essay-v3-table-scroll"><table><thead><tr><th scope="col">Use</th><th scope="col">Question</th><th scope="col">Section</th><th scope="col">Status</th><th scope="col">Difficulty</th><th scope="col">Marks</th><th scope="col">Open</th></tr></thead><tbody>{allFiltered.map(item=><tr key={item.candidate_id}>
        <td><input aria-label={`Include Q${item.question_number} from ${item.section}`} type="checkbox" checked={item.approved} disabled={item.status==="INVALID"||publishedIds.has(item.candidate_id)} onChange={e=>onUpdate(item.candidate_id,{approved:e.target.checked})}/></td>
        <td><strong>Q{item.question_number}</strong><span>{item.question_text}</span></td><td>{item.section}</td><td>{item.status==="VALID"?"Ready":item.status==="INVALID"?"Invalid":"Review"}</td>
        <td><select aria-label={`Difficulty Q${item.question_number} ${item.section}`} disabled={publishedIds.has(item.candidate_id)} value={item.difficulty} onChange={e=>onUpdate(item.candidate_id,{difficulty:e.target.value as ReviewCandidate["difficulty"]})}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></td>
        <td><input aria-label={`Marks Q${item.question_number} ${item.section}`} type="number" min="0.1" max="100" step="any" value={item.marks} disabled={publishedIds.has(item.candidate_id)} onChange={e=>{const n=Number(e.target.value);if(n>0&&n<=100)onUpdate(item.candidate_id,{marks:n});}}/></td>
        <td><button type="button" onClick={()=>open(item)}>Review</button></td>
      </tr>)}</tbody></table></div>
    </div>}
    <footer className="essay-v3-footer"><span>{items.filter(i=>i.approved).length} of {items.length} selected</span><button type="button" onClick={()=>{const rows=activeGroup?.[1]??[];if(rows.length)onGroupApproval(activeGroup![0],true);}}>Select ready in current section</button></footer>
  </div>;
}
