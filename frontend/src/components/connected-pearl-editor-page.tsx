"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiArrowLeft, FiFolder, FiSave, FiStar, FiTrash2 } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { PageSkeleton } from "./async-state";
import { useLocale } from "./locale-provider";
import { ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";
import "./notebook-simple.css";

type Collection = { id: string; name: string };
type PearlNote = {
  id: string;
  title: string;
  content: string;
  noteType: "PERSONAL" | "EXPLANATION" | "PEARL" | "IMAGE" | "LINKED_CASE";
  collectionId: string | null;
};

export function ConnectedPearlEditorPage() {
  const { request } = useAuth();
  const { translate } = useLocale();
  const { notify } = useUx();
  const router = useRouter();
  const params = useSearchParams();
  const requestedId = params.get("note");

  const [noteId, setNoteId] = useState<string | null>(requestedId);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
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
      requestedId ? request<PearlNote>(`/notebook/notes/${requestedId}`) : Promise.resolve(null),
    ]).then(([collectionRows, note]) => {
      if (!active) return;
      setCollections(collectionRows);
      if (note) {
        if (note.noteType !== "PEARL") throw new Error("This note is not a Pearl. Open it from the regular notebook editor instead.");
        setNoteId(note.id);
        setTitle(note.title);
        setContent(note.content);
        setCollectionId(note.collectionId || "");
      } else {
        setNoteId(null);
        setTitle("");
        setContent("");
        setCollectionId("");
      }
      setDirty(false);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : translate("Unable to load pearl."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [request, requestedId, translate]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!title.trim() || !content.trim() || saving) return;
    const creating = !noteId;
    setSaving(true);
    setError(null);
    try {
      const saved = await request<PearlNote>(noteId ? `/notebook/notes/${noteId}` : "/notebook/notes", {
        method: noteId ? "PUT" : "POST",
        body: {
          title: title.trim(),
          note_type: "PEARL",
          content: content.trim(),
          collection_id: collectionId || null,
        },
      });
      setNoteId(saved.id);
      setTitle(saved.title);
      setContent(saved.content);
      setCollectionId(saved.collectionId || "");
      setDirty(false);
      if (creating) window.history.replaceState(null, "", `/notebook/pearl?note=${saved.id}`);
      notify({ title: translate("Pearl saved"), description: saved.title, tone: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("Unable to save pearl."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!noteId || !window.confirm(translate("Delete this pearl?"))) return;
    setSaving(true);
    setError(null);
    try {
      await request(`/notebook/notes/${noteId}`, { method: "DELETE" });
      setDirty(false);
      notify({ title: translate("Pearl deleted"), tone: "success" });
      router.push("/notebook");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("Unable to delete pearl."));
      setSaving(false);
    }
  }

  return <ProductShell><main className="pp-page simple-note-editor-page">
    <header className="simple-note-editor-head">
      <div className="simple-note-editor-head-left">
        <Link className="simple-note-editor-back" href="/notebook" aria-label={translate("Back to notebook")}><FiArrowLeft /></Link>
        <div><h1><FiStar /> {translate(noteId ? "Edit pearl" : "New pearl")}</h1><small>{translate(noteId ? (dirty ? "Unsaved changes" : "Saved") : "Dashboard insight")}</small></div>
      </div>
      <div className="simple-note-editor-actions">
        {noteId && <button className="simple-note-delete" type="button" disabled={saving} onClick={() => void remove()}><FiTrash2 /> {translate("Delete")}</button>}
        <button className="pp-button" type="button" disabled={saving || !title.trim() || !content.trim()} onClick={() => void save()}><FiSave /> {translate(saving ? "Saving…" : "Save pearl")}</button>
      </div>
    </header>

    <section className="pp-panel" style={{ marginBottom: "1rem" }}>
      <strong>{translate("What a Pearl means")}</strong>
      <p>{translate("A Pearl is a concise insight you choose to surface on your dashboard. It is private to your account. Marking something as a Pearl does not medically verify it or mean that an instructor authored it.")}</p>
    </section>

    {error && <p className="form-error simple-note-error" role="alert">{error}</p>}

    {loading ? <PageSkeleton variant="workspace" label={translate("Loading pearl")} /> : <form className="simple-note-editor-card" onSubmit={save}>
      <input className="simple-note-title" value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} placeholder={translate("Pearl title")} maxLength={200} required autoFocus />
      <textarea className="simple-note-content" value={content} onChange={(event) => { setContent(event.target.value); setDirty(true); }} placeholder={translate("Write the concise insight you want to remember…")} maxLength={50000} required />
      <footer className="simple-note-editor-footer">
        <div className="simple-note-collection">
          <FiFolder />
          <select value={collectionId} onChange={(event) => { setCollectionId(event.target.value); setDirty(true); }} aria-label={translate("Collection")}>
            <option value="">{translate("No collection")}</option>
            {collections.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </div>
        <span className="simple-note-editor-status"><FiStar /> {translate("PEARL")}</span>
        <button className="pp-button" type="submit" disabled={saving || !title.trim() || !content.trim()}><FiSave /> {translate(saving ? "Saving…" : "Save pearl")}</button>
      </footer>
    </form>}
  </main></ProductShell>;
}
