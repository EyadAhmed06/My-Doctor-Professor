"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiArrowLeft, FiFolder, FiLink, FiPaperclip, FiPlus, FiSave, FiTrash2 } from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { PageSkeleton } from "./async-state";
import { useLocale } from "./locale-provider";
import { ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";
import "./notebook-simple.css";

type Collection = { id: string; name: string };
type Attachment = {
  id: string;
  kind: "IMAGE" | "RESOURCE";
  fileName: string;
  mimeType: string;
  fileUrl: string;
  sizeBytes: number | null;
};
type Note = {
  id: string;
  title: string;
  content: string;
  collectionId: string | null;
  attachments?: Attachment[];
};

function attachmentFileName(url: string) {
  try {
    const value = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "attachment");
    return value.slice(0, 255) || "attachment";
  } catch {
    return "attachment";
  }
}

function attachmentMimeType(url: string, kind: Attachment["kind"]) {
  let extension = "";
  try {
    const path = new URL(url).pathname.toLowerCase();
    extension = path.includes(".") ? path.split(".").pop() || "" : "";
  } catch {
    extension = "";
  }

  const mimeByExtension: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    txt: "text/plain",
    csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };

  return mimeByExtension[extension] || (kind === "IMAGE" ? "image/*" : "application/octet-stream");
}

