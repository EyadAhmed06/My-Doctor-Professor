"use client";

import { ApiError } from "@/lib/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FiAward,
  FiBookOpen,
  FiCheck,
  FiClock,
  FiMaximize2,
  FiMinimize2,
  FiPause,
  FiPlay,
  FiRefreshCw,
  FiRotateCcw,
  FiShuffle,
  FiWifiOff,
} from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { PageSkeleton } from "./async-state";
import { useLocale } from "./locale-provider";
import { Panel, ProductShell, Progress } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";

type Deck = {
  id: string;
  title: string;
  lecture?: { id?: string; title?: string; week?: { title?: string; weekNumber?: number } };
  course?: { courseName?: string };
};

type Card = {
  id: string;
  title: string;
  frontContent: string;
  backContent: string;
  explanation?: string | null;
  deck: Deck;
};

type Page<T> = { data: T[]; page: number; limit: number; total: number; total_pages: number };
type Rating = "VERY_HARD" | "HARD" | "GOOD" | "EASY";
type RatingCounts = Record<Rating, number>;
type PendingReview = { token: string; card: Card; rating: Rating; createdAt: number; originalIndex: number };
type StoredSession = {
  reviewed: number;
  selectedCardId: string | null;
  pending: PendingReview[];
  startedAt: number;
  elapsedMs: number;
  paused: boolean;
  initialCount: number;
  ratings: RatingCounts;
};

