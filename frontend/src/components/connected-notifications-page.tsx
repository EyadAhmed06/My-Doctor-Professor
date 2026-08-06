"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiBell, FiCheck, FiTrash2 } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { EmptyState, ErrorState, PageSkeleton } from "./async-state";
import { ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";

type Notification={id:string;title:string;message:string;target_url:string|null;notification_type:string;status:"READ"|"UNREAD";created_at:string;creator:{id:string;full_name:string}|null};
type Page<T>={data:T[];page:number;limit:number;total:number;total_pages:number};
type Filter="ALL"|"UNREAD";

function inboxGroup(dateValue:string){
 const date=new Date(dateValue);const now=new Date();
 const today=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
 const itemDay=new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime();
 if(itemDay===today)return "Today";
 if(today-itemDay<7*86400000)return "This week";
 return "Earlier";
}

export function ConnectedNotificationsPage(){
 const {request}=useAuth();const {notify}=useUx();
 const [items,setItems]=useState<Notification[]>([]);const [filter,setFilter]=useState<Filter>("ALL");const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);
 const deleteTimers=useRef(new Map<string,number>());
 const signalChanged=useCallback(()=>window.dispatchEvent(new Event("mdp:notifications-changed")),[]);
 const load=useCallback(async()=>{
  setLoading(true);setError(null);
  try{setItems((await request<Page<Notification>>("/notifications?limit=100")).data);}
  catch(cause){setError(cause instanceof Error?cause.message:"Unable to load notifications.");}
  finally{setLoading(false);}
 },[request]);
 useEffect(()=>{void load();return()=>{for(const timer of deleteTimers.current.values())window.clearTimeout(timer);deleteTimers.current.clear();};},[load]);

 async function read(item:Notification){
  if(item.status==="READ")return;
  setItems(current=>current.map(value=>value.id===item.id?{...value,status:"READ"}:value));signalChanged();
  try{await request(`/notifications/${item.id}`,{method:"PUT"});}
  catch(cause){setItems(current=>current.map(value=>value.id===item.id?{...value,status:"UNREAD"}:value));signalChanged();notify({title:"Could not mark notification as read",description:cause instanceof Error?cause.message:undefined,tone:"error"});}
 }
 async function readAll(){
  const previous=items;setItems(current=>current.map(value=>({...value,status:"READ"})));signalChanged();
  try{await request("/notifications/mark-read",{method:"PUT"});notify({title:"Notifications marked as read",tone:"success",duration:2500});}
  catch(cause){setItems(previous);signalChanged();notify({title:"Could not mark all as read",description:cause instanceof Error?cause.message:undefined,tone:"error"});}
 }
 function remove(item:Notification){
  const index=items.findIndex(value=>value.id===item.id);
  setItems(current=>current.filter(value=>value.id!==item.id));signalChanged();
  const undo=()=>{
   const timer=deleteTimers.current.get(item.id);if(timer)window.clearTimeout(timer);deleteTimers.current.delete(item.id);
   setItems(current=>{if(current.some(value=>value.id===item.id))return current;const next=[...current];next.splice(Math.max(0,index),0,item);return next;});signalChanged();
  };
  notify({title:"Notification removed",description:"It will be deleted after the undo window closes.",tone:"info",duration:5000,actionLabel:"Undo",onAction:undo});
  const timer=window.setTimeout(async()=>{
   deleteTimers.current.delete(item.id);
   try{await request(`/notifications/${item.id}`,{method:"DELETE"});}
   catch(cause){setItems(current=>current.some(value=>value.id===item.id)?current:[item,...current]);signalChanged();notify({title:"Delete failed",description:cause instanceof Error?cause.message:"The notification was restored.",tone:"error"});}
  },5000);
  deleteTimers.current.set(item.id,timer);
 }
 const visible=useMemo(()=>filter==="UNREAD"?items.filter(item=>item.status==="UNREAD"):items,[filter,items]);
 const grouped=useMemo(()=>visible.reduce<Record<string,Notification[]>>((result,item)=>{const key=inboxGroup(item.created_at);(result[key]??=[]).push(item);return result;},{}),[visible]);
 const unread=items.filter(item=>item.status==="UNREAD").length;
 return <ProductShell><main className="pp-page"><div className="pp-title"><div><h1>Notifications</h1><p>Your personal notification inbox, with {unread} unread.</p></div><button className="pp-button secondary" disabled={!unread} onClick={()=>void readAll()}><FiCheck/> Mark all read</button></div>
 <div className="notification-filters" role="group" aria-label="Notification filter"><button className={filter==="ALL"?"active":""} onClick={()=>setFilter("ALL")}>All <span>{items.length}</span></button><button className={filter==="UNREAD"?"active":""} onClick={()=>setFilter("UNREAD")}>Unread <span>{unread}</span></button></div>
 {loading?<PageSkeleton variant="list" label="Loading notifications"/>:error?<ErrorState description={error} onRetry={()=>void load()}/>:!visible.length?<EmptyState title={filter==="UNREAD"?"No unread notifications":"You are all caught up"} description={filter==="UNREAD"?"New messages will appear here when they arrive.":"No notifications exist for this account."}/>:<div className="notification-groups">{["Today","This week","Earlier"].filter(group=>grouped[group]?.length).map(group=><section key={group}><h2>{group}</h2><div className="notebook-rows">{grouped[group].map(item=><article className={`pp-panel ${item.status==="UNREAD"?"active":""}`} key={item.id} onClick={()=>void read(item)}><small>{item.notification_type.replaceAll("_"," ")} · {new Date(item.created_at).toLocaleString()}</small><h2>{item.title}</h2><p>{item.message}</p>{item.creator&&<small>From {item.creator.full_name}</small>}<div>{item.target_url&&<Link className="pp-button secondary" href={item.target_url} onClick={()=>void read(item)}>Open</Link>}<button className="pp-button secondary" onClick={event=>{event.stopPropagation();remove(item)}}><FiTrash2/> Delete</button></div></article>)}</div></section>)}</div>}
 </main></ProductShell>}
