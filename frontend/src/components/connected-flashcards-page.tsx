"use client";

import { ApiError } from "@/lib/api";
import { useEffect, useState } from "react";
import { FiBookOpen, FiCheck, FiRefreshCw } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell, Progress } from "./product-shell";
import "./product-pages.css";

type Deck = { id:string; title:string; lecture?:{title?:string;week?:{title?:string;weekNumber?:number}}; course?:{courseName?:string} };
type Card = { id:string; title:string; frontContent:string; backContent:string; explanation?:string|null; deck:Deck };
type Page<T> = { data:T[]; page:number; limit:number; total:number; total_pages:number };
type Rating = "VERY_HARD"|"HARD"|"GOOD"|"EASY";

export function ConnectedFlashcardsPage(){
  const {request}=useAuth();
  const [cards,setCards]=useState<Card[]>([]);const [index,setIndex]=useState(0);const [revealed,setRevealed]=useState(false);const [reviewed,setReviewed]=useState(0);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);const [saving,setSaving]=useState(false);
  async function load(){setLoading(true);setError(null);try{const result=await request<Page<Card>>("/flashcards/cards/due?limit=50");setCards(result.data);setIndex(0);setRevealed(false);}catch(cause){setError(cause instanceof ApiError?cause.message:"Unable to load due flashcards.");}finally{setLoading(false);}}
  useEffect(()=>{
    let active=true;
    void request<Page<Card>>("/flashcards/cards/due?limit=50")
      .then(result=>{if(active){setCards(result.data);setIndex(0);setRevealed(false);}})
      .catch(cause=>{if(active)setError(cause instanceof ApiError?cause.message:"Unable to load due flashcards.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[request]);
  const card=cards[index];
  async function rate(rating:Rating){if(!card||saving)return;setSaving(true);setError(null);try{await request(`/flashcards/cards/${card.id}/review`,{method:"POST",body:{rating}});setReviewed(value=>value+1);setCards(current=>current.filter(item=>item.id!==card.id));setIndex(0);setRevealed(false);}catch(cause){setError(cause instanceof ApiError?cause.message:"Unable to save this review.");}finally{setSaving(false);}}
  return <ProductShell search="Search flashcards or lectures"><main className="pp-page flashcards-page"><div className="pp-title hero"><div><small className="page-eyebrow">SPACED REPETITION</small><h1>Flashcards</h1><p>Review instructor-published cards when they become due.</p></div></div>
    {error&&<p className="form-error" role="alert">{error} <button onClick={()=>void load()}>Retry</button></p>}
    {loading?<div className="product-auth-loading">Loading your review queue…</div>:!card?<Panel title="You are caught up"><FiCheck/><h2>No flashcards are due right now.</h2><p>You reviewed {reviewed} card{reviewed===1?"":"s"} in this session.</p><button className="pp-button secondary" onClick={()=>void load()}>Refresh queue</button></Panel>:<div className="flashcards-layout connected"><aside className="deck-sidebar"><div className="deck-sidebar-head"><span><b>DUE QUEUE</b><small>{cards.length} cards remaining</small></span></div>{cards.map((item,itemIndex)=><button className={index===itemIndex?"active":""} onClick={()=>{setIndex(itemIndex);setRevealed(false)}} key={item.id}><span><small>{item.deck.course?.courseName||"Course"}</small><b>{item.deck.title}</b><em>{item.title}</em></span></button>)}</aside>
      <section className="review-workspace"><div className="review-heading"><div><small>{card.deck.lecture?.week?.title||"Instructor deck"}</small><h2>{card.deck.title}</h2><p>{card.deck.lecture?.title||card.title}</p></div><div><b>{reviewed}</b><small>reviewed now</small></div></div><button className={`study-card single-face ${revealed?"showing-back":"showing-front"}`} onClick={()=>setRevealed(value=>!value)} aria-pressed={revealed}><div className="study-card-inner"><div className={`card-face ${revealed?"card-back":"card-front"}`}>{revealed?<><small>BACK · EXPLANATION</small><p>{card.backContent}</p>{card.explanation&&<p>{card.explanation}</p>}<span>Click to see the front</span></>:<><small>FRONT</small><FiBookOpen/><h2>{card.frontContent}</h2><span>Click to flip</span></>}</div></div></button>{revealed&&<div className="review-rating"><p>How well did you remember?</p><button disabled={saving} onClick={()=>void rate("VERY_HARD")} className="again"><b>Again</b></button><button disabled={saving} onClick={()=>void rate("HARD")}><b>Hard</b></button><button disabled={saving} onClick={()=>void rate("GOOD")} className="good"><b>Good</b></button><button disabled={saving} onClick={()=>void rate("EASY")}><b>Easy</b></button></div>}</section>
      <aside className="flashcard-insights"><Panel title="Today’s progress"><div className="readiness-ring">{reviewed}<small>reviewed</small></div><Progress value={cards.length+reviewed?Math.round(reviewed/(cards.length+reviewed)*100):100}/></Panel><Panel title="How review works"><p><FiRefreshCw/> Your rating schedules the next review.</p><p>Again maps to the backend’s <b>VERY_HARD</b> rating.</p></Panel></aside></div>}
  </main></ProductShell>;
}
