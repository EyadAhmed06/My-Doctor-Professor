"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FiAlertCircle,
  FiBookOpen,
  FiCheck,
  FiCheckSquare,
  FiCloud,
  FiEdit3,
  FiFileText,
  FiImage,
  FiLink,
  FiRefreshCw,
  FiSave,
  FiStar,
} from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import "./product-pages.css";

const noteTypes=[
  {value:"EXPLANATION",label:"Explanation",icon:<FiFileText/>},
  {value:"PERSONAL",label:"Personal note",icon:<FiEdit3/>},
  {value:"PEARL",label:"Clinical pearl",icon:<FiStar/>},
  {value:"IMAGE",label:"Image note",icon:<FiImage/>},
  {value:"LINKED_CASE",label:"Linked case",icon:<FiLink/>},
];

type Collection={id:string;name:string};
type Tag={id:string;name:string};
type Note={
  id:string;
  title:string;
  noteType:string;
  content:string;
  collectionId:string|null;
  isFavorite:boolean;
  reviewAt:string|null;
  tags:Tag[];
  updatedAt?:string;
};
type SaveState="idle"|"dirty"|"saving"|"saved"|"error";
type Draft={
  title:string;
  type:string;
  content:string;
  collectionId:string;
  tagIds:string[];
  favorite:boolean;
  reviewAt:string;
  savedAt:number;
};

