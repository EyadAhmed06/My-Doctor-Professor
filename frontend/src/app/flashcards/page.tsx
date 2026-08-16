import { Suspense } from "react";
import { ConnectedFlashcardsPage } from "@/components/connected-flashcards-page";
import { FlashcardRatingGate } from "@/components/flashcard-rating-gate";

export default function Page(){
  return <Suspense fallback={<div className="product-auth-loading">Loading flashcards…</div>}><FlashcardRatingGate><ConnectedFlashcardsPage/></FlashcardRatingGate></Suspense>;
}
