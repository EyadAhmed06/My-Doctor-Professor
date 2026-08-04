"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FiBookOpen, FiEdit3, FiFileText, FiPlus, FiSearch, FiStar, FiTrash2 } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import "./product-pages.css";

type Note={id:string;title:string;noteType:string;content:string;metadata:Record<string,unknown>;createdAt:string;updatedAt:string};
type Page<T>={data:T[];total:number};
const types=["ALL","EXPLANATION","PERSONAL","PEARL","IMAGE","LINKED_CASE"] as const;

export function ConnectedNotebookPage(){
 const {request}=useAuth();const [notes,setNotes]=useState<Note[]>([]);const [selected,setSelected]=useState<Note|null>(null);const [filter,setFilter]=useState<(typeof types)[number]>("ALL");const [query,setQuery]=useState("");const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);
 useEffect(()=>{let active=true;void request<Page<Note>>("/notebook/notes?limit=100").then(result=>{if(active){setNotes(result.data);setSelected(result.data[0]||null)}}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Unable to load notebook.")}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[request]);
 const visible=useMemo(()=>notes.filter(note=>(filter==="ALL"||note.noteType===filter)&&(!query||`${note.title} ${note.content}`.toLowerCase().includes(query.toLowerCase()))),[notes,filter,query]);
 const count=(type:string)=>type==="ALL"?notes.length:notes.filter(note=>note.noteType===type).length;
 async function remove(id:string){try{await request(`/notebook/notes/${id}`,{method:"DELETE"});const next=notes.filter(note=>note.id!==id);setNotes(next);setSelected(current=>current?.id===id?next[0]||null:current)}catch(cause){setError(cause instanceof Error?cause.message:"Unable to delete note.")}}
 return <ProductShell search="Search notes, pearls, or cases"><main className="pp-page notebook-page restored-page">
  <header className="workspace-heading"><div><span className="page-eyebrow">PERSONAL KNOWLEDGE WORKSPACE</span><h1>Notebook</h1><p>Organize saved explanations, personal notes, clinical pearls, images, and linked cases.</p></div><div className="notebook-stats"><Metric icon={<FiBookOpen/>} value={notes.length} label="Total notes"/><Metric icon={<FiFileText/>} value={count("EXPLANATION")} label="Explanations"/><Metric icon={<FiStar/>} value={count("PEARL")} label="Clinical pearls"/></div></header>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {loading?<div className="product-auth-loading">Loading notebook…</div>:<div className="notebook-workspace">
   <aside className="notebook-library"><div className="library-title"><b>LIBRARY</b><Link href="/notebook/new" aria-label="New note"><FiPlus/></Link></div>{types.map(type=><button key={type} className={filter===type?"active":""} onClick={()=>setFilter(type)}><span>{type==="ALL"?"All notes":type.replaceAll("_"," ")}</span><small>{count(type)}</small></button>)}<div className="notebook-search"><FiSearch/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search notes"/></div><Link className="pp-button" href="/notebook/new"><FiPlus/> New note</Link></aside>
   <section className="notebook-center"><div className="notebook-toolbar"><div>{types.slice(0,5).map(type=><button key={type} className={filter===type?"active":""} onClick={()=>setFilter(type)}>{type==="ALL"?`All (${count(type)})`:type.replaceAll("_"," ")}</button>)}</div><Link className="pp-button" href="/notebook/new"><FiPlus/> New note</Link></div>{visible.length?<div className="note-card-grid">{visible.map(note=><button key={note.id} className={`note-library-card ${selected?.id===note.id?"active":""}`} onClick={()=>setSelected(note)}><span className={`note-kind ${note.noteType.toLowerCase()}`}>{note.noteType.replaceAll("_"," ")}</span><h3>{note.title}</h3><p>{note.content}</p><footer><small>Edited {new Date(note.updatedAt).toLocaleDateString()}</small><FiStar/></footer></button>)}</div>:<Panel title="No matching notes"><p>Create a note or change the active filter.</p></Panel>}</section>
   <aside className="note-inspector">{selected?<><div className="inspector-title"><span className="note-kind">{selected.noteType.replaceAll("_"," ")}</span><h2>{selected.title}</h2><small>Updated {new Date(selected.updatedAt).toLocaleString()}</small></div><div className="inspector-copy">{selected.content}</div><div className="inspector-actions"><Link className="pp-button" href={`/notebook/new?note=${selected.id}`}><FiEdit3/> Open full note</Link><button className="pp-button secondary danger" onClick={()=>void remove(selected.id)}><FiTrash2/> Delete</button></div></>:<p>Select a note to inspect it.</p>}</aside>
  </div>}
 </main></ProductShell>
}
function Metric({icon,value,label}:{icon:React.ReactNode;value:number;label:string}){return <div>{icon}<span><b>{value}</b><small>{label}</small></span></div>}
