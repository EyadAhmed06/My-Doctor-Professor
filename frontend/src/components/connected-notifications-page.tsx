"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FiBell, FiCheck, FiTrash2 } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import "./product-pages.css";

type Notification={id:string;title:string;message:string;target_url:string|null;notification_type:string;status:"READ"|"UNREAD";created_at:string;creator:{id:string;full_name:string}|null};
type Page<T>={data:T[];page:number;limit:number;total:number;total_pages:number};

export function ConnectedNotificationsPage(){const {request}=useAuth();const [items,setItems]=useState<Notification[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);
 useEffect(()=>{let active=true;void request<Page<Notification>>("/notifications?limit=100").then(result=>{if(active)setItems(result.data);}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Unable to load notifications.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[request]);
 async function read(item:Notification){if(item.status==="READ")return;try{await request(`/notifications/${item.id}`,{method:"PUT"});setItems(current=>current.map(value=>value.id===item.id?{...value,status:"READ"}:value));}catch(cause){setError(cause instanceof Error?cause.message:"Unable to mark notification as read.");}}
 async function readAll(){try{await request("/notifications/mark-read",{method:"PUT"});setItems(current=>current.map(value=>({...value,status:"READ"})));}catch(cause){setError(cause instanceof Error?cause.message:"Unable to mark notifications as read.");}}
 async function remove(id:string){try{await request(`/notifications/${id}`,{method:"DELETE"});setItems(current=>current.filter(value=>value.id!==id));}catch(cause){setError(cause instanceof Error?cause.message:"Unable to delete notification.");}}
 return <ProductShell><main className="pp-page"><div className="pp-title"><div><h1>Notifications</h1><p>Your personal notification inbox from the backend.</p></div><button className="pp-button secondary" onClick={()=>void readAll()}><FiCheck/> Mark all read</button></div>{error&&<p className="form-error" role="alert">{error}</p>}{loading?<div className="product-auth-loading">Loading notifications…</div>:!items.length?<Panel title="You are all caught up"><FiBell/><p>No notifications exist for this account.</p></Panel>:<div className="notebook-rows">{items.map(item=><article className={`pp-panel ${item.status==="UNREAD"?"active":""}`} key={item.id} onClick={()=>void read(item)}><small>{item.notification_type.replaceAll("_"," ")} · {new Date(item.created_at).toLocaleString()}</small><h2>{item.title}</h2><p>{item.message}</p>{item.creator&&<small>From {item.creator.full_name}</small>}<div>{item.target_url&&<Link className="pp-button secondary" href={item.target_url}>Open</Link>}<button className="pp-button secondary" onClick={event=>{event.stopPropagation();void remove(item.id)}}><FiTrash2/> Delete</button></div></article>)}</div>}</main></ProductShell>}
