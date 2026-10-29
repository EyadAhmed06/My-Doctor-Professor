"use client";
import type { ReviewCandidate } from "./essay-import-model";
type Destination="QUESTION_BANK"|"CASE_STUDIO";
type GroupDestination=Destination|"BOTH"|"SKIP";
type Row={label:string;count:number;missingTopic:number;invalid:number;topicLabel:string};
export function EssayV3Publish({items,groupDestinations,destination,onDestination,allowedCaseStudio,readyCount,unassignedCount,invalidCount,rows,caseGroups,validCaseGroups,publishedIds,progress,busy,onPublishQuestions,onCreateCases,onPublishCases,onBack,onReturnToReview}:{
items:ReviewCandidate[];groupDestinations:Record<string,GroupDestination>;destination:Destination;onDestination:(value:Destination)=>void;allowedCaseStudio:boolean;
readyCount:number;unassignedCount:number;invalidCount:number;rows:Row[];caseGroups:number;validCaseGroups:number;publishedIds:Set<string>;
progress:{done:number;total:number}|null;busy:boolean;onPublishQuestions:()=>void;onCreateCases:()=>void;onPublishCases:()=>void;onBack:()=>void;onReturnToReview:()=>void;
}){
const assigned=(q:ReviewCandidate)=>groupDestinations[`${q.section}::${q.case_number}`]||"QUESTION_BANK";
const bankSelected=items.filter(q=>q.approved&&!publishedIds.has(q.candidate_id)&&["QUESTION_BANK","BOTH"].includes(assigned(q)));
const studioSelected=items.filter(q=>q.approved&&["CASE_STUDIO","BOTH"].includes(assigned(q)));
const selected=destination==="QUESTION_BANK"?bankSelected:studioSelected;
const alreadyPublished=items.filter(q=>publishedIds.has(q.candidate_id)).length;
const missingAnswer=selected.filter(q=>!q.model_answer?.trim()).length;
const noSelection=selected.length===0;
const bankBlocked=unassignedCount>0||invalidCount>0||missingAnswer>0;
return <section className="essay-v3-publication" aria-label="Publication review">
  <header className="essay-v3-step-head"><div><h2>Ready to publish?</h2><p>Check the destination and resolve any blockers before making content available.</p></div><strong>{destination==="QUESTION_BANK"?`${readyCount} publishable`:`${validCaseGroups} eligible practice sets`}</strong></header>
  <div className="essay-v3-publish-metrics"><div><b>{items.length}</b><span>Extracted</span></div><div><b>{selected.length}</b><span>Selected, unpublished</span></div><div><b>{alreadyPublished}</b><span>Already processed</span></div><div><b>{missingAnswer}</b><span>Missing answers</span></div></div>
  <p className="essay-v3-instruction">{bankSelected.length} essay questions routed to Question Bank · {studioSelected.length} questions routed to Studio. Change the routing per section in Organize.</p>
  <div className="essay-v3-destination-switch" role="group" aria-label="Publishing destination">
    <button type="button" aria-pressed={destination==="QUESTION_BANK"} onClick={()=>onDestination("QUESTION_BANK")} disabled={busy}>Question Bank</button>
    {allowedCaseStudio&&<button type="button" aria-pressed={destination==="CASE_STUDIO"} onClick={()=>onDestination("CASE_STUDIO")} disabled={busy}>Case Studio</button>}
  </div>
  <p className="essay-v3-instruction">{destination==="QUESTION_BANK"?"Individual essay questions are published into their assigned lecture topics.":"Cases and lecture practice sets are saved under their assigned course weeks. Only sections routed to Studio are included."}</p>
  {destination==="QUESTION_BANK"?<>
    <div className="essay-v3-readiness" role="status">
      {noSelection?<p><strong>No questions selected.</strong> Return to Review or Manage and include the questions you want.</p>:bankBlocked?<p><strong>Publication is blocked:</strong> {unassignedCount} selected questions need destination topics, {invalidCount} have validation errors, and {missingAnswer} lack model answers. Fix these before publishing.</p>:<p><strong>All selected questions meet the publication checks.</strong> The final server validation still applies.</p>}
    </div>
    <div className="essay-v3-organization-table"><table><thead><tr><th scope="col">Source section</th><th scope="col">Selected</th><th scope="col">Topic</th><th scope="col">Issues</th></tr></thead><tbody>{rows.map((row,i)=><tr key={i}><td>{row.label}</td><td>{row.count}</td><td>{row.topicLabel}</td><td>{row.missingTopic||row.invalid?`${row.missingTopic} unassigned · ${row.invalid} invalid`:"Ready"}</td></tr>)}</tbody></table></div>
    {progress&&<div className="essay-v3-publish-progress" role="status"><label>Publishing {progress.done} of {progress.total} questions</label><progress value={progress.done} max={progress.total}/></div>}
    <div className="essay-v3-publish-actions"><button type="button" disabled={busy||noSelection||bankBlocked||readyCount!==selected.length} onClick={onPublishQuestions}>{busy?"Publishing…":`Publish ${readyCount} questions to Question Bank`}</button></div>
  </>:<>
    <div className="essay-v3-readiness" role="status"><p>{validCaseGroups} of {caseGroups} Studio sections have a valid week assignment and answers. Other sections will not be submitted.</p></div>
    <div className="essay-v3-publish-actions"><button type="button" disabled={busy||!validCaseGroups} onClick={onCreateCases}>{busy?"Processing…":`Create ${validCaseGroups} draft practice sets`}</button><button type="button" disabled={busy||!validCaseGroups} onClick={onPublishCases}>{busy?"Processing…":`Publish ${validCaseGroups} practice sets to students`}</button></div>
  </>}

</section>;
}
