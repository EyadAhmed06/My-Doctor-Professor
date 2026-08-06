"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FiBookOpen,
  FiCheckSquare,
  FiEdit3,
  FiFileText,
  FiFolder,
  FiPlus,
  FiSearch,
  FiSquare,
  FiStar,
  FiTag,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { EmptyState, PageSkeleton } from "./async-state";
import { ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";

type Collection = { id: string; name: string; color: string; isPinned: boolean; notes: unknown[] };
type Tag = { id: string; name: string; color: string };
type Note = {
  id: string;
  title: string;
  noteType: string;
  content: string;
  collectionId: string | null;
  collection: Collection | null;
  isFavorite: boolean;
  tags: Tag[];
  attachments: unknown[];
  createdAt: string;
  updatedAt: string;
};
type Page<T> = { data: T[]; total: number };
type Sort = "UPDATED_DESC" | "UPDATED_ASC" | "TITLE_ASC" | "TITLE_DESC" | "FAVORITES";
const types = ["ALL", "EXPLANATION", "PERSONAL", "PEARL", "IMAGE", "LINKED_CASE"] as const;
type NoteFilter = (typeof types)[number];

function validFilter(value: string | null): NoteFilter {
  return types.includes(value as NoteFilter) ? value as NoteFilter : "ALL";
}

export function ConnectedNotebookPage() {
  const { request } = useAuth();
  const { startNavigation, notify } = useUx();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedNote = searchParams.get("note");
  const requestedType = validFilter(searchParams.get("type"));
  const requestedCollection = searchParams.get("collection") || "ALL";
  const requestedQuery = searchParams.get("q") || "";
  const [notes, setNotes] = useState<Note[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<NoteFilter>(requestedType);
  const [collection, setCollection] = useState<string>(requestedCollection);
  const [query, setQuery] = useState(requestedQuery);
  const [sort, setSort] = useState<Sort>("UPDATED_DESC");
  const [bulkCollection, setBulkCollection] = useState("");
  const [bulkTag, setBulkTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryTimer = useRef(0);
  const deleteTimer = useRef(0);

  const setUrl = useCallback((updates: { note?: string | null; type?: NoteFilter; collection?: string; q?: string }, replace = false) => {
    const params = new URLSearchParams(searchParams.toString());
    if ("note" in updates) {
      if (updates.note) params.set("note", updates.note);
      else params.delete("note");
    }
    if (updates.type !== undefined) {
      if (updates.type === "ALL") params.delete("type");
      else params.set("type", updates.type);
    }
    if (updates.collection !== undefined) {
      if (updates.collection === "ALL") params.delete("collection");
      else params.set("collection", updates.collection);
    }
    if (updates.q !== undefined) {
      if (updates.q.trim()) params.set("q", updates.q.trim());
      else params.delete("q");
    }
    const suffix = params.toString();
    const href = suffix ? `${pathname}?${suffix}` : pathname;
    startNavigation();
    if (replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }, [pathname, router, searchParams, startNavigation]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [noteRows, collectionRows, tagRows] = await Promise.all([
        request<Page<Note>>("/notebook/notes?limit=100"),
        request<Collection[]>("/notebook/collections"),
        request<Tag[]>("/notebook/tags"),
      ]);
      setNotes(noteRows.data);
      setCollections(collectionRows);
      setTags(tagRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load notebook.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => {
    window.clearTimeout(queryTimer.current);
    window.clearTimeout(deleteTimer.current);
  }, []);
  useEffect(() => {
    setFilter(requestedType);
    setCollection(requestedCollection);
    setQuery(requestedQuery);
  }, [requestedCollection, requestedQuery, requestedType]);
  useEffect(() => {
    if (loading) return;
    const target = notes.find((note) => note.id === requestedNote) || notes[0] || null;
    setSelected(target);
    if (target && requestedNote !== target.id) setUrl({ note: target.id }, true);
  }, [loading, notes, requestedNote, setUrl]);

  const visible = useMemo(() => {
    const result = notes.filter((note) =>
      (filter === "ALL" || note.noteType === filter) &&
      (collection === "ALL" || note.collectionId === collection) &&
      (!query || `${note.title} ${note.content}`.toLowerCase().includes(query.toLowerCase())),
    );
    return [...result].sort((left, right) => {
      if (sort === "FAVORITES") return Number(right.isFavorite) - Number(left.isFavorite) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      if (sort === "TITLE_ASC") return left.title.localeCompare(right.title);
      if (sort === "TITLE_DESC") return right.title.localeCompare(left.title);
      if (sort === "UPDATED_ASC") return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });
  }, [collection, filter, notes, query, sort]);
  const count = (type: string) => type === "ALL" ? notes.length : notes.filter((note) => note.noteType === type).length;
  const allVisibleSelected = visible.length > 0 && visible.every((note) => selectedIds.has(note.id));

  function selectNote(note: Note) {
    setSelected(note);
    setUrl({ note: note.id });
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function chooseFilter(value: NoteFilter) {
    setFilter(value);
    setSelectedIds(new Set());
    setUrl({ type: value }, true);
  }

  function chooseCollection(value: string) {
    setCollection(value);
    setSelectedIds(new Set());
    setUrl({ collection: value }, true);
  }

  function updateQuery(value: string) {
    setQuery(value);
    window.clearTimeout(queryTimer.current);
    queryTimer.current = window.setTimeout(() => setUrl({ q: value }, true), 250);
  }

  async function updateMany(bodyFor: (note: Note) => Record<string, unknown>, success: string) {
    const targets = notes.filter((note) => selectedIds.has(note.id));
    if (!targets.length) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await Promise.all(targets.map((note) => request<Note>(`/notebook/notes/${note.id}`, { method: "PUT", body: bodyFor(note) })));
      const map = new Map(updated.map((note) => [note.id, note]));
      setNotes((current) => current.map((note) => map.get(note.id) || note));
      setSelected((current) => current ? map.get(current.id) || current : current);
      setSelectedIds(new Set());
      notify({ title: success, description: `${targets.length} note${targets.length === 1 ? "" : "s"} updated.`, tone: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update selected notes.");
    } finally {
      setBusy(false);
    }
  }

  function removeMany(targets: Note[]) {
    if (!targets.length) return;
    const targetIds = new Set(targets.map((note) => note.id));
    const previous = notes;
    setNotes((current) => current.filter((note) => !targetIds.has(note.id)));
    setSelectedIds(new Set());
    if (selected && targetIds.has(selected.id)) setSelected(null);
    window.clearTimeout(deleteTimer.current);
    let undone = false;
    const undo = () => {
      undone = true;
      window.clearTimeout(deleteTimer.current);
      setNotes(previous);
      setSelected(targets[0] || null);
      notify({ title: "Deletion cancelled", description: "The selected notes were restored.", tone: "info" });
    };
    notify({
      title: `${targets.length} note${targets.length === 1 ? "" : "s"} queued for deletion`,
      description: "Deletion will be finalized after the undo window closes.",
      tone: "info",
      duration: 5000,
      actionLabel: "Undo",
      onAction: undo,
    });
    deleteTimer.current = window.setTimeout(async () => {
      if (undone) return;
      try {
        await Promise.all(targets.map((note) => request(`/notebook/notes/${note.id}`, { method: "DELETE" })));
        setUrl({ note: null }, true);
      } catch (cause) {
        setNotes(previous);
        setError(cause instanceof Error ? cause.message : "Unable to delete notes.");
      }
    }, 5000);
  }

  async function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request("/notebook/collections", { method: "POST", body: { name: String(data.get("name")) } });
      form.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create collection.");
    }
  }

  async function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request("/notebook/tags", { method: "POST", body: { name: String(data.get("name")) } });
      form.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create tag.");
    }
  }

  return <ProductShell search="Search notes, pearls, or cases"><main className="pp-page notebook-page notebook-restored restored-page notebook-bulk-page">
    <header className="workspace-heading"><div><span className="page-eyebrow">PERSONAL KNOWLEDGE WORKSPACE</span><h1>Notebook</h1><p>Organize, sort, select, tag, move, favorite, and edit your learning notes.</p></div><div className="notebook-stats"><Metric icon={<FiBookOpen />} value={notes.length} label="Total notes" /><Metric icon={<FiFileText />} value={count("EXPLANATION")} label="Explanations" /><Metric icon={<FiFolder />} value={collections.length} label="Collections" /></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <PageSkeleton variant="workspace" label="Loading notebook" /> : <div className="notebook-workspace notebook-layout">
      <aside className="notebook-library notebook-sidebar">
        <div className="library-title"><b>LIBRARY</b><Link href="/notebook/new"><FiPlus /></Link></div>
        <button className={collection === "ALL" ? "active" : ""} onClick={() => chooseCollection("ALL")}><span>All collections</span><small>{notes.length}</small></button>
        {collections.map((item) => <button key={item.id} className={collection === item.id ? "active" : ""} onClick={() => chooseCollection(item.id)}><span><FiFolder /> {item.name}{item.isPinned && <FiStar />}</span><small>{item.notes.length}</small></button>)}
        <form className="inline-create" onSubmit={createCollection}><input name="name" placeholder="New collection" required /><button><FiPlus /></button></form>
        <b className="library-subtitle">TAGS</b>
        <div className="library-tags">{tags.map((tag) => <span key={tag.id}><FiTag />{tag.name}</span>)}</div>
        <form className="inline-create" onSubmit={createTag}><input name="name" placeholder="New tag" required /><button><FiPlus /></button></form>
        <div className="notebook-search"><FiSearch /><input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search notes" /></div>
      </aside>

      <section className="notebook-center">
        <div className="notebook-toolbar"><div>{types.map((type) => <button key={type} className={filter === type ? "active" : ""} onClick={() => chooseFilter(type)}>{type === "ALL" ? `All (${count(type)})` : type.replaceAll("_", " ")}</button>)}</div><Link className="pp-button" href="/notebook/new"><FiPlus /> New note</Link></div>
        <div className="notebook-list-controls">
          <button type="button" onClick={() => setSelectedIds(allVisibleSelected ? new Set() : new Set(visible.map((note) => note.id)))}>{allVisibleSelected ? <FiCheckSquare /> : <FiSquare />} {allVisibleSelected ? "Clear visible" : "Select visible"}</button>
          <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="UPDATED_DESC">Recently updated</option><option value="UPDATED_ASC">Oldest updated</option><option value="TITLE_ASC">Title A–Z</option><option value="TITLE_DESC">Title Z–A</option><option value="FAVORITES">Favorites first</option></select></label>
        </div>

        {selectedIds.size > 0 && <section className="notebook-bulk-bar" aria-label="Bulk note actions">
          <b>{selectedIds.size} selected</b>
          <button type="button" disabled={busy} onClick={() => void updateMany((note) => ({ is_favorite: !note.isFavorite }), "Favorite state updated")}><FiStar /> Toggle favorite</button>
          <label><FiFolder /><select value={bulkCollection} onChange={(event) => setBulkCollection(event.target.value)}><option value="">Move to…</option><option value="UNFILED">Unfiled</option>{collections.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button type="button" disabled={!bulkCollection || busy} onClick={() => void updateMany(() => ({ collection_id: bulkCollection === "UNFILED" ? null : bulkCollection }), "Notes moved")}>Apply</button></label>
          <label><FiTag /><select value={bulkTag} onChange={(event) => setBulkTag(event.target.value)}><option value="">Add tag…</option>{tags.map((tag) => <option value={tag.id} key={tag.id}>{tag.name}</option>)}</select><button type="button" disabled={!bulkTag || busy} onClick={() => void updateMany((note) => ({ tag_ids: [...new Set([...note.tags.map((tag) => tag.id), bulkTag])] }), "Tag applied")}>Apply</button></label>
          <button type="button" className="danger" disabled={busy} onClick={() => removeMany(notes.filter((note) => selectedIds.has(note.id)))}><FiTrash2 /> Delete</button>
          <button type="button" onClick={() => setSelectedIds(new Set())}><FiX /> Cancel</button>
        </section>}

        {visible.length ? <div className="note-card-grid">{visible.map((note) => <article key={note.id} className={`note-library-card selectable ${selected?.id === note.id ? "active" : ""} ${selectedIds.has(note.id) ? "selected" : ""}`}>
          <button className="note-select-control" type="button" aria-label={`${selectedIds.has(note.id) ? "Deselect" : "Select"} ${note.title}`} onClick={() => toggleSelected(note.id)}>{selectedIds.has(note.id) ? <FiCheckSquare /> : <FiSquare />}</button>
          <button className="note-open-control" type="button" onClick={() => selectNote(note)}><span className={`note-kind ${note.noteType.toLowerCase()}`}>{note.noteType.replaceAll("_", " ")}</span><h3>{note.title}</h3><p>{note.content}</p><footer><small>{note.collection?.name || "Unfiled"}</small>{note.isFavorite && <FiStar />}</footer></button>
        </article>)}</div> : <EmptyState title="No matching notes" description="Create a note or change the active collection, type, or search filter." />}
      </section>

      <aside className="note-inspector">{selected ? <><div className="inspector-title"><span className="note-kind">{selected.noteType.replaceAll("_", " ")}</span><h2>{selected.title}</h2><small>Updated {new Date(selected.updatedAt).toLocaleString()}</small></div><div className="inspector-copy">{selected.content}</div><div className="library-tags">{selected.tags.map((tag) => <span key={tag.id}><FiTag />{tag.name}</span>)}</div><div className="inspector-actions"><Link className="pp-button" href={`/notebook/new?note=${selected.id}`}><FiEdit3 /> Open full note</Link><button className="pp-button secondary" onClick={() => void updateManyForSingle(selected, request, setNotes, setSelected, notify)}><FiStar /> {selected.isFavorite ? "Unfavorite" : "Favorite"}</button><button className="pp-button secondary danger" onClick={() => removeMany([selected])}><FiTrash2 /> Delete</button></div></> : <p>Select a note to inspect it.</p>}</aside>
    </div>}
  </main></ProductShell>;
}

async function updateManyForSingle(note: Note, request: <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>, setNotes: React.Dispatch<React.SetStateAction<Note[]>>, setSelected: React.Dispatch<React.SetStateAction<Note | null>>, notify: (value: { title: string; description?: string; tone: "success" | "error" | "info" }) => void) {
  try {
    const updated = await request<Note>(`/notebook/notes/${note.id}`, { method: "PUT", body: { is_favorite: !note.isFavorite } });
    setNotes((current) => current.map((value) => value.id === updated.id ? updated : value));
    setSelected(updated);
    notify({ title: updated.isFavorite ? "Note favorited" : "Note removed from favorites", tone: "success" });
  } catch (cause) {
    notify({ title: "Could not update note", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
  }
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return <div>{icon}<span><b>{value}</b><small>{label}</small></span></div>;
}