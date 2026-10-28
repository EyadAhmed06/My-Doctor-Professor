"use client";

import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

/** Bounded in-tab undo/redo for local importer edits.
 * Successful server publication is never undone by this history.
 */
export function useEssayReviewHistory<T>(initial: T[], maxHistory = 30): {
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  resetItems: (items: T[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
} {
  const [items, updateItems] = useState<T[]>(initial);
  const currentRef = useRef(items);
  const pastRef = useRef<T[][]>([]);
  const futureRef = useRef<T[][]>([]);
  const [availability, setAvailability] = useState({ canUndo: false, canRedo: false });

  const setItems = useCallback<Dispatch<SetStateAction<T[]>>>((action) => {
    const previous = currentRef.current;
    const next = typeof action === "function"
      ? (action as (previous: T[]) => T[])(previous) : action;
    if (Object.is(previous, next)) return;
    pastRef.current = [...pastRef.current.slice(-maxHistory + 1), previous];
    futureRef.current = [];
    currentRef.current = next;
    updateItems(next);
    setAvailability({canUndo: pastRef.current.length > 0, canRedo: false});
  }, [maxHistory]);

  const resetItems = useCallback((next: T[]) => {
    pastRef.current = [];
    futureRef.current = [];
    currentRef.current = next;
    updateItems(next);
    setAvailability({canUndo: false, canRedo: false});
  }, []);

  const undo = useCallback(() => {
    const previous = pastRef.current.pop();
    if (!previous) return;
    futureRef.current.push(currentRef.current);
    currentRef.current = previous;
    updateItems(previous);
    setAvailability({canUndo: pastRef.current.length > 0, canRedo: futureRef.current.length > 0});
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(currentRef.current);
    currentRef.current = next;
    updateItems(next);
    setAvailability({canUndo: pastRef.current.length > 0, canRedo: futureRef.current.length > 0});
  }, []);

  return { items, setItems, resetItems, undo, redo,
    ...availability };
}
