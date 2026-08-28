"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { FiEdit3, FiPlus, FiRefreshCw, FiTrash2, FiX } from "react-icons/fi";
import { PageSkeleton } from "./async-state";
import { useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./role-workspace.css";

type PageResponse<T> = { data: T[] };
type Course = { id: string; courseCode: string; courseName: string };
type Deck = {
  id: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  displayOrder: number;
  course?: Course | null;
  topic?: { topicName?: string } | null;
  lecture?: { title?: string } | null;
};
type Card = {
  id: string;
  title: string;
  frontContent: string;
  backContent: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  isActive: boolean;
  explanation?: string | null;
  hint?: string | null;
  displayOrder?: number;
};

const initialDeckForm = { course_id: "", title: "", description: "" };
const initialCardForm = {
  title: "",
  front_content: "",
  back_content: "",
  explanation: "",
  hint: "",
  difficulty: "MEDIUM" as "EASY" | "MEDIUM" | "HARD",
};

function Status({ published }: { published: boolean }) {
  return <span className={`role-status ${published ? "good" : "pending"}`}>{published ? "PUBLISHED" : "DRAFT"}</span>;
}

function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return <div className="role-modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="role-modal wide" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
      <header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog"><FiX /></button></header>
      {children}
    </section>
  </div>;
}

