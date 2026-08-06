import { Suspense } from "react";
import { ConnectedFlashcardsPage } from "@/components/connected-flashcards-page";

export default function Page(){
  return <Suspense fallback={<div className="product-auth-loading">Loading flashcards…</div>}><ConnectedFlashcardsPage/></Suspense>;
}