export function ConnectedNoteEditorPage() {
  const { request } = useAuth();
  const { translate } = useLocale();
  const { notify } = useUx();
  const router = useRouter();
  const params = useSearchParams();
  const routeNoteId = params.get("note");

  const [activeNoteId, setActiveNoteId] = useState<string | null>(routeNoteId);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [showAttachmentForm, setShowAttachmentForm] = useState(false);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [addingAttachment, setAddingAttachment] = useState(false);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);
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
        setTitle(note.title);
        setContent(note.content);
        setCollectionId(note.collectionId || "");
        setAttachments(note.attachments || []);
      } else {
        setActiveNoteId(null);
        setTitle("");
        setContent("");
        setCollectionId("");
        setAttachments([]);
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

  async function persistNote(showNotice = true): Promise<Note | null> {
    if (!title.trim() || !content.trim() || saving) return null;
    const wasNew = !activeNoteId;
    setSaving(true);
    setError(null);
    try {
      const saved = await request<Note>(activeNoteId ? `/notebook/notes/${activeNoteId}` : "/notebook/notes", {
        method: activeNoteId ? "PUT" : "POST",
        body: {
          title: title.trim(),
          note_type: "PERSONAL",
          content,
          collection_id: collectionId || null,
        },
      });
      setActiveNoteId(saved.id);
      if (saved.attachments) setAttachments(saved.attachments);
      setDirty(false);
      if (wasNew) window.history.replaceState(null, "", `/notebook/new?note=${saved.id}`);
      if (showNotice) notify({ title: translate("Notebook saved"), description: saved.title, tone: "success" });
      return saved;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("Unable to save notebook."));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveNote(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await persistNote(true);
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

  async function addAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (addingAttachment || saving) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const fileUrl = String(data.get("file_url") || "").trim();
    const customName = String(data.get("file_name") || "").trim();
    const kind = String(data.get("kind") || "RESOURCE") as Attachment["kind"];
    if (!fileUrl) return;

    if (!activeNoteId && (!title.trim() || !content.trim())) {
      setError(translate("Add a title and some content before attaching a file."));
      return;
    }

    let noteId = activeNoteId;
    if (!noteId) {
      const saved = await persistNote(false);
      if (!saved) return;
      noteId = saved.id;
    }

    setAddingAttachment(true);
    setError(null);
    try {
      const created = await request<Attachment>(`/notebook/notes/${noteId}/attachments`, {
        method: "POST",
        body: {
          kind,
          file_name: (customName || attachmentFileName(fileUrl)).slice(0, 255),
          mime_type: attachmentMimeType(fileUrl, kind),
          file_url: fileUrl,
        },
      });
      setAttachments((current) => [...current, created]);
      setShowAttachmentForm(false);
      form.reset();
      notify({ title: translate("Attachment added"), description: created.fileName, tone: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("Unable to add attachment."));
    } finally {
      setAddingAttachment(false);
    }
  }

  async function removeAttachment(attachment: Attachment) {
    if (!activeNoteId || removingAttachmentId) return;
    setRemovingAttachmentId(attachment.id);
    setError(null);
    try {
      await request(`/notebook/notes/${activeNoteId}/attachments/${attachment.id}`, { method: "DELETE" });
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      notify({ title: translate("Attachment removed"), description: attachment.fileName, tone: "success" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("Unable to remove attachment."));
    } finally {
      setRemovingAttachmentId(null);
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

      {attachments.length > 0 && <div className="simple-note-attachment-list">
        {attachments.map((attachment) => <article className="simple-note-attachment-chip" key={attachment.id}>
          <FiPaperclip />
          <a href={attachment.fileUrl} target="_blank" rel="noreferrer" title={attachment.fileUrl}>{attachment.fileName}</a>
          <small>{attachment.kind === "IMAGE" ? translate("Image") : translate("File")}</small>
          <button type="button" disabled={removingAttachmentId === attachment.id} onClick={() => void removeAttachment(attachment)} aria-label={translate("Remove attachment")} title={translate("Remove attachment")}><FiTrash2 /></button>
        </article>)}
      </div>}

      <footer className="simple-note-editor-footer">
        <div className="simple-note-collection">
          <FiFolder />
          <select value={collectionId} onChange={(event) => { setCollectionId(event.target.value); setDirty(true); }} aria-label={translate("Collection")}>
            <option value="">{translate("No collection")}</option>
            {collections.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
          <button className="simple-note-new-collection-button" type="button" onClick={() => { setShowCollectionForm((current) => !current); setShowAttachmentForm(false); }}><FiPlus /> {translate("New collection")}</button>
          <button className={`simple-note-attachment-button ${showAttachmentForm ? "active" : ""}`} type="button" onClick={() => { setShowAttachmentForm((current) => !current); setShowCollectionForm(false); }}><FiPaperclip /> {translate("Attachment")}{attachments.length ? ` (${attachments.length})` : ""}</button>
        </div>
        <span className="simple-note-editor-status">{status}</span>
        <button className="pp-button" type="submit" disabled={saving || !title.trim() || !content.trim()}><FiSave /> {translate(saving ? "Saving…" : "Save")}</button>
      </footer>
    </form>}

    {showCollectionForm && !loading && <form className="simple-note-inline-collection" onSubmit={createCollection}>
      <input name="name" placeholder={translate("Collection name")} maxLength={120} required autoFocus />
      <button className="pp-button" type="submit" disabled={creatingCollection}><FiPlus /> {translate(creatingCollection ? "Creating…" : "Create collection")}</button>
      <button className="pp-button secondary" type="button" onClick={() => setShowCollectionForm(false)}>{translate("Cancel")}</button>
    </form>}

    {showAttachmentForm && !loading && <form className="simple-note-inline-attachment" onSubmit={addAttachment}>
      <div className="simple-note-attachment-url"><FiLink /><input name="file_url" type="url" placeholder={translate("Attachment URL")} maxLength={1000} required autoFocus /></div>
      <input name="file_name" placeholder={translate("Name (optional)")} maxLength={255} />
      <select name="kind" defaultValue="RESOURCE" aria-label={translate("Attachment type")}>
        <option value="RESOURCE">{translate("File / resource")}</option>
        <option value="IMAGE">{translate("Image")}</option>
      </select>
      <button className="pp-button" type="submit" disabled={addingAttachment || saving}><FiPaperclip /> {translate(addingAttachment ? "Adding…" : "Add attachment")}</button>
      <button className="pp-button secondary" type="button" onClick={() => setShowAttachmentForm(false)}>{translate("Cancel")}</button>
    </form>}
  </main></ProductShell>;
}
