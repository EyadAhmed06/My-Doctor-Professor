"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReviewCandidate } from "./essay-import-model";
import { EssayReviewQuestion } from "./essay-review-question";

const ESTIMATED_HEIGHT = 370;
const OVERSCAN = 3;

function firstIntersecting(offsets: number[], threshold: number) {
  let low = 0, high = offsets.length - 2;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (offsets[mid + 1] <= threshold) low = mid + 1;
    else high = mid;
  }
  return low;
}

const MeasuredQuestion = memo(function MeasuredQuestion({
  item, published, onUpdate, onMeasure,
}: {
  item: ReviewCandidate;
  published: boolean;
  onUpdate: (id: string, patch: Partial<ReviewCandidate>) => void;
  onMeasure: (id: string, height: number) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = node.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => onMeasure(item.candidate_id, element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [item.candidate_id, onMeasure]);
  return <div ref={node} className="essay-v2-measured-question">
    <EssayReviewQuestion item={item} published={published} onUpdate={onUpdate}/>
  </div>;
});

/** Windowed question editors with measured variable row heights.
 * Selection and edits live in the parent review state, never inside virtual rows.
 */
export function EssayWindowedQuestionList({
  items, publishedQuestionIds, onUpdate,
}: {
  items: ReviewCandidate[];
  publishedQuestionIds: Set<string>;
  onUpdate: (id: string, patch: Partial<ReviewCandidate>) => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(620);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const viewportRef = useRef<HTMLDivElement>(null);
  const onMeasure = useCallback((id: string, height: number) => {
    const value = Math.max(1, Math.ceil(height));
    setHeights(previous => previous[id] === value ? previous : {...previous, [id]: value});
  }, []);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const resize = () => setViewportHeight(element.clientHeight);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const offsets = useMemo(() => {
    const result = new Array<number>(items.length + 1);
    result[0] = 0;
    for (let i = 0; i < items.length; i++) {
      result[i + 1] = result[i] + (heights[items[i].candidate_id] ?? ESTIMATED_HEIGHT);
    }
    return result;
  }, [items, heights]);
  const start = Math.max(0, firstIntersecting(offsets, Math.max(0, scrollTop)) - OVERSCAN);
  const end = Math.min(items.length, firstIntersecting(offsets, scrollTop + viewportHeight) + OVERSCAN + 1);
  return <div className="essay-v2-windowed-list" ref={viewportRef}
    role="region" aria-label="Scroll through essay questions" tabIndex={0}
    onScroll={event => setScrollTop(event.currentTarget.scrollTop)}>
    <div style={{height: offsets[start]}} aria-hidden="true"/>
    {items.slice(start, end).map(item =>
      <MeasuredQuestion key={item.candidate_id} item={item} published={publishedQuestionIds.has(item.candidate_id)}
        onUpdate={onUpdate} onMeasure={onMeasure}/>)}
    <div style={{height: offsets[items.length] - offsets[end]}} aria-hidden="true"/>
    <div className="sr-only" aria-live="polite">Showing questions {items.length ? start + 1 : 0} through {end} of {items.length}</div>
  </div>;
}
