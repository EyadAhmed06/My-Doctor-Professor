"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-provider";

function editable(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
}

export function GlobalKeyboardShortcuts(){
  const router=useRouter();
  const {user}=useAuth();
  useEffect(()=>{
    if(!user)return;
    const listener=(event:KeyboardEvent)=>{
      if(editable(event.target))return;
      if((event.ctrlKey||event.metaKey)&&event.key==="/"){
        event.preventDefault();
        router.push("/shortcuts");
      }
    };
    window.addEventListener("keydown",listener);
    return()=>window.removeEventListener("keydown",listener);
  },[router,user]);
  return null;
}
