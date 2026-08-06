"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiCheck, FiCheckSquare, FiSquare, FiTrash2, FiX } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { EmptyState, ErrorState, PageSkeleton } from "./async-state";
import { ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";

type Notification = {
  id: string;
  title: string;
  message: string;
  target_url: string | null;
  notification_type: string;
  status: "READ" | "UNREAD";
  created_at: string;
  creator: { id: string; full_name: string } | null;
};

type Page<T> = { data: T[]; page: number; limit: number; total: number; total_pages: number };
type Filter = "ALL" | "UNREAD";

function inboxGroup(dateValue: string) {
  const date = new Date(dateValue);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (itemDay === today) return "Today";
  if (today - itemDay < 7 * 86400000) return "This week";
  return "Earlier";
}

export function ConnectedNotificationsPage() {
  const { request } = useAuth();
  const { notify } = useUx();
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteTimers = useRef(new Map<string, number>());
  const swipeStart = useRef<{ id: string; x: number; y: number } | null>(null);
  const signalChanged = useCallback(() => window.dispatchEvent(new Event("mdp:notifications-changed")), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems((await request<Page<Notification>>("/notifications?limit=100")).data);
      setSelected(new Set());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void load(), 0);
    const activeDeleteTimers = deleteTimers.current;
    return () => {
      window.clearTimeout(loadTimer);
      for (const timer of activeDeleteTimers.values()) window.clearTimeout(timer);
      activeDeleteTimers.clear();
    };
  }, [load]);

  async function read(item: Notification) {
    if (item.status === "READ") return;
    setItems((current) => current.map((value) => value.id === item.id ? { ...value, status: "READ" } : value));
    signalChanged();
    try {
      await request(`/notifications/${item.id}`, { method: "PUT" });
    } catch (cause) {
      setItems((current) => current.map((value) => value.id === item.id ? { ...value, status: "UNREAD" } : value));
      signalChanged();
      notify({ title: "Could not mark notification as read", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  async function readAll() {
    const previous = items;
    setItems((current) => current.map((value) => ({ ...value, status: "READ" })));
    signalChanged();
    try {
      await request("/notifications/mark-read", { method: "PUT" });
      notify({ title: "Notifications marked as read", tone: "success", duration: 2500 });
    } catch (cause) {
      setItems(previous);
      signalChanged();
      notify({ title: "Could not mark all as read", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  function restoreNotifications(removed: Notification[], indexes: Map<string, number>) {
    setItems((current) => {
      const next = [...current];
      for (const item of [...removed].sort((left, right) => (indexes.get(left.id) || 0) - (indexes.get(right.id) || 0))) {
        if (next.some((value) => value.id === item.id)) continue;
        next.splice(Math.min(indexes.get(item.id) || 0, next.length), 0, item);
      }
      return next;
    });
    signalChanged();
  }

  function removeMany(targets: Notification[]) {
    if (!targets.length) return;
    const ids = new Set(targets.map((item) => item.id));
    const indexes = new Map(targets.map((item) => [item.id, items.findIndex((value) => value.id === item.id)]));
    setItems((current) => current.filter((value) => !ids.has(value.id)));
    setSelected(new Set());
    signalChanged();

    const undo = () => {
      for (const item of targets) {
        const timer = deleteTimers.current.get(item.id);
        if (timer) window.clearTimeout(timer);
        deleteTimers.current.delete(item.id);
      }
      restoreNotifications(targets, indexes);
    };

    notify({
      title: targets.length === 1 ? "Notification removed" : `${targets.length} notifications removed`,
      description: "Deletion will be finalized after the undo window closes.",
      tone: "info",
      duration: 5000,
      actionLabel: "Undo",
      onAction: undo,
    });

    for (const item of targets) {
      const timer = window.setTimeout(async () => {
        deleteTimers.current.delete(item.id);
        try {
          await request(`/notifications/${item.id}`, { method: "DELETE" });
        } catch (cause) {
          restoreNotifications([item], indexes);
          notify({ title: "Delete failed", description: cause instanceof Error ? cause.message : "The notification was restored.", tone: "error" });
        }
      }, 5000);
      deleteTimers.current.set(item.id, timer);
    }
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function markSelectedRead() {
    const targets = items.filter((item) => selected.has(item.id) && item.status === "UNREAD");
    if (!targets.length) return;
    const ids = new Set(targets.map((item) => item.id));
    setBusy(true);
    setItems((current) => current.map((item) => ids.has(item.id) ? { ...item, status: "READ" } : item));
    signalChanged();
    try {
      await Promise.all(targets.map((item) => request(`/notifications/${item.id}`, { method: "PUT" })));
      setSelected(new Set());
      notify({ title: `${targets.length} selected notification${targets.length === 1 ? "" : "s"} marked read`, tone: "success" });
    } catch (cause) {
      setItems((current) => current.map((item) => ids.has(item.id) ? { ...item, status: "UNREAD" } : item));
      signalChanged();
      notify({ title: "Bulk update failed", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => filter === "UNREAD" ? items.filter((item) => item.status === "UNREAD") : items, [filter, items]);
  const grouped = useMemo(() => visible.reduce<Record<string, Notification[]>>((result, item) => {
    const key = inboxGroup(item.created_at);
    (result[key] ??= []).push(item);
    return result;
  }, {}), [visible]);
  const unread = items.filter((item) => item.status === "UNREAD").length;
  const allVisibleSelected = visible.length > 0 && visible.every((item) => selected.has(item.id));

  return <ProductShell><main className="pp-page notifications-complete-page">
    <div className="pp-title"><div><h1>Notifications</h1><p>Your personal notification inbox, with {unread} unread.</p></div><button className="pp-button secondary" disabled={!unread || busy} onClick={() => void readAll()}><FiCheck /> Mark all read</button></div>

    <div className="notification-filters" role="group" aria-label="Notification filter">
      <button className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}>All <span>{items.length}</span></button>
      <button className={filter === "UNREAD" ? "active" : ""} onClick={() => setFilter("UNREAD")}>Unread <span>{unread}</span></button>
      {visible.length > 0 && <button onClick={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((item) => item.id)))}>{allVisibleSelected ? <FiCheckSquare /> : <FiSquare />} {allVisibleSelected ? "Clear selection" : "Select visible"}</button>}
    </div>

    {selected.size > 0 && <section className="notification-bulk-bar" aria-label="Bulk notification actions"><b>{selected.size} selected</b><button type="button" disabled={busy} onClick={() => void markSelectedRead()}><FiCheck /> Mark read</button><button type="button" disabled={busy} onClick={() => removeMany(items.filter((item) => selected.has(item.id)))}><FiTrash2 /> Delete</button><button type="button" onClick={() => setSelected(new Set())}><FiX /> Cancel</button></section>}

    {loading ? <PageSkeleton variant="list" label="Loading notifications" /> : error ? <ErrorState description={error} onRetry={() => void load()} /> : !visible.length ? <EmptyState title={filter === "UNREAD" ? "No unread notifications" : "You are all caught up"} description={filter === "UNREAD" ? "New messages will appear here when they arrive." : "No notifications exist for this account."} /> : <div className="notification-groups">{["Today", "This week", "Earlier"].filter((group) => grouped[group]?.length).map((group) => <section key={group}><h2>{group}</h2><div className="notebook-rows">{grouped[group].map((item) => <article
      className={`pp-panel notification-row ${item.status === "UNREAD" ? "active" : ""} ${selected.has(item.id) ? "selected" : ""}`}
      key={item.id}
      onClick={() => void read(item)}
      onPointerDown={(event) => { swipeStart.current = { id: item.id, x: event.clientX, y: event.clientY }; }}
      onPointerUp={(event) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (!start || start.id !== item.id) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (dx < -75 && Math.abs(dx) > Math.abs(dy)) removeMany([item]);
      }}
    >
      <button className="notification-select" type="button" aria-label={`${selected.has(item.id) ? "Deselect" : "Select"} ${item.title}`} onClick={(event) => { event.stopPropagation(); toggleSelected(item.id); }}>{selected.has(item.id) ? <FiCheckSquare /> : <FiSquare />}</button>
      <div className="notification-row-content"><small>{item.notification_type.replaceAll("_", " ")} · {new Date(item.created_at).toLocaleString()}</small><h2>{item.title}</h2><p>{item.message}</p>{item.creator && <small>From {item.creator.full_name}</small>}<div>{item.target_url ? <Link className="pp-button secondary" href={item.target_url} onClick={() => void read(item)}>Open</Link> : <span className="notification-no-target">No linked destination</span>}<button className="pp-button secondary" onClick={(event) => { event.stopPropagation(); removeMany([item]); }}><FiTrash2 /> Delete</button></div></div>
    </article>)}</div></section>)}</div>}
  </main></ProductShell>;
}