export function ConnectedNoteEditorPage(){
  const {user,request}=useAuth();
  const router=useRouter();
  const params=useSearchParams();
  const routeNoteId=params.get("note");
  const [activeNoteId,setActiveNoteId]=useState<string|null>(routeNoteId);
  const [title,setTitle]=useState("");
  const [type,setType]=useState("PERSONAL");
  const [content,setContent]=useState("");
  const [collectionId,setCollectionId]=useState("");
  const [tagIds,setTagIds]=useState<string[]>([]);
  const [favorite,setFavorite]=useState(false);
  const [reviewAt,setReviewAt]=useState("");
  const [collections,setCollections]=useState<Collection[]>([]);
  const [tags,setTags]=useState<Tag[]>([]);
  const [hydrated,setHydrated]=useState(false);
  const [saveState,setSaveState]=useState<SaveState>("idle");
  const [lastSavedAt,setLastSavedAt]=useState<number|null>(null);
  const [recovery,setRecovery]=useState<Draft|null>(null);
  const [error,setError]=useState<string|null>(null);
  const lastSavedSignature=useRef("");
  const saveInFlight=useRef(false);
  const pendingSave=useRef<"save"|"close"|null>(null);
  const persistRef=useRef<((closeAfter?:boolean)=>Promise<void>)|null>(null);

  const payload=useMemo(()=>({
    title,
    note_type:type,
    content,
    collection_id:collectionId||null,
    is_favorite:favorite,
    review_at:reviewAt?new Date(reviewAt).toISOString():null,
    tag_ids:tagIds,
  }),[title,type,content,collectionId,favorite,reviewAt,tagIds]);
  const signature=useMemo(()=>JSON.stringify(payload),[payload]);
  const draftKey=useMemo(()=>`mdp-note-draft:${user?.id||"anonymous"}:${activeNoteId||"new"}`,[user?.id,activeNoteId]);

  useEffect(()=>{
    let active=true;
    setHydrated(false);
    void Promise.all([
      request<Collection[]>("/notebook/collections"),
      request<Tag[]>("/notebook/tags"),
      routeNoteId?request<Note>(`/notebook/notes/${routeNoteId}`):Promise.resolve(null),
    ]).then(([collectionRows,tagRows,note])=>{
      if(!active)return;
      setCollections(collectionRows);
      setTags(tagRows);
      if(note){
        setActiveNoteId(note.id);
        setTitle(note.title);
        setType(note.noteType);
        setContent(note.content);
        setCollectionId(note.collectionId||"");
        setFavorite(note.isFavorite);
        setReviewAt(note.reviewAt?.slice(0,16)||"");
        setTagIds(note.tags.map(tag=>tag.id));
        const serverSignature=JSON.stringify({
          title:note.title,
          note_type:note.noteType,
          content:note.content,
          collection_id:note.collectionId||null,
          is_favorite:note.isFavorite,
          review_at:note.reviewAt?new Date(note.reviewAt).toISOString():null,
          tag_ids:note.tags.map(tag=>tag.id),
        });
        lastSavedSignature.current=serverSignature;
      }else{
        lastSavedSignature.current=JSON.stringify({
          title:"",note_type:"PERSONAL",content:"",collection_id:null,
          is_favorite:false,review_at:null,tag_ids:[],
        });
      }
      try{
        const key=`mdp-note-draft:${user?.id||"anonymous"}:${note?.id||"new"}`;
        const raw=localStorage.getItem(key);
        if(raw){
          const draft=JSON.parse(raw) as Draft;
          const serverTime=note?.updatedAt?new Date(note.updatedAt).getTime():0;
          if(draft.savedAt>serverTime&&(draft.title||draft.content))setRecovery(draft);
        }
      }catch{
        // A corrupt browser draft must not block the editor.
      }
      setSaveState("idle");
      setHydrated(true);
    }).catch(cause=>{
      if(active){
        setError(cause instanceof Error?cause.message:"Unable to load editor.");
        setSaveState("error");
      }
    });
    return()=>{active=false};
  },[request,routeNoteId,user?.id]);

  const persist=useCallback(async(closeAfter=false)=>{
    if(!hydrated||!title.trim()||!content.trim())return;
    if(saveInFlight.current){
      pendingSave.current=closeAfter?"close":"save";
      return;
    }
    saveInFlight.current=true;
    setSaveState("saving");
    setError(null);
    const currentSignature=signature;
    const previousKey=draftKey;
    try{
      const saved=await request<Note>(activeNoteId?`/notebook/notes/${activeNoteId}`:"/notebook/notes",{
        method:activeNoteId?"PUT":"POST",
        body:payload,
      });
      if(!activeNoteId){
        setActiveNoteId(saved.id);
        window.history.replaceState(null,"",`/notebook/new?note=${saved.id}`);
      }
      lastSavedSignature.current=currentSignature;
      setLastSavedAt(Date.now());
      setSaveState("saved");
      try{localStorage.removeItem(previousKey);}catch{}
      if(closeAfter)router.push("/notebook");
    }catch(cause){
      setError(cause instanceof Error?cause.message:"Unable to autosave this note.");
      setSaveState("error");
    }finally{
      saveInFlight.current=false;
      const queued=pendingSave.current;
      pendingSave.current=null;
      if(queued)window.setTimeout(()=>void persistRef.current?.(queued==="close"),0);
    }
  },[activeNoteId,draftKey,hydrated,payload,request,router,signature,title,content]);

  useEffect(()=>{persistRef.current=persist;},[persist]);

  useEffect(()=>{
    if(!hydrated||signature===lastSavedSignature.current)return;
    setSaveState(current=>current==="saving"?current:"dirty");
    const draft:Draft={title,type,content,collectionId,tagIds,favorite,reviewAt,savedAt:Date.now()};
    try{localStorage.setItem(draftKey,JSON.stringify(draft));}catch{}
    if(!title.trim()||!content.trim())return;
    const timer=window.setTimeout(()=>void persist(false),1200);
    return()=>window.clearTimeout(timer);
  },[hydrated,signature,title,type,content,collectionId,tagIds,favorite,reviewAt,draftKey,persist]);

  useEffect(()=>{
    function warnBeforeUnload(event:BeforeUnloadEvent){
      if(saveState!=="dirty"&&saveState!=="saving"&&saveState!=="error")return;
      event.preventDefault();
      event.returnValue="";
    }
    window.addEventListener("beforeunload",warnBeforeUnload);
    return()=>window.removeEventListener("beforeunload",warnBeforeUnload);
  },[saveState]);

  async function submit(event:FormEvent){
    event.preventDefault();
    await persist(true);
  }

  function restoreDraft(){
    if(!recovery)return;
    setTitle(recovery.title);
    setType(recovery.type);
    setContent(recovery.content);
    setCollectionId(recovery.collectionId);
    setTagIds(recovery.tagIds);
    setFavorite(recovery.favorite);
    setReviewAt(recovery.reviewAt);
    setRecovery(null);
  }

  function discardDraft(){
    try{localStorage.removeItem(draftKey);}catch{}
    setRecovery(null);
  }

  const score=Math.min(100,(title?30:0)+(collectionId?15:0)+(tagIds.length?15:0)+Math.round(Math.min(content.length,800)/20));
  const statusCopy=saveState==="saving"?"Saving…":saveState==="saved"?"Saved":saveState==="dirty"?"Unsaved changes":saveState==="error"?"Save failed":"Ready";
  const StatusIcon=saveState==="saving"?FiRefreshCw:saveState==="saved"?FiCheck:saveState==="error"?FiAlertCircle:FiCloud;

  return <ProductShell search="Search notes, pearls, or cases"><main className="pp-page note-editor-page restored-page"><header className="workspace-heading"><div><span className="page-eyebrow">STRUCTURED KNOWLEDGE CAPTURE</span><h1>{activeNoteId?"Edit Note":"New Note"}</h1><p>Capture explanations, pearls, images, and linked learning in one searchable workspace.</p></div><div className="editor-status autosave-status" data-state={saveState}><StatusIcon/><span><b>{statusCopy}</b><small>{lastSavedAt?`Last saved ${new Date(lastSavedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`:saveState==="dirty"?"Local recovery copy stored":"Private notebook"}</small></span></div></header>{error&&<p className="form-error autosave-error">{error}</p>}{recovery&&<div className="autosave-recovery"><span>A newer browser draft was found for this note.</span><div><button className="pp-button secondary" type="button" onClick={discardDraft}>Discard</button><button className="pp-button" type="button" onClick={restoreDraft}>Restore draft</button></div></div>}<form className="note-editor-layout" onSubmit={submit}><aside className="note-setup"><b>NOTE SETUP</b>{noteTypes.map(item=><button type="button" className={type===item.value?"active":""} onClick={()=>setType(item.value)} key={item.value}>{item.icon}{item.label}</button>)}<label>Collection<select value={collectionId} onChange={event=>setCollectionId(event.target.value)}><option value="">Unfiled</option>{collections.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Review reminder<input type="datetime-local" value={reviewAt} onChange={event=>setReviewAt(event.target.value)}/></label><label className="check-row"><input type="checkbox" checked={favorite} onChange={event=>setFavorite(event.target.checked)}/> Favorite</label><button className="pp-button" disabled={saveState==="saving"||!title.trim()||!content.trim()}><FiSave/> {saveState==="saving"?"Saving…":"Save & close"}</button><small>Changes autosave after you pause typing.</small></aside><section className="note-canvas"><input className="note-title-input" value={title} onChange={event=>setTitle(event.target.value)} placeholder="Enter note title…" maxLength={200} required/><div className="editor-toolbar"><b>H₁</b><b>H₂</b><b>B</b><i>I</i><FiCheckSquare/><FiImage/><FiLink/></div><div className={`structured-block ${type.toLowerCase()}`}><span>{noteTypes.find(item=>item.value===type)?.icon}<b>{noteTypes.find(item=>item.value===type)?.label}</b></span><textarea value={content} onChange={event=>setContent(event.target.value)} placeholder="Write your note here…" maxLength={50000} required/></div></section><aside className="editor-insights"><Panel title="Note structure"><div className="readiness-ring">{score}<small>%</small></div><p>{score>70?"Strong structure. Your work will save automatically.":"Add a collection, tags, and enough context to make this useful later."}</p></Panel><Panel title="Tags"><div className="tag-picker">{tags.length?tags.map(tag=><button type="button" className={tagIds.includes(tag.id)?"active":""} onClick={()=>setTagIds(current=>current.includes(tag.id)?current.filter(id=>id!==tag.id):[...current,tag.id])} key={tag.id}>{tag.name}</button>):<p>Create tags from the Notebook library.</p>}</div></Panel><Panel title="Linked resources"><p><FiBookOpen/> Question and lecture links are stored by the API and can be attached from their source screens.</p></Panel></aside></form></main></ProductShell>;
}
