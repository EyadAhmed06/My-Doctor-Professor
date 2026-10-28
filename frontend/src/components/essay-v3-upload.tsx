"use client";
import type { FormEvent } from "react";
import { FiFileText, FiUploadCloud } from "react-icons/fi";

type Course={id:string;courseCode:string;courseName:string};
export function EssayV3Upload({courses,courseId,onCourse,fileName,onFile,standaloneType,onType,rights,onRights,inspecting,onInspect}:{
courses:Course[];courseId:string;onCourse:(id:string)=>void;fileName:string|null;onFile:(file:File|null)=>void;
standaloneType:"CASE"|"LECTURE";onType:(type:"CASE"|"LECTURE")=>void;
rights:boolean;onRights:(value:boolean)=>void;inspecting:boolean;onInspect:(event:FormEvent<HTMLFormElement>)=>void;
}){
return <section className="essay-v3-upload" aria-label="Upload essay content">
  <header className="essay-v3-step-head"><div><h2>Import essay content</h2><p>Upload a source, inspect its clinical cases and lectures, then review every question before anything is published.</p></div></header>
  <form onSubmit={onInspect} className="essay-v3-upload-form">
    <div className="essay-v3-file-drop">
      <FiUploadCloud aria-hidden="true" size={30}/>
      <label htmlFor="essay-v3-file"><strong>Select your essay PDF, JSON, or text file</strong><span>PDFs need selectable text · Maximum 50 MB PDF / 2 MB JSON</span></label>
      <input id="essay-v3-file" type="file" accept="application/pdf,.pdf,application/json,.json,.txt" onChange={e=>onFile(e.target.files?.[0]??null)}/>
      {fileName&&<p className="essay-v3-selected-file"><FiFileText aria-hidden="true"/> {fileName}</p>}
    </div>
    <div className="essay-v3-upload-options">
      <label>Destination course <span>(optional now)</span><select value={courseId} onChange={e=>onCourse(e.target.value)}><option value="">Choose after reviewing</option>{courses.map(c=><option key={c.id} value={c.id}>{c.courseCode} · {c.courseName}</option>)}</select></label>
      <label>File without a Case/Lecture heading<select aria-label="Standalone essay content type" value={standaloneType} onChange={e=>onType(e.target.value as "CASE"|"LECTURE")}><option value="LECTURE">Treat as a lecture or section</option><option value="CASE">Treat as a clinical case</option></select></label>
    </div>
    <div className="essay-v3-upload-notes"><strong>What happens next?</strong><p>We detect cases, lectures, numbered questions, and source answers. You can correct the results, assign topics or weeks, and choose what to publish. The original source is never published automatically.</p></div>
    <label className="essay-v3-include"><input type="checkbox" checked={rights} onChange={e=>onRights(e.target.checked)}/><span>I confirm I have permission to use and publish this material.</span></label>
    <div className="essay-v3-upload-footer"><span>{inspecting?"Extracting and checking source content…":"Nothing becomes visible to students until you publish."}</span><button type="submit" disabled={inspecting||!fileName||!rights}>{inspecting?"Inspecting essay file…":"Inspect essay file →"}</button></div>
  </form>
</section>;
}
