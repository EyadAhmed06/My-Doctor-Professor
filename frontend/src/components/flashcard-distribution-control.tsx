"use client";

import { useCallback, useEffect, useState } from "react";
import { FiLayers, FiLock, FiRefreshCw } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { useUx } from "./ux-provider";

type BundleAccessMode = "INHERIT" | "RESTRICTED";
type CandidateBundle = { id:string; title:string; academic_year:number; status:string };
type Distribution = { bundle_access_mode:BundleAccessMode; bundle_ids:string[]; candidate_bundles:CandidateBundle[] };

export function FlashcardDistributionControl({deckId,published}:{deckId:string;published:boolean}) {
  const {request}=useAuth();
  const {notify}=useUx();
  const [state,setState]=useState<Distribution|null>(null);
  const [mode,setMode]=useState<BundleAccessMode>("INHERIT");
  const [bundleIds,setBundleIds]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const value=await request<Distribution>(`/flashcards/decks/${deckId}/distribution`);
      setState(value);setMode(value.bundle_access_mode);setBundleIds(value.bundle_ids);
    }catch(cause){notify({title:"Could not load bundle availability",description:cause instanceof Error?cause.message:undefined,tone:"error"});}
    finally{setLoading(false);}
  },[deckId,notify,request]);

  useEffect(()=>{void load();},[load]);

  function toggleBundle(id:string){
    setBundleIds(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);
  }

  async function save(){
    if(published){notify({title:"Return deck to Draft first",description:"Bundle availability changes who can see this deck, so it is protected as a structural change.",tone:"info"});return;}
    if(mode==="RESTRICTED"&&!bundleIds.length){notify({title:"Choose at least one bundle",tone:"error"});return;}
    setSaving(true);
    try{
      const value=await request<Distribution>(`/flashcards/decks/${deckId}/distribution`,{method:"PUT",body:{bundle_access_mode:mode,bundle_ids:mode==="RESTRICTED"?bundleIds:[]}});
      setState(value);setMode(value.bundle_access_mode);setBundleIds(value.bundle_ids);
      notify({title:"Bundle availability updated",description:mode==="INHERIT"?"The deck now follows its academic scope automatically.":"Only students entitled through the selected bundles can see this deck.",tone:"success"});
    }catch(cause){notify({title:"Could not update bundle availability",description:cause instanceof Error?cause.message:undefined,tone:"error"});}
    finally{setSaving(false);}
  }

  if(loading)return <div className="deck-distribution-card"><FiRefreshCw/><span>Loading bundle availability…</span></div>;
  if(!state)return null;

  const dirty=mode!==state.bundle_access_mode||JSON.stringify([...bundleIds].sort())!==JSON.stringify([...state.bundle_ids].sort());
  return <section className="deck-distribution-card" aria-label="Deck bundle availability">
    <div className="deck-distribution-heading"><FiLayers/><div><b>Bundle availability</b><p>Academic scope says what this deck teaches. Bundle availability says through which subscriptions students may receive it.</p></div></div>
    <div className="deck-distribution-modes">
      <label><input type="radio" name={`deck-distribution-${deckId}`} checked={mode==="INHERIT"} disabled={published||saving} onChange={()=>setMode("INHERIT")}/><span><b>Inherit academic access</b><small>Recommended. Course decks require full-course entitlement; week and lecture decks follow matching week access.</small></span></label>
      <label><input type="radio" name={`deck-distribution-${deckId}`} checked={mode==="RESTRICTED"} disabled={published||saving} onChange={()=>setMode("RESTRICTED")}/><span><b>Restrict to selected bundles</b><small>Add an extra commercial/access filter without changing where the deck belongs academically.</small></span></label>
    </div>
    {mode==="RESTRICTED"&&<div className="deck-bundle-checklist">{state.candidate_bundles.length?state.candidate_bundles.map(bundle=><label key={bundle.id}><input type="checkbox" checked={bundleIds.includes(bundle.id)} disabled={published||saving} onChange={()=>toggleBundle(bundle.id)}/><span><b>{bundle.title}</b><small>Year {bundle.academic_year} · {bundle.status}</small></span></label>):<p>No manageable bundles currently include this course.</p>}</div>}
    {published&&<p className="deck-distribution-lock"><FiLock/> Return the deck to Draft to change academic scope or bundle availability.</p>}
    <div className="deck-distribution-actions"><button type="button" className="pp-button secondary" disabled={!dirty||saving||published} onClick={()=>{setMode(state.bundle_access_mode);setBundleIds(state.bundle_ids)}}>Discard</button><button type="button" className="pp-button" disabled={!dirty||saving||published} onClick={()=>void save()}>{saving?"Saving…":"Save availability"}</button></div>
  </section>;
}
