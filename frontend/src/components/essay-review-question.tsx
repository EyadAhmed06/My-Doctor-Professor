"use client";

import { memo } from "react";
import { FiCheck } from "react-icons/fi";
import type { ReviewCandidate } from "./essay-import-model";

export const EssayReviewQuestion = memo(function EssayReviewQuestion({
  item, published, onUpdate,
}: {
  item: ReviewCandidate;
  published: boolean;
  onUpdate: (candidateId:string, patch:Partial<ReviewCandidate>) => void;
}) {
  return <article className={`essay-import-question ${item.status.toLowerCase()}`}>
    <header>
      <label>
        <input type="checkbox" checked={item.approved} disabled={published || item.status==="INVALID"}
          onChange={event=>onUpdate(item.candidate_id,{approved:event.target.checked})}/>
        <FiCheck/> Q{item.question_number}
      </label>
      <small>
        {published?"Published · ":""}
        Question page {item.source_page??"?"} · Answer page {item.answer_page??"?"} ·
        {item.answer_origin==="SOURCE"?" Source answer":item.answer_origin==="MANUAL"?" Edited answer":" Answer not mapped"}
      </small>
    </header>
    <label>Essay question
      <textarea aria-label={`Essay question Q${item.question_number}`} disabled={published}
        value={item.question_text} onChange={event=>onUpdate(item.candidate_id,{question_text:event.target.value})}/>
    </label>
    <div className="essay-v2-question-options" aria-label="Question settings">
      <label>Difficulty
        <select aria-label={`Difficulty Q${item.question_number}`} value={item.difficulty} disabled={published}
          onChange={event=>onUpdate(item.candidate_id,{difficulty:event.target.value as ReviewCandidate["difficulty"]})}>
          <option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option>
        </select>
      </label>
      <label>Marks
        <input aria-label={`Marks Q${item.question_number}`} type="number" inputMode="decimal" min="0.5" max="100" step="0.5" disabled={published} value={item.marks}
          onChange={event=>{const value=Number(event.target.value);if(Number.isFinite(value)&&value>0&&value<=100)onUpdate(item.candidate_id,{marks:value});}}/>
      </label>
    </div>
    <label>Model answer
      <textarea disabled={published} value={item.model_answer||""}
        onChange={event=>onUpdate(item.candidate_id,{model_answer:event.target.value})}/>
    </label>
    {item.issues.map(issue=><p className="form-error" key={issue.code}>{issue.message}</p>)}
  </article>;
});
