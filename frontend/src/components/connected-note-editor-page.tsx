"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiArrowLeft, FiFolder, FiPlus, FiSave, FiTrash2 } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { PageSkeleton } from "./async-state";
import { useLocale } from "./locale-provider";
import { ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";
import "./notebook-simple.css";

type Collection = { id: string; name: string };
type Note = {
  id: string;
  title: string;
  noteType: string;
  content: string;
  collectionId: string | null;
};

export function ConnectedNoteEditorPage() {
  const { request } = useAuth();
  const { translate } = useLocale();
  const { notify } = useUx();
  const router = useRouter();
  const params = useSearchParams();
  const routeNoteId = params.get("note");

  const [activeNoteId, setActiveNoteId] = useState<string | null>(routeNoteId);
  const [noteType, setNoteType] = useState("PERSONAL");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      request<Collection[]>("/notebook/collections"),
      routeNoteId ? request<Note>(`/notebook/notes/${routeNoteId}`) : Promise.resolve(null),
    ]).then(([collectionRows, note]) => {
      if (!active) return;
      setCollections(collectionRows);
      if (note) {
        setActiveNoteId(note.id);
        setNoteType(note.noteType || "PERSONAL");
        setTitle(note.title);
        setContent(note.content);
        setCollectionId(note.collectionId || "");
      } else {
        setActiveNoteId(null);
        setNoteType("PERSONAL");
        setTitle("");
        setContent("");
        setCollectionId("");
      }
      setDirty(false);
      setLoading(false);
    }).catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : translate("Unable to load notebook."));
      setLoading(false);
    });
    return () => { active = false; };
  }, [request, routeNoteId, translate]);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  async function saveNote(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await request<Note>(activeNoteId ? `/notebook/notes/${activeNoteId}` : "/notebook/notes", {
        method: activeNoteId ? "PUT" : "POST",
        body: {
          title: title.trim(),
          note_type: noteType || "PERSONAL",
          content,
          collection_id: collectionId || null,
        },
      });
      setActiveNoteId(saved.id);
      setNoteType(saved.noteType || noteType || "PERSONAL");
      setDirty(false);
      if (!activeNoteId) window.history.replaceState(null, "", `/notebook/new?note=${saved.id}`);
      notify({ title: translate("Notebook saved"), description: saved.title, tone: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("Unable to save notebook."));
    } finally {
      setSaving(false);
    }
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
      setCollectionId(created.id);
      setDirty(true);
      setShowCollectionForm(false);
      form.reset();
      notify({ title: translate("Collection created"), description: created.name, tone: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("Unable to create collection."));
    } finally {
      setCreatingCollection(false);
    }
  }

  async function deleteNote() {
    if (!activeNoteId || !window.confirm(translate("Delete this notebook?"))) return;
    setSaving(true);
    setError(null);
    try {
      await request(`/notebook/notes/${activeNoteId}`, { method: "DELETE" });
      setDirty(false);
      notify({ title: translate("Notebook deleted"), tone: "success" });
      router.push("/notebook");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("Unable to delete notebook."));
      setSaving(false);
    }
  }

  const status = saving
    ? translate("Saving…")
    : dirty
      ? translate("Unsaved changes")
      : activeNoteId
        ? translate("Saved")
        : translate("New notebook");

  return <ProductShell><main className="pp-page simple-note-editor-page">
    <header className="simple-note-editor-head">
      <div className="simple-note-editor-head-left">
        <Link className="simple-note-editor-back" href="/notebook" aria-label={translate("Back to notebook")}><FiArrowLeft /></Link>
        <div><h1>{translate(activeNoteId ? "Edit notebook" : "New notebook")}</h1><small>{status}</small></div>
      </div>
      <div className="simple-note-editor-actions">
        {activeNoteId && <button className="simple-note-delete" type="button" disabled={saving} onClick={() => void deleteNote()}><FiTrash2 /> {translate("Delete")}</button>}
        <button className="pp-button" type="button" disabled={saving || !title.trim() || !content.trim()} onClick={() => void saveNote()}><FiSave /> {translate(saving ? "Saving…" : "Save")}</button>
      </div>
    </header>

    {error && <p className="form-error simple-note-error" role="alert">{error}</p>}

    {loading ? <PageSkeleton variant="workspace" label={translate("Loading notebook")} /> : <form className="simple-note-editor-card" onSubmit={saveNote}>
      <input
        className="simple-note-title"
        value={title}
        onChange={(event) => { setTitle(event.target.value); setDirty(true); }}
        placeholder={translate("Notebook title")}
        maxLength={200}
        required
        autoFocus
      />
      <textarea
        className="simple-note-content"
        value={content}
        onChange={(event) => { setContent(event.target.value); setDirty(true); }}
        placeholder={translate("Start writing here…")}
        maxLength={50000}
        required
      />

      <footer className="simple-note-editor-footer">
        <div className="simple-note-collection">
          <FiFolder />
          <select value={collectionId} onChange={(event) => { setCollectionId(event.target.value); setDirty(true); }} aria-label={translate("Collection")}>
            <option value="">{translate("No collection")}</option>
            {collections.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
          <button className="simple-note-new-collection-button" type="button" onClick={() => setShowCollectionForm((current) => !current)}><FiPlus /> {translate("New collection")}</button>
        </div>
        <span className="simple-note-editor-status">{status}</span>
        <button className="pp-button" type="submit" disabled={saving || !title.trim() || !content.trim()}><FiSave /> {translate(saving ? "Saving…" : "Save")}</button>
      </footer>

      {showCollectionForm && <div className="simple-note-inline-collection">
        <form onSubmit={createCollection} />
      </div>}
    </form>}

    {showCollectionForm && !loading && <form className="simple-note-inline-collection" onSubmit={createCollection}>
      <input name="name" placeholder={translate("Collection name")} maxLength={120} required autoFocus />
      <button className="pp-button" type="submit" disabled={creatingCollection}><FiPlus /> {translate(creatingCollection ? "Creating…" : "Create collection")}</button>
      <button className="pp-button secondary" type="button" onClick={() => setShowCollectionForm(false)}>{translate("Cancel")}</button>
    </form>}
  </main></ProductShell>;
}
