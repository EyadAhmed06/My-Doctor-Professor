"use client";

import { ApiError } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FiAward,
  FiBookOpen,
  FiGrid,
  FiMaximize2,
  FiMinimize2,
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
import "./flashcards-simple.css";

type Deck = {
  id: string;
  title: string;
  lecture?: { id?: string; title?: string; week?: { title?: string; weekNumber?: number } };
  course?: { id?: string; courseName?: string };
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
type PendingReview = { token: string; card: Card; rating: Rating; createdAt: number; originalIndex: number };
type StoredSession = {
  reviewed: number;
  pending: PendingReview[];
  reviewedRatings: Record<string, Rating>;
  reviewedCards: Record<string, Card>;
};

const numberRatings: Record<string, Rating> = { "1": "VERY_HARD", "2": "HARD", "3": "GOOD", "4": "EASY" };
const REVIEW_UNDO_MS = 5000;
const ratingLabels: Record<Rating, string> = {
  VERY_HARD: "Reviewed · Again",
  HARD: "Reviewed · Hard",
  GOOD: "Reviewed · Good",
  EASY: "Reviewed · Easy",
};

function orderByRating(list: Card[], ratings: Record<string, Rating>): Card[] {
  const hard: Card[] = [];
  const neutral: Card[] = [];
  const good: Card[] = [];
  const easy: Card[] = [];
  for (const item of list) {
    const rating = ratings[item.id];
    if (rating === "VERY_HARD" || rating === "HARD") hard.push(item);
    else if (rating === "GOOD") good.push(item);
    else if (rating === "EASY") easy.push(item);
    else neutral.push(item);
  }
  return [...hard, ...neutral, ...good, ...easy];
}

export function ConnectedFlashcardsPage() {
  const { user, request } = useAuth();
  const { translate, locale } = useLocale();
  const { startNavigation, notify, celebrate } = useUx();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedCourseId = searchParams.get("course");
  const requestedCard = searchParams.get("card");
  const requestedLecture = searchParams.get("lecture");
  const reviewMode = Boolean(selectedCourseId && (requestedCard || requestedLecture));

  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [cards, setCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [reviewedRatings, setReviewedRatings] = useState<Record<string, Rating>>({});
  const [reviewedCards, setReviewedCards] = useState<Record<string, Card>>({});
  const [dragX, setDragX] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const pendingRef = useRef<PendingReview[]>([]);
  const timers = useRef(new Map<string, number>());
  const committing = useRef(new Set<string>());
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const completionAnnounced = useRef(false);
  const focusRef = useRef<HTMLDivElement>(null);
  const sessionKey = `mdp-flashcard-session:${user?.id || "anonymous"}:${selectedCourseId || "none"}`;

  const setUrl = useCallback((card: Card | null, replace = false) => {
    const params = new URLSearchParams(searchParams.toString());
    if (card) {
      params.set("card", card.id);
      if (card.deck.lecture?.id) params.set("lecture", card.deck.lecture.id);
      else params.delete("lecture");
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

  const selectCourse = useCallback((courseId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (courseId) params.set("course", courseId);
    else params.delete("course");
    params.delete("card");
    params.delete("lecture");
    const suffix = params.toString();
    startNavigation();
    router.push(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
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
      const first = await request<Page<Card>>(`/flashcards/cards/mine?course_id=${encodeURIComponent(selectedCourseId)}&limit=100`);
      const fetched = [...first.data];
      const totalPages = Math.min(first.total_pages, 20);
      for (let page = 2; page <= totalPages; page += 1) {
        const next = await request<Page<Card>>(`/flashcards/cards/mine?course_id=${encodeURIComponent(selectedCourseId)}&limit=100&page=${page}`);
        fetched.push(...next.data);
      }
      const storedRatings = session?.reviewedRatings || {};
      const storedCards = session?.reviewedCards || {};

      const byId = new Map<string, Card>(fetched.map((item) => [item.id, item]));
      for (const id of Object.keys(storedRatings)) {
        if (!byId.has(id) && storedCards[id]) byId.set(id, storedCards[id]);
      }
      const combined = [...byId.values()];
      const restoredRatings: Record<string, Rating> = {};
      const restoredCards: Record<string, Card> = {};
      for (const item of combined) {
        if (storedRatings[item.id]) {
          restoredRatings[item.id] = storedRatings[item.id];
          restoredCards[item.id] = item;
        }
      }

      setReviewed(session?.reviewed || 0);
      setReviewedRatings(restoredRatings);
      setReviewedCards(restoredCards);
      setPending((session?.pending || []).filter((item) => byId.has(item.card.id)));
      setCards(orderByRating(combined, restoredRatings));
      completionAnnounced.current = false;
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : translate("Unable to load flashcards."));
    } finally {
      setLoading(false);
    }
  }, [readSession, request, translate]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    pendingRef.current = pending;
    try {
      localStorage.setItem(sessionKey, JSON.stringify({
        reviewed,
        pending,
        reviewedRatings,
        reviewedCards,
      } satisfies StoredSession));
    } catch { /* best-effort */ }
  }, [pending, reviewed, reviewedCards, reviewedRatings, sessionKey]);

  useEffect(() => {
    if (loading || !cards.length) return;
    if (!reviewMode) {
      setIndex(0);
      setRevealed(false);
      return;
    }

    const cardIndex = requestedCard ? cards.findIndex((item) => item.id === requestedCard) : -1;
    const lectureIndex = requestedLecture ? cards.findIndex((item) => item.deck.lecture?.id === requestedLecture) : -1;
    const targetIndex = cardIndex >= 0 ? cardIndex : lectureIndex >= 0 ? lectureIndex : 0;
    setIndex(targetIndex);
    setRevealed(false);
    if (requestedCard !== cards[targetIndex]?.id) setUrl(cards[targetIndex], true);
  }, [cards, loading, requestedCard, requestedLecture, reviewMode, setUrl]);

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
    if (loading || !cards.length || pending.length || completionAnnounced.current) return;
    if (!cards.every((item) => reviewedRatings[item.id])) return;
    completionAnnounced.current = true;
    celebrate({
      id: "flashcard-session-complete",
      title: translate("Review session complete"),
      description: locale === "ar" ? `راجعت ${reviewed} بطاقة وتم حفظ المراجعات.` : `${reviewed} cards reviewed and synced.`,
      points: Math.min(100, Math.max(10, reviewed * 2)),
    });
  }, [cards, celebrate, loading, locale, pending.length, reviewed, reviewedRatings, translate]);

  const restoreReview = useCallback((entry: PendingReview, message?: string) => {
    setReviewedRatings((current) => {
      if (!(entry.card.id in current)) return current;
      const next = { ...current };
      delete next[entry.card.id];
      return next;
    });
    setReviewedCards((current) => {
      if (!(entry.card.id in current)) return current;
      const next = { ...current };
      delete next[entry.card.id];
      return next;
    });
    setReviewed((value) => Math.max(0, value - 1));
    setCards((current) => {
      const withoutCard = current.filter((item) => item.id !== entry.card.id);
      const insertAt = Math.min(entry.originalIndex, withoutCard.length);
      return [...withoutCard.slice(0, insertAt), entry.card, ...withoutCard.slice(insertAt)];
    });
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
    if (!navigator.onLine || committing.current.has(entry.token)) return;
    committing.current.add(entry.token);
    try {
      await request(`/flashcards/cards/${entry.card.id}/review`, { method: "POST", body: { rating: entry.rating } });
      removePending(entry.token);
      celebrate({
        id: "flashcard-first-synced",
        title: translate("Recall before recognition"),
        description: translate("Your first spaced-repetition review was saved to your learning history."),
        points: 25,
      });
    } catch (cause) {
      const alreadySaved = cause instanceof ApiError && cause.status === 409 && /not due for review yet/i.test(cause.message);
      if (alreadySaved) {
        removePending(entry.token);
        return;
      }
      removePending(entry.token);
      restoreReview(entry, cause instanceof Error ? cause.message : translate("The review could not be saved."));
    } finally {
      committing.current.delete(entry.token);
    }
  }, [celebrate, removePending, request, restoreReview, translate]);

  const undoReview = useCallback((token: string) => {
    const entry = pendingRef.current.find((item) => item.token === token);
    if (!entry || committing.current.has(token)) return;
    removePending(token);
    restoreReview(entry);
    notify({ title: translate("Review undone"), description: translate("The card is back in your queue."), tone: "info", duration: 2500 });
  }, [notify, removePending, restoreReview, translate]);

  useEffect(() => {
    if (!online) return;
    for (const entry of pending) {
      if (timers.current.has(entry.token) || committing.current.has(entry.token)) continue;
      const remaining = Math.max(0, entry.createdAt + REVIEW_UNDO_MS - Date.now());
      const timer = window.setTimeout(() => {
        timers.current.delete(entry.token);
        void commitReview(entry);
      }, remaining);
      timers.current.set(entry.token, timer);
    }
  }, [commitReview, online, pending]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);

  const card = cards[index];
  const distinctReviewed = Object.keys(reviewedRatings).length;
  const progress = cards.length ? Math.min(100, Math.round(distinctReviewed / cards.length * 100)) : 100;

  const selectCard = useCallback((nextIndex: number) => {
    const next = Math.max(0, Math.min(cards.length - 1, nextIndex));
    setIndex(next);
    setRevealed(false);
    setDragX(0);
    if (cards[next]) setUrl(cards[next]);
  }, [cards, setUrl]);

  const rate = useCallback((rating: Rating) => {
    if (!card) return;
    const entry: PendingReview = { token: crypto.randomUUID(), card, rating, createdAt: Date.now(), originalIndex: index };
    const rest = cards.filter((item) => item.id !== card.id);
    const upcoming = rest[Math.min(index, rest.length - 1)] ?? null;
    const insertAt = rating === "VERY_HARD" || rating === "HARD"
      ? 0
      : rating === "GOOD"
        ? Math.min(rest.length, Math.ceil(rest.length / 2))
        : rest.length;
    const reordered = [...rest.slice(0, insertAt), card, ...rest.slice(insertAt)];
    setPending((current) => [...current, entry]);
    setReviewed((value) => value + 1);
    setReviewedRatings((current) => ({ ...current, [card.id]: rating }));
    setReviewedCards((current) => ({ ...current, [card.id]: card }));
    setCards(reordered);
    setIndex(Math.max(0, upcoming ? reordered.findIndex((item) => item.id === upcoming.id) : 0));
    setRevealed(false);
    setDragX(0);
    setUrl(upcoming || reordered[0] || null, true);
    notify({
      title: translate("Review queued"),
      description: translate(online ? "It will sync after the undo window closes." : "It is saved locally and will sync when you reconnect."),
      tone: "success",
      duration: REVIEW_UNDO_MS,
      actionLabel: translate("Undo"),
      onAction: () => undoReview(entry.token),
    });
  }, [card, cards, index, notify, online, setUrl, translate, undoReview]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))) return;
      if (!reviewMode || !card) return;
      if (event.code === "Space") { event.preventDefault(); setRevealed((value) => !value); }
      else if (event.key === "ArrowRight") { event.preventDefault(); selectCard(index + 1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); selectCard(index - 1); }
      else if (revealed && numberRatings[event.key]) { event.preventDefault(); rate(numberRatings[event.key]); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [card, index, rate, revealed, reviewMode, selectCard]);

  function pointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    pointerStart.current = { x: event.clientX, y: event.clientY };
    swiped.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!pointerStart.current) return;
    const dx = event.clientX - pointerStart.current.x;
    const dy = event.clientY - pointerStart.current.y;
    if (Math.abs(dx) > Math.abs(dy)) setDragX(Math.max(-120, Math.min(120, dx)));
  }

  function pointerUp() {
    if (!pointerStart.current) return;
    const dx = dragX;
    pointerStart.current = null;
    if (Math.abs(dx) >= 65) {
      swiped.current = true;
      selectCard(index + (dx < 0 ? 1 : -1));
    }
    setDragX(0);
  }

  function shuffleQueue() {
    setCards((current) => {
      if (current.length < 2) return current;
      if (!reviewMode) {
        const shuffled = [...current];
        for (let cursor = shuffled.length - 1; cursor > 0; cursor -= 1) {
          const swap = Math.floor(Math.random() * (cursor + 1));
          [shuffled[cursor], shuffled[swap]] = [shuffled[swap], shuffled[cursor]];
        }
        return shuffled;
      }
      const selected = current[index];
      const rest = current.filter((item) => item.id !== selected.id);
      for (let cursor = rest.length - 1; cursor > 0; cursor -= 1) {
        const swap = Math.floor(Math.random() * (cursor + 1));
        [rest[cursor], rest[swap]] = [rest[swap], rest[cursor]];
      }
      return [selected, ...rest];
    });
    if (reviewMode) setIndex(0);
    notify({ title: translate("Queue shuffled"), tone: "info", duration: 1800 });
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
    committing.current.clear();
    try { localStorage.removeItem(sessionKey); } catch { /* best-effort */ }
    setReviewed(0);
    setPending([]);
    setReviewedRatings({});
    setReviewedCards({});
    completionAnnounced.current = false;
    setUrl(null, true);
    await load();
  }

  const reviewToolbar = <div className="flashcard-session-toolbar" aria-label={translate("Review controls")}>
    <button type="button" onClick={() => setUrl(null)}><FiGrid /> {translate("Queue")}</button>
    <button type="button" disabled={cards.length < 2} onClick={shuffleQueue}><FiShuffle /> {translate("Shuffle")}</button>
    <button type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? <FiMinimize2 /> : <FiMaximize2 />} {translate(fullscreen ? "Exit focus" : "Focus")}</button>
    <button type="button" onClick={() => void startOver()}><FiRotateCcw /> {translate("Start over")}</button>
  </div>;

  const selectedCourse = courses.find((item) => item.id === selectedCourseId);
  const choosingCourse = !selectedCourseId || (!coursesLoading && !selectedCourse);

  return <ProductShell search={translate("Search flashcards or lectures")}><main className="pp-page flashcards-page flashcards-simplified">
    <div className="pp-title hero flashcards-main-header">
      <div>
        <small className="page-eyebrow">{translate("SPACED REPETITION")}</small>
        <h1>{translate(choosingCourse ? "Choose a course" : reviewMode ? "Flashcard review" : "Flashcards")}</h1>
        <p>{translate(choosingCourse ? "Select one of the courses included in your current bundles." : reviewMode ? "Focus on one card at a time." : "Flashcards for your selected course.")}</p>
      </div>
      <div className="flashcards-header-actions">
        {!choosingCourse && <button className="pp-button secondary" type="button" onClick={() => selectCourse(null)}><FiArrowLeft /> {translate("Change course")}</button>}
        {reviewMode ? <>
          <div className="keyboard-hints" aria-label={translate("Keyboard and touch shortcuts")}>
            <span>{translate("Space · Flip")}</span>
            <span>{translate("← → · Navigate")}</span>
            <span>{translate("Swipe · Navigate")}</span>
            <span>{translate("1–4 · Rate")}</span>
          </div>
          {reviewToolbar}
        </> : <div className="flashcard-queue-actions">
          <button className="pp-button secondary" type="button" disabled={cards.length < 2} onClick={shuffleQueue}><FiShuffle /> {translate("Shuffle")}</button>
          <button className="pp-button secondary" type="button" onClick={() => void load()}><FiRefreshCw /> {translate("Refresh")}</button>
        </div>}
      </div>
    </div>

    {!online && <p className="offline-notice" role="status"><FiWifiOff /> {translate("Offline reviews stay on this device and sync when your connection returns.")}</p>}
    {pending.length > 0 && <p className="pending-review-notice" role="status"><FiRotateCcw /> {locale === "ar" ? `${pending.length} مراجعة بانتظار المزامنة.` : `${pending.length} review${pending.length === 1 ? "" : "s"} waiting to sync.`}</p>}
    {error && <p className="form-error" role="alert">{error} <button onClick={() => void load()}>{translate("Retry")}</button></p>}

    {coursesLoading ? <PageSkeleton variant="workspace" label={translate("Loading your courses")} /> : choosingCourse ? (
      courses.length ? <section className="flashcard-queue-page" aria-label={translate("Choose a course")}>
        <header className="flashcard-queue-heading">
          <div><small className="page-eyebrow">{translate("ENROLLED COURSES")}</small><h2>{translate("Which course do you want to review?")}</h2></div>
          <span>{locale === "ar" ? `${courses.length} مواد` : `${courses.length} courses`}</span>
        </header>
        <div className="flashcard-queue-grid">
          {courses.map((course) => <button className="flashcard-queue-card" type="button" onClick={() => selectCourse(course.id)} key={course.id}>
            <span className="flashcard-queue-icon"><FiBookOpen /></span>
            <small data-academic-content>{course.courseCode}</small>
            <h3 data-academic-content>{course.courseName}</h3>
            <p>{locale === "ar" ? `${course.deckCount} مجموعات · ${course.cardCount} بطاقات` : `${course.deckCount} decks · ${course.cardCount} cards`}</p>
            <footer><span>{translate("Included in your current bundles")}</span><b>{translate("Open course")} →</b></footer>
          </button>)}
        </div>
      </section> : <Panel className="flashcard-session-report"><FiBookOpen /><small className="page-eyebrow">{translate("NO COURSES")}</small><h2>{translate("No flashcard courses are available")}</h2><p>{translate("Enroll in a current bundle with published flashcards to see its courses here.")}</p></Panel>
    ) : loading ? <PageSkeleton variant="workspace" label={translate("Loading your review queue")} /> : !reviewMode ? (
      cards.length ? <section className="flashcard-queue-page" aria-label={translate("Your flashcards")}>
        <header className="flashcard-queue-heading">
          <div><small className="page-eyebrow">{translate("YOUR FLASHCARDS")}</small><h2>{translate("Choose a flashcard")}</h2></div>
          <span>{locale === "ar" ? `${cards.length} بطاقة` : `${cards.length} cards`}</span>
        </header>
        <div className="flashcard-queue-grid">
          {cards.map((item) => {
            const rating = reviewedRatings[item.id];
            return <button className="flashcard-queue-card" type="button" onClick={() => setUrl(item)} key={item.id}>
              <span className="flashcard-queue-icon"><FiBookOpen /></span>
              <small data-academic-content>{item.deck.course?.courseName || translate("Course")}</small>
              <h3 data-academic-content>{item.deck.title}</h3>
              <p data-academic-content>{item.frontContent}</p>
              <footer>
                <span data-academic-content>{item.deck.lecture?.week?.title || item.deck.lecture?.title || item.title}</span>
                {rating ? <b className="flashcard-rated-badge" data-rating={rating.toLowerCase()}>{translate(ratingLabels[rating])}</b> : <b>{translate("Open card")} →</b>}
              </footer>
            </button>;
          })}
        </div>
      </section> : <Panel className="flashcard-session-report">
        <FiAward />
        <small className="page-eyebrow">{translate("QUEUE COMPLETE")}</small>
        <h2>{translate(reviewed ? "Review session complete" : "You are caught up")}</h2>
        <p>{reviewed ? (locale === "ar" ? `راجعت ${reviewed} بطاقة.` : `You reviewed ${reviewed} card${reviewed === 1 ? "" : "s"}.`) : translate("No flashcards are available yet.")}</p>
        <Progress value={progress} />
        <div className="flashcard-report-actions"><button className="pp-button secondary" type="button" onClick={() => void load()}><FiRefreshCw /> {translate("Refresh queue")}</button><button className="pp-button" type="button" onClick={() => void startOver()}><FiRotateCcw /> {translate("Start fresh")}</button></div>
      </Panel>
    ) : !card ? <PageSkeleton variant="workspace" label={translate("Opening flashcard")} /> : <div ref={focusRef} className={`flashcards-review-layout ${fullscreen ? "flashcard-focus-mode" : ""}`}>
      <section className="review-workspace">
        <div className="review-heading">
          <div><small data-academic-content>{card.deck.lecture?.week?.title || translate("Instructor deck")}</small><h2 data-academic-content>{card.deck.title}</h2><p data-academic-content>{card.deck.lecture?.title || card.title}</p></div>
          <div><b>{reviewed}</b><small>{translate("reviewed")}</small></div>
        </div>
        <div className="flashcard-session-progress"><progress value={distinctReviewed} max={cards.length || 1} /><span>{translate(`${progress}% complete`)}</span></div>
        <button
          className={`study-card single-face ${revealed ? "showing-back" : "showing-front"} ${dragX ? "is-dragging" : ""}`}
          style={{ transform: `translateX(${dragX}px) rotate(${dragX / 30}deg)` }}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => { pointerStart.current = null; setDragX(0); }}
          onClick={() => { if (swiped.current) { swiped.current = false; return; } setRevealed((value) => !value); }}
          aria-pressed={revealed}
        >
          <div className="study-card-inner"><div className={`card-face ${revealed ? "card-back" : "card-front"}`}>{revealed ? <><small>{translate("BACK · EXPLANATION")}</small><p data-academic-content>{card.backContent}</p>{card.explanation && <p data-academic-content>{card.explanation}</p>}<span>{translate("Click or press Space to see the front")}</span></> : <><small>{translate("FRONT")}</small><FiBookOpen /><h2 data-academic-content>{card.frontContent}</h2><span>{translate("Click, press Space, or swipe to navigate")}</span></>}</div></div>
        </button>
        {revealed && <div className="review-rating"><p>{translate("How well did you remember?")}</p><button onClick={() => rate("VERY_HARD")} className="again"><b>1 · {translate("Again")}</b></button><button onClick={() => rate("HARD")}><b>2 · {translate("Hard")}</b></button><button onClick={() => rate("GOOD")} className="good"><b>3 · {translate("Good")}</b></button><button onClick={() => rate("EASY")}><b>4 · {translate("Easy")}</b></button></div>}
      </section>

      <aside className="flashcard-review-progress"><Panel title={translate("Today’s progress")}><div className="readiness-ring">{reviewed}<small>{translate("reviewed")}</small></div><Progress value={progress} /></Panel></aside>
    </div>}
  </main></ProductShell>;
}
