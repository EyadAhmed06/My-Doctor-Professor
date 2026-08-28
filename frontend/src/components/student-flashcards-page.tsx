"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiArrowLeft, FiBookOpen, FiLayers, FiRefreshCw } from "react-icons/fi";
import { ApiError } from "@/lib/api";
import { useAuth } from "./auth-provider";
import { ConnectedFlashcardsPage } from "./connected-flashcards-page";
import { PageSkeleton } from "./async-state";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./flashcards-simple.css";
import "./product-pages.css";

type PageResponse<T> = { data: T[]; page: number; limit: number; total: number; total_pages: number };
type Deck = {
  id: string;
  title: string;
  description?: string | null;
  cardCount?: number;
  course?: { id?: string; courseName?: string; courseCode?: string } | null;
  lecture?: { id?: string; title?: string; week?: { title?: string; weekNumber?: number } } | null;
  topic?: { topicName?: string } | null;
};
type Card = { id: string };

export function StudentFlashcardsPage() {
  const { request } = useAuth();
  const { startNavigation, notify } = useUx();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get("course");
  const cardId = searchParams.get("card");
  const lectureId = searchParams.get("lecture");
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choosingDeck = Boolean(courseId && !cardId && !lectureId);

  useEffect(() => {
    if (!choosingDeck || !courseId) return;
    let active = true;
    setLoading(true);
    setError(null);
    void request<PageResponse<Deck>>(`/flashcards/decks?course_id=${encodeURIComponent(courseId)}&limit=100`)
      .then((response) => { if (active) setDecks(response.data); })
      .catch((cause) => {
        if (!active) return;
        setDecks([]);
        setError(cause instanceof ApiError ? cause.message : "Unable to load flashcard decks.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [choosingDeck, courseId, request]);

  if (!choosingDeck) return <ConnectedFlashcardsPage />;

  function changeCourse() {
    startNavigation();
    router.push("/flashcards", { scroll: false });
  }

  async function openDeck(deck: Deck) {
    if (!courseId || openingId) return;
    setOpeningId(deck.id);
    setError(null);
    try {
      const first = await request<PageResponse<Card>>(`/flashcards/decks/${deck.id}/cards?limit=100`);
      const card = first.data[0];
      if (!card) {
        setError("This published deck does not contain an active flashcard yet.");
        return;
      }
      const params = new URLSearchParams();
      params.set("course", courseId);
      params.set("card", card.id);
      if (deck.lecture?.id) params.set("lecture", deck.lecture.id);
      startNavigation();
      router.push(`/flashcards?${params.toString()}`, { scroll: false });
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : "Unable to open this flashcard deck.";
      setError(message);
      notify({ title: "Could not open deck", description: message, tone: "error" });
    } finally {
      setOpeningId(null);
    }
  }

  return <ProductShell search="Search flashcard decks"><main className="pp-page flashcards-page flashcards-simplified">
    <div className="pp-title hero flashcards-main-header">
      <div><small className="page-eyebrow">SPACED REPETITION</small><h1>Choose a deck</h1><p>Open one of the published flashcard decks included in this course and your active bundle access.</p></div>
      <div className="flashcards-header-actions"><button className="pp-button secondary" type="button" onClick={changeCourse}><FiArrowLeft /> Change course</button></div>
    </div>

    {error && <p className="form-error" role="alert">{error} <button type="button" onClick={() => window.location.reload()}><FiRefreshCw /> Retry</button></p>}
    {loading ? <PageSkeleton variant="workspace" label="Loading flashcard decks" /> : decks.length ? <section className="flashcard-queue-page" aria-label="Choose a flashcard deck">
      <header className="flashcard-queue-heading"><div><small className="page-eyebrow">PUBLISHED DECKS</small><h2>Which deck do you want to review?</h2></div><span>{decks.length} deck{decks.length === 1 ? "" : "s"}</span></header>
      <div className="flashcard-queue-grid">
        {decks.map((deck) => <button className="flashcard-queue-card" type="button" disabled={Boolean(openingId)} onClick={() => void openDeck(deck)} key={deck.id}>
          <span className="flashcard-queue-icon"><FiLayers /></span>
          <small data-academic-content>{deck.course?.courseCode || deck.lecture?.week?.title || "FLASHCARD DECK"}</small>
          <h3 data-academic-content>{deck.title}</h3>
          <p data-academic-content>{deck.description || deck.lecture?.title || deck.topic?.topicName || "Published teaching deck"}</p>
          <footer><span><FiBookOpen /> {deck.cardCount ?? 0} active card{(deck.cardCount ?? 0) === 1 ? "" : "s"}</span><b>{openingId === deck.id ? "Opening…" : "Review deck →"}</b></footer>
        </button>)}
      </div>
    </section> : <Panel className="flashcard-session-report"><FiLayers /><small className="page-eyebrow">NO DECKS</small><h2>No published decks are available for this course</h2><p>If an instructor has already created a deck, it must be published and linked to content included in your current bundle before it appears here.</p><button className="pp-button secondary" type="button" onClick={changeCourse}><FiArrowLeft /> Choose another course</button></Panel>}
  </main></ProductShell>;
}
