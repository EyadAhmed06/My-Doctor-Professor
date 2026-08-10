"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { FiBookOpen, FiFolder, FiPlus } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { PageSkeleton } from "./async-state";
import { useLocale } from "./locale-provider";
import { ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";
import "./notebook-simple.css";

type Collection = {
  id: string;
  name: string;
  notes?: unknown[];
};

type Note = {
  id: string;
  title: string;
  content: string;
  collectionId: string | null;
  collection: Collection | null;
  updatedAt: string;
};

type Page<T> = { data: T[]; total: number };

export function ConnectedNotebookPage() {
  const { request } = useAuth();
  const { translate, locale } = useLocale();
  const { notify } = useUx();
  const [notes, setNotes] = useState<Note[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollection, setActiveCollection] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [noteRows, collectionRows] = await Promise.all([
        request<Page<Note>>("/notebook/notes?limit=100"),
        request<Collection[]>("/notebook/collections"),
      ]);
      setNotes(noteRows.data);
      setCollections(collectionRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("Unable to load notebook."));
    } finally {
      setLoading(false);
    }
  }, [request, translate]);

  useEffect(() => { void load(); }, [load]);

  const visibleNotes = useMemo(() => {
    const filtered = activeCollection === "ALL"
      ? notes
      : notes.filter((note) => note.collectionId === activeCollection);
    return [...filtered].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }, [activeCollection, notes]);

  const activeCollectionName = activeCollection === "ALL"
    ? translate("All notebooks")
    : collections.find((item) => item.id === activeCollection)?.name || translate("Collection");

  function collectionCount(id: string) {
    return notes.filter((note) => note.collectionId === id).length;
  }

  async function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    if (!name) return;
    setCreatingCollection(true);
    setError(null);
    try {
      const created = await request<Collection>("/notebook/collections", {
        method: "POST",
        body: { name },
      });
      setCollections((current) => [...current, created]);
      setActiveCollection(created.id);
      form.reset();
      notify({ title: translate("Collection created"), description: created.name, tone: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("Unable to create collection."));
    } finally {
      setCreatingCollection(false);
    }
  }

  return <ProductShell><main className="pp-page simple-notebook-page">
    <header className="simple-notebook-heading">
      <div>
        <span className="page-eyebrow">{translate("YOUR NOTES")}</span>
        <h1>{translate("Notebook")}</h1>
        <p>{translate("Write your notes and keep them together in collections you create.")}</p>
      </div>
      <Link className="pp-button" href="/notebook/new"><FiPlus /> {translate("New notebook")}</Link>
    </header>

    {error && <p className="form-error" role="alert">{error}</p>}

    {loading ? <PageSkeleton variant="workspace" label={translate("Loading notebook")} /> : <div className="simple-notebook-layout">
      <aside className="simple-collections">
        <header><h2>{translate("Collections")}</h2></header>
        <div className="simple-collection-list">
          <button type="button" className={`simple-collection-button ${activeCollection === "ALL" ? "active" : ""}`} onClick={() => setActiveCollection("ALL")}>
            <span><FiBookOpen /> {translate("All notebooks")}</span><small>{notes.length}</small>
          </button>
          {collections.map((item) => <button type="button" key={item.id} className={`simple-collection-button ${activeCollection === item.id ? "active" : ""}`} onClick={() => setActiveCollection(item.id)}>
            <span data-academic-content><FiFolder /> {item.name}</span><small>{collectionCount(item.id)}</small>
          </button>)}
        </div>
        <form className="simple-collection-create" onSubmit={createCollection}>
          <input name="name" placeholder={translate("New collection")} maxLength={120} required />
          <button type="submit" disabled={creatingCollection} aria-label={translate("Create collection")}><FiPlus /></button>
        </form>
      </aside>

      <section className="simple-notebook-main">
        <div className="simple-notebook-main-head">
          <h2 data-academic-content>{activeCollectionName}</h2>
          <small>{visibleNotes.length} {translate(visibleNotes.length === 1 ? "notebook" : "notebooks")}</small>
        </div>

        {visibleNotes.length ? <div className="simple-note-list">
          {visibleNotes.map((note) => <Link className="simple-note-row" href={`/notebook/new?note=${note.id}`} key={note.id}>
            <div>
              <h3 data-academic-content>{note.title}</h3>
              <p data-academic-content>{note.content}</p>
            </div>
            <div className="simple-note-row-meta">
              <span><FiFolder /> <span data-academic-content>{note.collection?.name || translate("No collection")}</span></span>
              <small>{translate("Updated")} {new Date(note.updatedAt).toLocaleDateString(locale === "ar" ? "ar-EG" : undefined)}</small>
            </div>
          </Link>)}
        </div> : <div className="simple-notebook-empty">
          <div><FiBookOpen /><h3>{translate("No notebooks here yet")}</h3><p>{translate("Create a notebook, give it a title, and start writing.")}</p><Link className="pp-button" href="/notebook/new"><FiPlus /> {translate("Create notebook")}</Link></div>
        </div>}
      </section>
    </div>}
  </main></ProductShell>;
}
