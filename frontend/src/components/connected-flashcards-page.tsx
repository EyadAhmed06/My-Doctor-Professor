"use client";

import { ApiError } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FiBookOpen, FiCheck, FiRefreshCw, FiWifiOff } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { PageSkeleton } from "./async-state";
import { Panel, ProductShell, Progress } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";

type Deck = { id:string; title:string; lecture?:{id?:string;title?:string;week?:{title?:string;weekNumber?:number}}; course?:{courseName?:string} };
type Card = { id:string; title:string; frontContent:string; backContent:string; explanation?:string|null; deck:Deck };
type Page<T> = { data:T[]; page:number; limit:number; total:number; total_pages:number };
type Rating = "VERY_HARD"|"HARD"|"GOOD"|"EASY";

const numberRatings:Record<string,Rating>={"1":"VERY_HARD","2":"HARD","3":"GOOD","4":"EASY"};

export function ConnectedFlashcardsPage(){
  const {request}=useAuth();const {startNavigation}=useUx();const router=useRouter();const pathname=usePathname();const searchParams=useSearchParams();
  const requestedCard=searchParams.get("card");const requestedLecture=searchParams.get("lecture");
  const [cards,setCards]=useState<Card[]>([]);
  const [index,setIndex]=useState(0);
  const [revealed,setRevealed]=useState(false);
  const [reviewed,setReviewed]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const [online,setOnline]=useState(true);

  const setUrl=useCallback((card:Card|null,replace=false)=>{
    const params=new URLSearchParams(searchParams.toString());
    if(card){params.set("card",card.id);if(card.deck.lecture?.id)params.set("lecture",card.deck.lecture.id);}else params.delete("card");
    const suffix=params.toString();const href=suffix?`${pathname}?${suffix}`:pathname;startNavigation();if(replace)router.replace(href,{scroll:false});else router.push(href,{scroll:false});
  },[pathname,router,searchParams,startNavigation]);

  const load=useCallback(async()=>{
    setLoading(true);setError(null);
    try{setCards((await request<Page<Card>>("/flashcards/cards/due?limit=50")).data);}
    catch(cause){setError(cause instanceof ApiError?cause.message:"Unable to load due flashcards.");}
    finally{setLoading(false);}
  },[request]);

  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    if(loading||!cards.length)return;
    const cardIndex=requestedCard?cards.findIndex(item=>item.id===requestedCard):-1;
    const lectureIndex=requestedLecture?cards.findIndex(item=>item.deck.lecture?.id===requestedLecture):-1;
    const targetIndex=cardIndex>=0?cardIndex:lectureIndex>=0?lectureIndex:0;
    setIndex(targetIndex);setRevealed(false);
    if(requestedCard!==cards[targetIndex]?.id)setUrl(cards[targetIndex],true);
  },[cards,loading,requestedCard,requestedLecture,setUrl]);
  useEffect(()=>{
    setOnline(navigator.onLine);
    const goOnline=()=>setOnline(true);
    const goOffline=()=>setOnline(false);
    window.addEventListener("online",goOnline);
    window.addEventListener("offline",goOffline);
    return()=>{window.removeEventListener("online",goOnline);window.removeEventListener("offline",goOffline);};
  },[]);

  const card=cards[index];
  const selectCard=useCallback((nextIndex:number)=>{const next=Math.max(0,Math.min(cards.length-1,nextIndex));setIndex(next);setRevealed(false);if(cards[next])setUrl(cards[next]);},[cards,setUrl]);
  const rate=useCallback(async(rating:Rating)=>{
    if(!card||saving||!online)return;
    setSaving(true);setError(null);
    try{
      await request(`/flashcards/cards/${card.id}/review`,{method:"POST",body:{rating}});
      const remaining=cards.filter(item=>item.id!==card.id);
      setReviewed(value=>value+1);setCards(remaining);setIndex(0);setRevealed(false);setUrl(remaining[0]||null,true);
    }catch(cause){setError(cause instanceof ApiError?cause.message:"Unable to save this review.");}
    finally{setSaving(false);}
  },[card,cards,online,request,saving,setUrl]);

  useEffect(()=>{
    function handleKey(event:KeyboardEvent){
      const target=event.target as HTMLElement|null;
      if(target&&(target.isContentEditable||["INPUT","TEXTAREA","SELECT","BUTTON"].includes(target.tagName)))return;
      if(!card)return;
      if(event.code==="Space"){event.preventDefault();setRevealed(value=>!value);}
      else if(event.key==="ArrowRight"){event.preventDefault();selectCard(index+1);}
      else if(event.key==="ArrowLeft"){event.preventDefault();selectCard(index-1);}
      else if(revealed&&numberRatings[event.key]){event.preventDefault();void rate(numberRatings[event.key]);}
    }
    window.addEventListener("keydown",handleKey);
    return()=>window.removeEventListener("keydown",handleKey);
  },[card,index,rate,revealed,selectCard]);

  return <ProductShell search="Search flashcards or lectures"><main className="pp-page flashcards-page"><div className="pp-title hero"><div><small className="page-eyebrow">SPACED REPETITION</small><h1>Flashcards</h1><p>Review instructor-published cards when they become due.</p></div><div className="keyboard-hints" aria-label="Keyboard shortcuts"><span>Space · Flip</span><span>← → · Navigate</span><span>1–4 · Rate</span></div></div>
    {!online&&<p className="offline-notice" role="status"><FiWifiOff/> You are offline. The current queue remains visible, but ratings will wait until your connection returns.</p>}
    {error&&<p className="form-error" role="alert">{error} <button onClick={()=>void load()}>Retry</button></p>}
    {loading?<PageSkeleton variant="workspace" label="Loading your review queue"/>:!card?<Panel title="You are caught up"><FiCheck/><h2>No flashcards are due right now.</h2><p>You reviewed {reviewed} card{reviewed===1?"":"s"} in this session.</p><button className="pp-button secondary" onClick={()=>void load()}>Refresh queue</button></Panel>:<div className="flashcards-layout connected"><aside className="deck-sidebar"><div className="deck-sidebar-head"><span><b>DUE QUEUE</b><small>{cards.length} cards remaining</small></span></div>{cards.map((item,itemIndex)=><button className={index===itemIndex?"active":""} onClick={()=>selectCard(itemIndex)} key={item.id}><span><small>{item.deck.course?.courseName||"Course"}</small><b>{item.deck.title}</b><em>{item.title}</em></span></button>)}</aside>
      <section className="review-workspace"><div className="review-heading"><div><small>{card.deck.lecture?.week?.title||"Instructor deck"}</small><h2>{card.deck.title}</h2><p>{card.deck.lecture?.title||card.title}</p></div><div><b>{reviewed}</b><small>reviewed now</small></div></div><button className={`study-card single-face ${revealed?"showing-back":"showing-front"}`} onClick={()=>setRevealed(value=>!value)} aria-pressed={revealed}><div className="study-card-inner"><div className={`card-face ${revealed?"card-back":"card-front"}`}>{revealed?<><small>BACK · EXPLANATION</small><p>{card.backContent}</p>{card.explanation&&<p>{card.explanation}</p>}<span>Click or press Space to see the front</span></>:<><small>FRONT</small><FiBookOpen/><h2>{card.frontContent}</h2><span>Click or press Space to flip</span></>}</div></div></button>{revealed&&<div className="review-rating"><p>How well did you remember?</p><button disabled={saving||!online} onClick={()=>void rate("VERY_HARD")} className="again"><b>1 · Again</b></button><button disabled={saving||!online} onClick={()=>void rate("HARD")}><b>2 · Hard</b></button><button disabled={saving||!online} onClick={()=>void rate("GOOD")} className="good"><b>3 · Good</b></button><button disabled={saving||!online} onClick={()=>void rate("EASY")}><b>4 · Easy</b></button></div>}</section>
      <aside className="flashcard-insights"><Panel title="Today’s progress"><div className="readiness-ring">{reviewed}<small>reviewed</small></div><Progress value={cards.length+reviewed?Math.round(reviewed/(cards.length+reviewed)*100):100}/></Panel><Panel title="How review works"><p><FiRefreshCw/> Your rating schedules the next review.</p><p>Again maps to the backend’s <b>VERY_HARD</b> rating.</p><p>Keyboard ratings are enabled only after the back is revealed.</p></Panel></aside></div>}
  </main></ProductShell>;
}