export function FlashcardStudioPage({ admin = false }: { admin?: boolean }) {
  const { user, request } = useAuth();
  const { notify, confirm } = useUx();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [deckForm, setDeckForm] = useState(initialDeckForm);
  const [cardForm, setCardForm] = useState(initialCardForm);

  const selected = useMemo(() => decks.find((deck) => deck.id === selectedId) || null, [decks, selectedId]);

  const load = useCallback(async () => {
    if (!user || user.role === "STUDENT") return;
    setLoading(true);
    try {
      const [deckData, courseData] = await Promise.all([
        request<PageResponse<Deck>>("/flashcards/decks?limit=100"),
        request<PageResponse<Course>>("/academic/courses?limit=100"),
      ]);
      setDecks(deckData.data);
      setCourses(courseData.data);
      setSelectedId((current) => current && deckData.data.some((deck) => deck.id === current)
        ? current
        : deckData.data[0]?.id || null);
    } catch (cause) {
      notify({ title: "Could not load flashcards", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [notify, request, user]);

  const loadCards = useCallback(async (deckId: string) => {
    setCardsLoading(true);
    try {
      const response = await request<PageResponse<Card>>(`/flashcards/decks/${deckId}/cards?limit=100`);
      setCards(response.data);
    } catch (cause) {
      setCards([]);
      notify({ title: "Could not load deck cards", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setCardsLoading(false);
    }
  }, [notify, request]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selectedId) void loadCards(selectedId); else setCards([]); }, [loadCards, selectedId]);

  async function createDeck(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await request("/flashcards/decks", {
        method: "POST",
        body: {
          title: deckForm.title.trim(),
          description: deckForm.description.trim() || undefined,
          course_id: deckForm.course_id || undefined,
        },
      });
      setDeckOpen(false);
      setDeckForm(initialDeckForm);
      await load();
      notify({ title: "Deck created", tone: "success" });
    } catch (cause) {
      notify({ title: "Could not create deck", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  function beginDeckEdit(deck: Deck) {
    setEditingDeck(deck);
    setDeckForm({ course_id: deck.course?.id || "", title: deck.title, description: deck.description || "" });
  }

  async function saveDeckEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingDeck) return;
    setSaving(true);
    try {
      await request(`/flashcards/decks/${editingDeck.id}`, {
        method: "PUT",
        body: { title: deckForm.title.trim(), description: deckForm.description.trim() },
      });
      setEditingDeck(null);
      setDeckForm(initialDeckForm);
      await load();
      notify({
        title: "Deck updated",
        description: editingDeck.isPublished ? "The published deck stayed live while its metadata was updated." : undefined,
        tone: "success",
      });
    } catch (cause) {
      notify({ title: "Could not edit deck", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  function beginCardEdit(card: Card) {
    setEditingCard(card);
    setCardForm({
      title: card.title,
      front_content: card.frontContent,
      back_content: card.backContent,
      explanation: card.explanation || "",
      hint: card.hint || "",
      difficulty: card.difficulty,
    });
    setCardOpen(true);
  }

  function beginCardCreate() {
    if (!selected) return;
    if (selected.isPublished) {
      notify({
        title: "Adding cards still requires Draft",
        description: "You can edit existing published cards live. Return the deck to Draft only when you need to add or remove cards.",
        tone: "info",
      });
      return;
    }
    setEditingCard(null);
    setCardForm(initialCardForm);
    setCardOpen(true);
  }

  async function saveCard(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const body = {
        title: cardForm.title.trim(),
        front_content: cardForm.front_content.trim(),
        back_content: cardForm.back_content.trim(),
        difficulty: cardForm.difficulty,
        explanation: cardForm.explanation.trim(),
        hint: cardForm.hint.trim(),
      };
      if (editingCard) {
        await request(`/flashcards/cards/${editingCard.id}`, { method: "PUT", body });
      } else {
        await request(`/flashcards/decks/${selected.id}/cards`, { method: "POST", body });
      }
      setCardOpen(false);
      setEditingCard(null);
      setCardForm(initialCardForm);
      await loadCards(selected.id);
      notify({
        title: editingCard ? "Flashcard updated" : "Flashcard created",
        description: editingCard && selected.isPublished ? "Students will receive the revised card as due again." : undefined,
        tone: "success",
      });
    } catch (cause) {
      notify({ title: editingCard ? "Could not edit flashcard" : "Could not create flashcard", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleDeck(deck: Deck) {
    setSaving(true);
    try {
      await request(`/flashcards/decks/${deck.id}`, { method: "PUT", body: { is_published: !deck.isPublished } });
      await load();
      notify({ title: deck.isPublished ? "Deck returned to Draft" : "Deck published", tone: "success" });
    } catch (cause) {
      notify({ title: "Could not update deck", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function removeCard(card: Card) {
    if (!selected) return;
    if (selected.isPublished) {
      notify({ title: "Return deck to Draft to delete cards", description: "Published cards can be edited live, but structural deletion stays protected.", tone: "info" });
      return;
    }
    const accepted = await confirm({
      title: "Delete flashcard?",
      description: `Remove “${card.title}” from this draft deck? This action cannot be undone.`,
      confirmLabel: "Delete card",
      cancelLabel: "Keep card",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      await request(`/flashcards/cards/${card.id}`, { method: "DELETE" });
      await loadCards(selected.id);
      notify({ title: "Flashcard deleted", tone: "success" });
    } catch (cause) {
      notify({ title: "Could not delete flashcard", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  if (user && user.role === "STUDENT") {
    return <ProductShell><main className="pp-page"><Panel title="Instructor access required"><p>This workspace is available to instructors and system administrators.</p></Panel></main></ProductShell>;
  }

  return <ProductShell search="Search decks and cards"><main className="pp-page role-workspace">
    <div className="pp-title hero role-heading"><div><small className="page-eyebrow">{admin ? "ADMIN · FLASHCARD CONTROL" : "INSTRUCTOR · FLASHCARD STUDIO"}</small><h1>Flashcard studio</h1><p>Edit live teaching cards safely, manage publication, and keep structural changes deliberate.</p></div><div className="role-heading-actions"><button className="pp-button secondary" type="button" onClick={() => void load()}><FiRefreshCw /> Refresh</button><button className="pp-button" type="button" onClick={() => { setDeckForm(initialDeckForm); setDeckOpen(true); }}><FiPlus /> New deck</button></div></div>
    {loading ? <Panel><PageSkeleton variant="list" label="Loading flashcard studio" /></Panel> : <div className="role-master-detail">
      <aside className="role-master-list"><header><b>{decks.length}</b><small>DECKS</small></header>{decks.map((deck) => <button className={selectedId === deck.id ? "active" : ""} type="button" key={deck.id} onClick={() => setSelectedId(deck.id)}><div><b>{deck.title}</b><small>{deck.course?.courseName || deck.topic?.topicName || deck.lecture?.title || "Unlinked deck"}</small></div><Status published={deck.isPublished} /></button>)}</aside>
      <section className="role-detail">{selected ? <><Panel className="role-course-hero"><div><Status published={selected.isPublished} /><h2>{selected.title}</h2><p>{selected.description || "No deck description."}</p>{selected.isPublished && <small>Published cards can be edited without taking the deck offline.</small>}</div><div className="role-hero-actions"><button className="pp-button secondary" type="button" onClick={() => beginDeckEdit(selected)}><FiEdit3 /> Edit deck</button><button className="pp-button" type="button" onClick={beginCardCreate}><FiPlus /> Add card</button><button className="pp-button secondary" disabled={saving} type="button" onClick={() => void toggleDeck(selected)}>{selected.isPublished ? "Return to Draft" : "Publish deck"}</button></div></Panel>
        {cardsLoading ? <Panel><PageSkeleton variant="list" label="Loading deck cards" /></Panel> : cards.length ? <div className="role-card-grid">{cards.map((card) => <Panel className="role-flashcard" key={card.id}><header><span><button type="button" onClick={() => beginCardEdit(card)}><FiEdit3 /> Edit</button><button className="danger" type="button" aria-label={`Delete ${card.title}`} title="Delete flashcard" onClick={() => void removeCard(card)}><FiTrash2 /></button></span></header><h3>{card.title}</h3><div><small>FRONT</small><p>{card.frontContent}</p></div><div><small>BACK</small><p>{card.backContent}</p></div></Panel>)}</div> : <Panel title="No cards in this deck"><p>Add the first teaching card, then publish the deck when it is complete.</p><button className="pp-button" type="button" onClick={beginCardCreate}><FiPlus /> Add card</button></Panel>}
      </> : <Panel title="Select a deck"><p>Choose a deck to manage its publication state and cards.</p></Panel>}</section>
    </div>}

    <Modal title="Create flashcard deck" open={deckOpen} onClose={() => !saving && setDeckOpen(false)}><form className="role-form" onSubmit={createDeck}><div className="role-form-grid"><label className="wide">Title<input required value={deckForm.title} onChange={(event) => setDeckForm((current) => ({ ...current, title: event.target.value }))} /></label><label className="wide">Course<select required value={deckForm.course_id} onChange={(event) => setDeckForm((current) => ({ ...current, course_id: event.target.value }))}><option value="">Select course…</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.courseCode} · {course.courseName}</option>)}</select></label><label className="wide">Description<textarea rows={4} value={deckForm.description} onChange={(event) => setDeckForm((current) => ({ ...current, description: event.target.value }))} /></label></div><footer><button className="pp-button secondary" type="button" disabled={saving} onClick={() => setDeckOpen(false)}>Cancel</button><button className="pp-button" disabled={saving} type="submit">{saving ? "Saving…" : "Create deck"}</button></footer></form></Modal>

    <Modal title="Edit flashcard deck" open={Boolean(editingDeck)} onClose={() => !saving && setEditingDeck(null)}><form className="role-form" onSubmit={saveDeckEdit}><div className="role-form-grid"><label className="wide">Title<input required value={deckForm.title} onChange={(event) => setDeckForm((current) => ({ ...current, title: event.target.value }))} /></label><label className="wide">Description<textarea rows={4} value={deckForm.description} onChange={(event) => setDeckForm((current) => ({ ...current, description: event.target.value }))} /></label></div><footer><button className="pp-button secondary" type="button" disabled={saving} onClick={() => setEditingDeck(null)}>Cancel</button><button className="pp-button" disabled={saving} type="submit">{saving ? "Saving…" : "Save changes"}</button></footer></form></Modal>

    <Modal title={editingCard ? "Edit flashcard" : "Add flashcard"} open={cardOpen} onClose={() => { if (!saving) { setCardOpen(false); setEditingCard(null); } }}><form className="role-form" onSubmit={saveCard}><div className="role-form-grid"><label>Title<input required value={cardForm.title} onChange={(event) => setCardForm((current) => ({ ...current, title: event.target.value }))} /></label><label>Difficulty<select value={cardForm.difficulty} onChange={(event) => setCardForm((current) => ({ ...current, difficulty: event.target.value as Card["difficulty"] }))}><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label><label className="wide">Front<textarea required rows={4} value={cardForm.front_content} onChange={(event) => setCardForm((current) => ({ ...current, front_content: event.target.value }))} /></label><label className="wide">Back<textarea required rows={4} value={cardForm.back_content} onChange={(event) => setCardForm((current) => ({ ...current, back_content: event.target.value }))} /></label><label className="wide">Explanation<textarea rows={3} value={cardForm.explanation} onChange={(event) => setCardForm((current) => ({ ...current, explanation: event.target.value }))} /></label><label className="wide">Hint<textarea rows={2} value={cardForm.hint} onChange={(event) => setCardForm((current) => ({ ...current, hint: event.target.value }))} /></label></div><footer><button className="pp-button secondary" type="button" disabled={saving} onClick={() => { setCardOpen(false); setEditingCard(null); }}>Cancel</button><button className="pp-button" disabled={saving} type="submit">{saving ? "Saving…" : editingCard ? "Save changes" : "Create card"}</button></footer></form></Modal>
  </main></ProductShell>;
}
