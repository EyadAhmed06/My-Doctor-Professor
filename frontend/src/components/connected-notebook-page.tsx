"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FiBookOpen, FiEdit3, FiFileText, FiFolder, FiPlus, FiSearch, FiStar, FiTag, FiTrash2 } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { EmptyState, PageSkeleton } from "./async-state";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";

type Collection={id:string;name:string;color:string;isPinned:boolean;notes:unknown[]};
type Tag={id:string;name:string;color:string};
type Note={id:string;title:string;noteType:string;content:string;collectionId:string|null;collection:Collection|null;isFavorite:boolean;tags:Tag[];attachments:unknown[];createdAt:string;updatedAt:string};
type Page<T>={data:T[];total:number};
const types=["ALL","EXPLANATION","PERSONAL","PEARL","IMAGE","LINKED_CASE"] as const;
type NoteFilter=(typeof types)[number];
function validFilter(value:string|null):NoteFilter{return types.includes(value as NoteFilter)?value as NoteFilter:"ALL";}

export function ConnectedNotebookPage(){
 const {request}=useAuth();const {startNavigation}=useUx();const router=useRouter();const pathname=usePathname();const searchParams=useSearchParams();
 const requestedNote=searchParams.get("note");const requestedType=validFilter(searchParams.get("type"));const requestedCollection=searchParams.get("collection")||"ALL";const requestedQuery=searchParams.get("q")||"";
 const [notes,setNotes]=useState<Note[]>([]);const [collections,setCollections]=useState<Collection[]>([]);const [tags,setTags]=useState<Tag[]>([]);const [selected,setSelected]=useState<Note|null>(null);const [filter,setFilter]=useState<NoteFilter>(requestedType);const [collection,setCollection]=useState<string>(requestedCollection);const [query,setQuery]=useState(requestedQuery);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);

 const setUrl=useCallback((updates:{note?:string|null;type?:NoteFilter;collection?:string;q?:string},replace=false)=>{
  const params=new URLSearchParams(searchParams.toString());
  if("note" in updates){if(updates.note)params.set("note",updates.note);else params.delete("note");}
  if(updates.type!==undefined){if(updates.type==="ALL")params.delete("type");else params.set("type",updates.type);}
  if(updates.collection!==undefined){if(updates.collection==="ALL")params.delete("collection");else params.set("collection",updates.collection);}
  if(updates.q!==undefined){if(updates.q.trim())params.set("q",updates.q.trim());else params.delete("q");}
  const suffix=params.toString();const href=suffix?`${pathname}?${suffix}`:pathname;startNavigation();if(replace)router.replace(href,{scroll:false});else router.push(href,{scroll:false});
 },[pathname,router,searchParams,startNavigation]);

 const load=useCallback(async()=>{setLoading(true);setError(null);try{const [noteRows,collectionRows,tagRows]=await Promise.all([request<Page<Note>>("/notebook/notes?limit=100"),request<Collection[]>("/notebook/collections"),request<Tag[]>("/notebook/tags")]);setNotes(noteRows.data);setCollections(collectionRows);setTags(tagRows);}catch(cause){setError(cause instanceof Error?cause.message:"Unable to load notebook.");}finally{setLoading(false)}},[request]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{setFilter(requestedType);setCollection(requestedCollection);setQuery(requestedQuery);},[requestedCollection,requestedQuery,requestedType]);
 useEffect(()=>{
  if(loading)return;
  const target=notes.find(note=>note.id===requestedNote)||notes[0]||null;setSelected(target);
  if(target&&requestedNote!==target.id)setUrl({note:target.id},true);
 },[loading,notes,requestedNote,setUrl]);

 const visible=useMemo(()=>notes.filter(note=>(filter==="ALL"||note.noteType===filter)&&(collection==="ALL"||note.collectionId===collection)&&(!query||`${note.title} ${note.content}`.toLowerCase().includes(query.toLowerCase()))),[notes,filter,collection,query]);
 const count=(type:string)=>type==="ALL"?notes.length:notes.filter(note=>note.noteType===type).length;
 function selectNote(note:Note){setSelected(note);setUrl({note:note.id});}
 function chooseFilter(value:NoteFilter){setFilter(value);setUrl({type:value},true);}
 function chooseCollection(value:string){setCollection(value);setUrl({collection:value},true);}
 function updateQuery(value:string){setQuery(value);window.clearTimeout((updateQuery as unknown as {timer?:number}).timer);(updateQuery as unknown as {timer?:number}).timer=window.setTimeout(()=>setUrl({q:value},true),250);}
 async function remove(id:string){try{await request(`/notebook/notes/${id}`,{method:"DELETE"});await load();setUrl({note:null},true);}catch(cause){setError(cause instanceof Error?cause.message:"Unable to delete note.")}}
 async function createCollection(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;const data=new FormData(form);try{await request("/notebook/collections",{method:"POST",body:{name:String(data.get("name"))}});form.reset();await load()}catch(cause){setError(cause instanceof Error?cause.message:"Unable to create collection.")}}
 async function createTag(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;const data=new FormData(form);try{await request("/notebook/tags",{method:"POST",body:{name:String(data.get("name"))}});form.reset();await load()}catch(cause){setError(cause instanceof Error?cause.message:"Unable to create tag.")}}
 return <ProductShell search="Search notes, pearls, or cases"><main className="pp-page notebook-page notebook-restored restored-page"><header className="workspace-heading"><div><span className="page-eyebrow">PERSONAL KNOWLEDGE WORKSPACE</span><h1>Notebook</h1><p>Organize saved explanations, personal notes, clinical pearls, images, and linked cases.</p></div><div className="notebook-stats"><Metric icon={<FiBookOpen/>} value={notes.length} label="Total notes"/><Metric icon={<FiFileText/>} value={count("EXPLANATION")} label="Explanations"/><Metric icon={<FiFolder/>} value={collections.length} label="Collections"/></div></header>{error&&<p className="form-error" role="alert">{error}</p>}{loading?<PageSkeleton variant="workspace" label="Loading notebook"/>:<div className="notebook-workspace notebook-layout"><aside className="notebook-library notebook-sidebar"><div className="library-title"><b>LIBRARY</b><Link href="/notebook/new"><FiPlus/></Link></div><button className={collection==="ALL"?"active":""} onClick={()=>chooseCollection("ALL")}><span>All collections</span><small>{notes.length}</small></button>{collections.map(item=><button key={item.id} className={collection===item.id?"active":""} onClick={()=>chooseCollection(item.id)}><span><FiFolder/> {item.name}</span><small>{item.notes.length}</small></button>)}<form className="inline-create" onSubmit={createCollection}><input name="name" placeholder="New collection" required/><button><FiPlus/></button></form><b className="library-subtitle">TAGS</b><div className="library-tags">{tags.map(tag=><span key={tag.id}><FiTag/>{tag.name}</span>)}</div><form className="inline-create" onSubmit={createTag}><input name="name" placeholder="New tag" required/><button><FiPlus/></button></form><div className="notebook-search"><FiSearch/><input value={query} onChange={event=>updateQuery(event.target.value)} placeholder="Search notes"/></div></aside><section className="notebook-center"><div className="notebook-toolbar"><div>{types.map(type=><button key={type} className={filter===type?"active":""} onClick={()=>chooseFilter(type)}>{type==="ALL"?`All (${count(type)})`:type.replaceAll("_"," ")}</button>)}</div><Link className="pp-button" href="/notebook/new"><FiPlus/> New note</Link></div>{visible.length?<div className="note-card-grid">{visible.map(note=><button key={note.id} className={`note-library-card ${selected?.id===note.id?"active":""}`} onClick={()=>selectNote(note)}><span className={`note-kind ${note.noteType.toLowerCase()}`}>{note.noteType.replaceAll("_"," ")}</span><h3>{note.title}</h3><p>{note.content}</p><footer><small>{note.collection?.name||"Unfiled"}</small>{note.isFavorite&&<FiStar/>}</footer></button>)}</div>:<EmptyState title="No matching notes" description="Create a note or change the active collection, type, or search filter."/>}</section><aside className="note-inspector">{selected?<><div className="inspector-title"><span className="note-kind">{selected.noteType.replaceAll("_"," ")}</span><h2>{selected.title}</h2><small>Updated {new Date(selected.updatedAt).toLocaleString()}</small></div><div className="inspector-copy">{selected.content}</div><div className="library-tags">{selected.tags.map(tag=><span key={tag.id}><FiTag/>{tag.name}</span>)}</div><div className="inspector-actions"><Link className="pp-button" href={`/notebook/new?note=${selected.id}`}><FiEdit3/> Open full note</Link><button className="pp-button secondary danger" onClick={()=>void remove(selected.id)}><FiTrash2/> Delete</button></div></>:<p>Select a note to inspect it.</p>}</aside></div>}</main></ProductShell>}
function Metric({icon,value,label}:{icon:React.ReactNode;value:number;label:string}){return <div>{icon}<span><b>{value}</b><small>{label}</small></span></div>}
