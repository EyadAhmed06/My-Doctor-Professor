import { Suspense } from "react";
import { StudentFlashcardsPage } from "@/components/student-flashcards-page";
import { FlashcardRatingGate } from "@/components/flashcard-rating-gate";

export default function Page(){
  return <Suspense fallback={<div className="product-auth-loading">Loading flashcards…</div>}><FlashcardRatingGate><StudentFlashcardsPage/></FlashcardRatingGate></Suspense>;
}
