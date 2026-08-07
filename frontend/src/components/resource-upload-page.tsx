"use client";

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiBookOpen, FiCheckCircle, FiFile, FiImage, FiRefreshCw, FiTrash2, FiUploadCloud, FiVideo } from "react-icons/fi";
import { apiBaseUrl } from "@/lib/api";
import { useAuth } from "./auth-provider";
import { EmptyState, ErrorState, PageSkeleton } from "./async-state";
import { Panel, ProductShell, Progress } from "./product-shell";
import { useUx } from "./ux-provider";

type ResourceType="PDF"|"IMAGE"|"VIDEO";
type Resource={id:string;resourceName:string;resourceType:ResourceType;uploadStatus:string;fileSize:string|null;mimeType:string|null;description:string|null;originalFilename:string|null};
type Lecture={id:string;lectureNumber:number;title:string;isPublished:boolean;resources?:Resource[]};
type Week={id:string;weekNumber:number;title:string|null;lectures:Lecture[]};
type Course={id:string;courseCode:string;courseName:string;weeks?:Week[]};
type PageResponse<T>={data:T[]};

const maxBytes=52_428_800;
const accept="application/pdf,image/png,image/jpeg,image/webp,video/mp4,video/webm";

function typeFor(file:File):ResourceType|null{
  if(file.type==="application/pdf")return "PDF";
  if(["image/png","image/jpeg","image/webp"].includes(file.type))return "IMAGE";
  if(["video/mp4","video/webm"].includes(file.type))return "VIDEO";
  return null;
}
function sizeLabel(value:number){if(value<1024)return `${value} B`;if(value<1024*1024)return `${(value/1024).toFixed(1)} KB`;return `${(value/1024/1024).toFixed(1)} MB`;}