const numberRatings: Record<string, Rating> = { "1": "VERY_HARD", "2": "HARD", "3": "GOOD", "4": "EASY" };
const emptyRatings = (): RatingCounts => ({ VERY_HARD: 0, HARD: 0, GOOD: 0, EASY: 0 });
const REVIEW_UNDO_MS = 5000;

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function ConnectedFlashcardsPage() {
  const { user, request } = useAuth();
  const { translate, locale } = useLocale();
  const { startNavigation, notify, celebrate } = useUx();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedCard = searchParams.get("card");
  const requestedLecture = searchParams.get("lecture");
  const [cards, setCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [dragX, setDragX] = useState(0);
  const [paused, setPaused] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [initialCount, setInitialCount] = useState(0);
  const [ratings, setRatings] = useState<RatingCounts>(() => emptyRatings());
  const [fullscreen, setFullscreen] = useState(false);
  const pendingRef = useRef<PendingReview[]>([]);
  const timers = useRef(new Map<string, number>());
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const completionAnnounced = useRef(false);
  const focusRef = useRef<HTMLDivElement>(null);
  const sessionKey = `mdp-flashcard-session:${user?.id || "anonymous"}`;

  const setUrl = useCallback((card: Card | null, replace = false) => {
    const params = new URLSearchParams(searchParams.toString());
    if (card) {
      params.set("card", card.id);
      if (card.deck.lecture?.id) params.set("lecture", card.deck.lecture.id);
    } else {
      params.delete("card");
      params.delete("lecture");
    }
    const suffix = params.toString();
    const href = suffix ? `${pathname}?${suffix}` : pathname;
    startNavigation();
    if (replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }, [pathname, router, searchParams, startNavigation]);

  const readSession = useCallback(() => {
    try {
      return JSON.parse(localStorage.getItem(sessionKey) || "null") as StoredSession | null;
    } catch {
      return null;
    }
  }, [sessionKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = readSession();
      const result = await request<Page<Card>>("/flashcards/cards/due?limit=50");
      const savedPending = session?.pending || [];
      const hidden = new Set(savedPending.map((item) => item.card.id));
      const visible = result.data.filter((item) => !hidden.has(item.id));
      const restoredRatings = session?.ratings || emptyRatings();
      const restoredReviewed = session?.reviewed || 0;
      setReviewed(restoredReviewed);
      setPending(savedPending);
      setCards(visible);
      setPaused(session?.paused || false);
      setStartedAt(session?.startedAt || Date.now());
      setElapsedMs(session?.elapsedMs || 0);
      setInitialCount(session?.initialCount || visible.length + restoredReviewed);
      setRatings(restoredRatings);
      completionAnnounced.current = false;
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : translate("Unable to load due flashcards."));
    } finally {
      setLoading(false);
    }
  }, [readSession, request, translate]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    pendingRef.current = pending;
    try {
      localStorage.setItem(sessionKey, JSON.stringify({ reviewed, selectedCardId: cards[index]?.id || null, pending, startedAt, elapsedMs, paused, initialCount, ratings } satisfies StoredSession));
    } catch { /* best-effort */ }
  }, [cards, elapsedMs, index, initialCount, paused, pending, ratings, reviewed, sessionKey, startedAt]);

  useEffect(() => {
    if (paused || loading) return;
    const timer = window.setInterval(() => setElapsedMs((value) => value + 1000), 1000);
    return () => window.clearInterval(timer);
  }, [loading, paused]);

  useEffect(() => {
    if (loading || !cards.length) return;
    const stored = readSession();
    const cardIndex = requestedCard ? cards.findIndex((item) => item.id === requestedCard) : -1;
    const lectureIndex = requestedLecture ? cards.findIndex((item) => item.deck.lecture?.id === requestedLecture) : -1;
    const storedIndex = stored?.selectedCardId ? cards.findIndex((item) => item.id === stored.selectedCardId) : -1;
    const targetIndex = cardIndex >= 0 ? cardIndex : lectureIndex >= 0 ? lectureIndex : storedIndex >= 0 ? storedIndex : 0;
    setIndex(targetIndex);
    setRevealed(false);
    if (requestedCard !== cards[targetIndex]?.id) setUrl(cards[targetIndex], true);
  }, [cards, loading, readSession, requestedCard, requestedLecture, setUrl]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === focusRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    if (loading || cards.length || reviewed === 0 || completionAnnounced.current) return;
    completionAnnounced.current = true;
    celebrate({
      id: `flashcard-session-complete-${startedAt}`,
      title: translate("Review session complete"),
      description: locale === "ar" ? `راجعت ${reviewed} بطاقة خلال ${formatDuration(elapsedMs)}.` : `${reviewed} cards reviewed in ${formatDuration(elapsedMs)}.`,
      points: Math.min(100, Math.max(10, reviewed * 2)),
    });
  }, [cards.length, celebrate, elapsedMs, loading, locale, reviewed, startedAt, translate]);

  const restoreReview = useCallback((entry: PendingReview, message?: string) => {
    setCards((current) => {
      if (current.some((item) => item.id === entry.card.id)) return current;
      const next = [...current];
      next.splice(Math.min(entry.originalIndex, next.length), 0, entry.card);
      return next;
    });
    setRatings((current) => ({ ...current, [entry.rating]: Math.max(0, current[entry.rating] - 1) }));
    setReviewed((value) => Math.max(0, value - 1));
    setIndex(Math.min(entry.originalIndex, cards.length));
    setRevealed(true);
    setUrl(entry.card, true);
    if (message) notify({ title: translate("Review restored"), description: message, tone: "error" });
  }, [cards.length, notify, setUrl, translate]);

  const removePending = useCallback((token: string) => {
    setPending((current) => current.filter((item) => item.token !== token));
    const timer = timers.current.get(token);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(token);
  }, []);

  const commitReview = useCallback(async (entry: PendingReview) => {
    if (!navigator.onLine) return;
    try {
      await request(`/flashcards/cards/${entry.card.id}/review`, { method: "POST", body: { rating: entry.rating } });
      removePending(entry.token);
    } catch (cause) {
      removePending(entry.token);
      restoreReview(entry, cause instanceof Error ? cause.message : translate("The review could not be saved."));
    }
  }, [removePending, request, restoreReview, translate]);

  const undoReview = useCallback((token: string) => {
    const entry = pendingRef.current.find((item) => item.token === token);
    if (!entry) return;
    removePending(token);
    restoreReview(entry);
    notify({ title: translate("Review undone"), description: translate("The card is back in your queue."), tone: "info", duration: 2500 });
  }, [notify, removePending, restoreReview, translate]);

  useEffect(() => {
    if (!online) return;
    for (const entry of pending) {
      if (timers.current.has(entry.token)) continue;
      const remaining = Math.max(0, entry.createdAt + REVIEW_UNDO_MS - Date.now());
      const timer = window.setTimeout(() => { timers.current.delete(entry.token); void commitReview(entry); }, remaining);
      timers.current.set(entry.token, timer);
    }
  }, [commitReview, online, pending]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);

  const card = cards[index];
  const progress = initialCount ? Math.min(100, Math.round(reviewed / initialCount * 100)) : 100;
  const difficult = ratings.VERY_HARD + ratings.HARD;
  const confident = ratings.GOOD + ratings.EASY;

  const selectCard = useCallback((nextIndex: number) => {
    const next = Math.max(0, Math.min(cards.length - 1, nextIndex));
    setIndex(next);
    setRevealed(false);
    setDragX(0);
    if (cards[next]) setUrl(cards[next]);
  }, [cards, setUrl]);

  const rate = useCallback((rating: Rating) => {
    if (!card || paused) return;
    const entry: PendingReview = { token: crypto.randomUUID(), card, rating, createdAt: Date.now(), originalIndex: index };
    const remaining = cards.filter((item) => item.id !== card.id);
    setPending((current) => [...current, entry]);
    setRatings((current) => ({ ...current, [rating]: current[rating] + 1 }));
    setReviewed((value) => value + 1);
    setCards(remaining);
    setIndex(0);
    setRevealed(false);
    setUrl(remaining[0] || null, true);
    notify({
      title: translate("Review queued"),
      description: translate(online ? "It will sync after the undo window closes." : "It is saved locally and will sync when you reconnect."),
      tone: "success",
      duration: REVIEW_UNDO_MS,
      actionLabel: translate("Undo"),
      onAction: () => undoReview(entry.token),
    });
  }, [card, cards, index, notify, online, paused, setUrl, translate, undoReview]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))) return;
      if (event.key.toLowerCase() === "p") { event.preventDefault(); setPaused((value) => !value); return; }
      if (!card || paused) return;
      if (event.code === "Space") { event.preventDefault(); setRevealed((value) => !value); }
      else if (event.key === "ArrowRight") { event.preventDefault(); selectCard(index + 1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); selectCard(index - 1); }
      else if (revealed && numberRatings[event.key]) { event.preventDefault(); rate(numberRatings[event.key]); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [card, index, paused, rate, revealed, selectCard]);

  function pointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (paused) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    swiped.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!pointerStart.current || paused) return;
    const dx = event.clientX - pointerStart.current.x;
    const dy = event.clientY - pointerStart.current.y;
    if (Math.abs(dx) > Math.abs(dy)) setDragX(Math.max(-120, Math.min(120, dx)));
  }
  function pointerUp() {
    if (!pointerStart.current || paused) return;
    const dx = dragX;
    pointerStart.current = null;
    if (Math.abs(dx) >= 65) { swiped.current = true; selectCard(index + (dx < 0 ? 1 : -1)); }
    setDragX(0);
  }

  function shuffleQueue() {
    setCards((current) => {
      if (current.length < 2) return current;
      const selected = current[index];
      const rest = current.filter((item) => item.id !== selected.id);
      for (let cursor = rest.length - 1; cursor > 0; cursor -= 1) {
        const swap = Math.floor(Math.random() * (cursor + 1));
        [rest[cursor], rest[swap]] = [rest[swap], rest[cursor]];
      }
      return [selected, ...rest];
    });
    setIndex(0);
    notify({ title: translate("Queue shuffled"), description: translate("The current card stayed in place."), tone: "info", duration: 1800 });
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await focusRef.current?.requestFullscreen();
    } catch (cause) {
      notify({ title: translate("Fullscreen unavailable"), description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  async function startOver() {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
    try { localStorage.removeItem(sessionKey); } catch { /* best-effort */ }
    setReviewed(0); setPending([]); setRatings(emptyRatings()); setElapsedMs(0); setStartedAt(Date.now()); setPaused(false); setInitialCount(0); completionAnnounced.current = false;
    await load();
  }

  const toolbar = <div className="flashcard-session-toolbar" aria-label={translate("Review session controls")}>
    <span className="flashcard-session-clock"><FiClock /> {formatDuration(elapsedMs)}</span>
    <button type="button" onClick={() => setPaused((value) => !value)}>{paused ? <FiPlay /> : <FiPause />} {translate(paused ? "Resume" : "Pause")}</button>
    <button type="button" disabled={cards.length < 2 || paused} onClick={shuffleQueue}><FiShuffle /> {translate("Shuffle")}</button>
    <button type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? <FiMinimize2 /> : <FiMaximize2 />} {translate(fullscreen ? "Exit focus" : "Focus")}</button>
    <button type="button" onClick={() => void startOver()}><FiRotateCcw /> {translate("Start over")}</button>
  </div>;

  return <ProductShell search={translate("Search flashcards or lectures")}><main className="pp-page flashcards-page">
    <div className="pp-title hero"><div><small className="page-eyebrow">{translate("SPACED REPETITION")}</small><h1>{translate("Flashcards")}</h1><p>{translate("Review instructor-published cards when they become due.")}</p></div><div><div className="keyboard-hints" aria-label={translate("Keyboard and touch shortcuts")}><span>{translate("Space · Flip")}</span><span>{translate("← → · Navigate")}</span><span>{translate("Swipe · Navigate")}</span><span>{translate("1–4 · Rate")}</span><span>{translate("P · Pause")}</span></div>{toolbar}</div></div>
    {!online && <p className="offline-notice" role="status"><FiWifiOff /> {translate("Offline reviews stay on this device and sync when your connection returns.")}</p>}
    {pending.length > 0 && <p className="pending-review-notice" role="status"><FiRotateCcw /> {locale === "ar" ? `${pending.length} مراجعة بانتظار انتهاء مهلة التراجع أو مزامنة الشبكة.` : `${pending.length} review${pending.length === 1 ? "" : "s"} waiting for the Undo window or network sync.`}</p>}
    {error && <p className="form-error" role="alert">{error} <button onClick={() => void load()}>{translate("Retry")}</button></p>}

    {loading ? <PageSkeleton variant="workspace" label={translate("Loading your review queue")} /> : !card ? <Panel className="flashcard-session-report">
      <FiAward />
      <small className="page-eyebrow">{translate("SESSION REPORT")}</small>
      <h2>{translate(pending.length ? "Visible queue complete — syncing reviews" : reviewed ? "Review session complete" : "You are caught up")}</h2>
      <p>{reviewed ? (locale === "ar" ? `راجعت ${reviewed} بطاقة خلال ${formatDuration(elapsedMs)}.` : `You reviewed ${reviewed} card${reviewed === 1 ? "" : "s"} in ${formatDuration(elapsedMs)}.`) : translate("No flashcards are due right now.")}</p>
      <div className="flashcard-report-metrics"><div><b>{reviewed}</b><span>{translate("Reviewed")}</span></div><div><b>{confident}</b><span>{translate("Good or Easy")}</span></div><div><b>{difficult}</b><span>{translate("Again or Hard")}</span></div><div><b>{formatDuration(elapsedMs)}</b><span>{translate("Session time")}</span></div></div>
      <Progress value={progress} />
      <p>{translate(pending.length ? "The backend will calculate each next-review date after the queued ratings sync." : "Your next due dates are calculated from the ratings saved by the spaced-repetition scheduler.")}</p>
      <div className="flashcard-report-actions"><button className="pp-button secondary" type="button" onClick={() => void load()}><FiRefreshCw /> {translate("Refresh queue")}</button><button className="pp-button" type="button" onClick={() => void startOver()}><FiRotateCcw /> {translate("Start a fresh session")}</button></div>
    </Panel> : <div ref={focusRef} className={`flashcards-layout connected ${fullscreen ? "flashcard-focus-mode" : ""}`}>
      <aside className="deck-sidebar"><div className="deck-sidebar-head"><span><b>{translate("DUE QUEUE")}</b><small>{locale === "ar" ? `${cards.length} بطاقة متبقية` : `${cards.length} cards remaining`}</small></span></div>{cards.map((item, itemIndex) => <button className={index === itemIndex ? "active" : ""} onClick={() => selectCard(itemIndex)} key={item.id}><span><small data-academic-content>{item.deck.course?.courseName || translate("Course")}</small><b data-academic-content>{item.deck.title}</b><em data-academic-content>{item.title}</em></span></button>)}</aside>

      <section className={`review-workspace ${paused ? "session-paused" : ""}`}>
        {paused && <div className="flashcard-pause-overlay"><div><FiPause /><h2>{translate("Session paused")}</h2><p>{translate("Your position, timer, pending reviews, and rating totals are saved on this device.")}</p><button className="pp-button" type="button" onClick={() => setPaused(false)}><FiPlay /> {translate("Resume session")}</button></div></div>}
        <div className="review-heading"><div><small data-academic-content>{card.deck.lecture?.week?.title || translate("Instructor deck")}</small><h2 data-academic-content>{card.deck.title}</h2><p data-academic-content>{card.deck.lecture?.title || card.title}</p></div><div><b>{reviewed}</b><small>{translate("reviewed now")}</small></div></div>
        <div className="flashcard-session-progress"><progress value={reviewed} max={Math.max(initialCount, reviewed + cards.length)} /><span>{translate(`${progress}% complete`)}</span></div>
        <button className={`study-card single-face ${revealed ? "showing-back" : "showing-front"} ${dragX ? "is-dragging" : ""}`} style={{ transform: `translateX(${dragX}px) rotate(${dragX / 30}deg)` }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { pointerStart.current = null; setDragX(0); }} onClick={() => { if (paused) return; if (swiped.current) { swiped.current = false; return; } setRevealed((value) => !value); }} aria-pressed={revealed} disabled={paused}><div className="study-card-inner"><div className={`card-face ${revealed ? "card-back" : "card-front"}`}>{revealed ? <><small>{translate("BACK · EXPLANATION")}</small><p data-academic-content>{card.backContent}</p>{card.explanation && <p data-academic-content>{card.explanation}</p>}<span>{translate("Click or press Space to see the front")}</span></> : <><small>{translate("FRONT")}</small><FiBookOpen /><h2 data-academic-content>{card.frontContent}</h2><span>{translate("Click, press Space, or swipe to navigate")}</span></>}</div></div></button>
        {revealed && <div className="review-rating"><p>{translate("How well did you remember?")}</p><button onClick={() => rate("VERY_HARD")} className="again" disabled={paused}><b>1 · {translate("Again")}</b></button><button onClick={() => rate("HARD")} disabled={paused}><b>2 · {translate("Hard")}</b></button><button onClick={() => rate("GOOD")} className="good" disabled={paused}><b>3 · {translate("Good")}</b></button><button onClick={() => rate("EASY")} disabled={paused}><b>4 · {translate("Easy")}</b></button></div>}
      </section>

      <aside className="flashcard-insights"><Panel title={translate("Today’s progress")}><div className="readiness-ring">{reviewed}<small>{translate("reviewed")}</small></div><Progress value={progress} /></Panel><Panel title={translate("Session breakdown")}><p><FiCheck /> {locale === "ar" ? `${confident} مراجعة واثقة` : `${confident} confident reviews`}</p><p><FiRefreshCw /> {locale === "ar" ? `${difficult} بطاقة تحتاج تعزيزًا` : `${difficult} cards need reinforcement`}</p><p><FiClock /> {formatDuration(elapsedMs)} {translate("focused time")}</p></Panel><Panel title={translate("How review works")}><p><FiRefreshCw /> {translate("Ratings are queued locally for five seconds.")}</p><p>{translate("Undo restores the card before the backend schedule changes.")}</p><p>{translate("Offline reviews resume automatically after reconnection.")}</p></Panel></aside>
    </div>}
  </main></ProductShell>;
}