export function ResourceUploadPage(){
  const {user,request,accessToken}=useAuth();
  const {notify}=useUx();
  const inputRef=useRef<HTMLInputElement>(null);
  const [courses,setCourses]=useState<Course[]>([]),[courseId,setCourseId]=useState(""),[course,setCourse]=useState<Course|null>(null),[lectureId,setLectureId]=useState("");
  const [resources,setResources]=useState<Resource[]>([]),[file,setFile]=useState<File|null>(null),[name,setName]=useState(""),[description,setDescription]=useState("");
  const [dragging,setDragging]=useState(false),[loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[uploading,setUploading]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState<string|null>(null);

  const allowed=user?.role==="INSTRUCTOR"||user?.role==="SYSTEM_ADMIN";
  const lectures=useMemo(()=>course?.weeks?.flatMap(week=>week.lectures.map(lecture=>({...lecture,week})))||[],[course]);
  const selectedLecture=lectures.find(item=>item.id===lectureId)||null;

  const loadCourses=useCallback(async()=>{
    if(!allowed)return;setLoading(true);setError(null);
    try{const rows=await request<PageResponse<Course>>("/academic/courses?limit=100");setCourses(rows.data);if(!courseId&&rows.data[0])setCourseId(rows.data[0].id);}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to load courses.");}
    finally{setLoading(false);}
  },[allowed,courseId,request]);
  useEffect(()=>{void loadCourses();},[loadCourses]);

  useEffect(()=>{if(!courseId)return;let active=true;setDetailLoading(true);setError(null);void request<Course>(`/academic/courses/${courseId}`).then(value=>{if(!active)return;setCourse(value);const first=value.weeks?.flatMap(week=>week.lectures)[0];setLectureId(current=>value.weeks?.some(week=>week.lectures.some(lecture=>lecture.id===current))?current:first?.id||"");}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Unable to load course hierarchy.");}).finally(()=>{if(active)setDetailLoading(false);});return()=>{active=false};},[courseId,request]);

  const loadResources=useCallback(async()=>{if(!lectureId)return;try{setResources(await request<Resource[]>(`/academic/lectures/${lectureId}/resources`));}catch(cause){setError(cause instanceof Error?cause.message:"Unable to load lecture resources.");}},[lectureId,request]);
  useEffect(()=>{void loadResources();},[loadResources]);

  function chooseFile(next:File|null){
    setError(null);setProgress(0);
    if(!next){setFile(null);return;}
    const resourceType=typeFor(next);
    if(!resourceType){setFile(null);setError("Allowed files: PDF, PNG, JPEG, WebP, MP4, and WebM.");return;}
    if(next.size<=0||next.size>maxBytes){setFile(null);setError("The file must be non-empty and no larger than 50 MB.");return;}
    setFile(next);if(!name.trim())setName(next.name.replace(/\.[^.]+$/,"").slice(0,200));
  }
  function drop(event:DragEvent<HTMLDivElement>){event.preventDefault();setDragging(false);chooseFile(event.dataTransfer.files[0]||null);}
  function browse(event:ChangeEvent<HTMLInputElement>){chooseFile(event.target.files?.[0]||null);}

  async function upload(event:FormEvent){
    event.preventDefault();if(!file||!lectureId||!accessToken||uploading)return;
    if(selectedLecture?.isPublished){setError("Return this lecture to draft before uploading or deleting resources.");return;}
    const resourceType=typeFor(file);if(!resourceType)return;
    setUploading(true);setProgress(0);setError(null);
    const body=new FormData();body.set("file",file);body.set("resource_name",name.trim());body.set("resource_type",resourceType);if(description.trim())body.set("description",description.trim());
    try{
      await new Promise<void>((resolve,reject)=>{
        const xhr=new XMLHttpRequest();xhr.open("POST",`${apiBaseUrl}/academic/lectures/${lectureId}/resources/upload`);xhr.setRequestHeader("Authorization",`Bearer ${accessToken}`);
        xhr.upload.onprogress=value=>{if(value.lengthComputable)setProgress(Math.round(value.loaded/value.total*100));};
        xhr.onerror=()=>reject(new Error("Upload connection failed."));
        xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300)resolve();else{try{const payload=JSON.parse(xhr.responseText) as {message?:string|string[]};reject(new Error(Array.isArray(payload.message)?payload.message.join(". "):payload.message||`Upload failed (${xhr.status})`));}catch{reject(new Error(`Upload failed (${xhr.status})`));}}};
        xhr.send(body);
      });
      setProgress(100);setFile(null);setName("");setDescription("");if(inputRef.current)inputRef.current.value="";await loadResources();notify({title:"Resource uploaded",description:"The server verified the file signature and stored it as a managed lecture resource.",tone:"success"});
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to upload resource.");}
    finally{setUploading(false);}
  }

  async function remove(resource:Resource){
    if(selectedLecture?.isPublished)return;
    try{await request(`/academic/resources/${resource.id}`,{method:"DELETE"});await loadResources();notify({title:"Resource deleted",tone:"success"});}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to delete resource.");}
  }

  if(!user||!allowed)return <ProductShell><main className="pp-page"><ErrorState title="Access restricted" description="Resource upload is available to instructors and system administrators."/></main></ProductShell>;
  return <ProductShell search="Search courses and resources"><main className="pp-page resource-upload-page">
    <header className="pp-title hero"><div><small className="page-eyebrow">CONTENT DELIVERY</small><h1>Resource upload</h1><p>Upload verified PDFs, images, and videos into an unpublished lecture, then preview them through the student Study Guides workflow.</p></div><button className="pp-button secondary" onClick={()=>void loadCourses()}><FiRefreshCw/> Refresh</button></header>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {loading?<PageSkeleton variant="workspace" label="Loading resource workspace"/>:<div className="resource-upload-layout">
      <Panel title="Destination"><div className="resource-destination-grid"><label>Course<select value={courseId} onChange={event=>setCourseId(event.target.value)}>{courses.map(item=><option key={item.id} value={item.id}>{item.courseCode} · {item.courseName}</option>)}</select></label><label>Lecture<select value={lectureId} onChange={event=>setLectureId(event.target.value)} disabled={detailLoading}>{lectures.map(item=><option key={item.id} value={item.id}>Week {item.week.weekNumber} · {item.lectureNumber}. {item.title}{item.isPublished?" · published":""}</option>)}</select></label></div>{selectedLecture?.isPublished&&<div className="resource-publish-warning"><FiBookOpen/><div><b>Lecture is published</b><p>Return it to draft in Course Studio before changing resources. This prevents students from seeing a content set mutate underneath an active lecture.</p></div></div>}</Panel>
      <Panel title="Upload managed file"><form onSubmit={upload} className="resource-upload-form"><div className={`resource-dropzone ${dragging?"dragging":""}`} onDragOver={event=>{event.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={drop} onClick={()=>inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={event=>{if(event.key==="Enter"||event.key===" ")inputRef.current?.click()}}><FiUploadCloud/><b>{file?file.name:"Drop a resource here or browse"}</b><small>{file?`${typeFor(file)} · ${sizeLabel(file.size)}`:"PDF · PNG/JPEG/WebP · MP4/WebM · max 50 MB"}</small><input ref={inputRef} hidden type="file" accept={accept} onChange={browse}/></div><div className="resource-upload-fields"><label>Resource name<input required maxLength={200} value={name} onChange={event=>setName(event.target.value)}/></label><label>Description<textarea maxLength={5000} rows={3} value={description} onChange={event=>setDescription(event.target.value)}/></label></div>{(uploading||progress>0)&&<div className="resource-upload-progress"><Progress value={progress}/><span>{progress}% {uploading?"uploading":"uploaded"}</span></div>}<button className="pp-button" disabled={!file||!name.trim()||uploading||Boolean(selectedLecture?.isPublished)}><FiUploadCloud/> {uploading?"Uploading…":"Upload resource"}</button></form></Panel>
      <Panel title={`Lecture resources · ${resources.length}`}><div className="resource-managed-list">{resources.length?resources.map(resource=>{const Icon=resource.resourceType==="IMAGE"?FiImage:resource.resourceType==="VIDEO"?FiVideo:FiFile;return <article key={resource.id}><span><Icon/></span><div><b>{resource.resourceName}</b><small>{resource.resourceType} · {resource.mimeType||"external"} · {resource.fileSize?sizeLabel(Number(resource.fileSize)):"size unavailable"}</small><p>{resource.description||resource.originalFilename||"No description"}</p></div><span className="resource-upload-status"><FiCheckCircle/> {resource.uploadStatus}</span><button className="danger" disabled={Boolean(selectedLecture?.isPublished)} onClick={()=>void remove(resource)} title="Delete resource"><FiTrash2/></button></article>;}):<EmptyState title="No resources in this lecture" description="Upload the first managed file above."/>}</div></Panel>
    </div>}
  </main></ProductShell>;
}
