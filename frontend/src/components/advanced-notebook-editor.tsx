"use client";

import { ClipboardEvent, DragEvent, FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FiAlignLeft,
  FiBookOpen,
  FiCheckSquare,
  FiClock,
  FiCode,
  FiEdit3,
  FiFileText,
  FiGripVertical,
  FiImage,
  FiLink,
  FiList,
  FiMinus,
  FiPlus,
  FiRotateCcw,
  FiRotateCw,
  FiSave,
  FiStar,
  FiTag,
  FiTrash2,
  FiType,
  FiX,
} from "react-icons/fi";
import { useAuth } from "./auth-provider";
import { EmptyState, ErrorState, PageSkeleton } from "./async-state";
import { Panel, ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";
import "./product-pages.css";

type Collection = { id: string; name: string; color: string; isPinned: boolean };
type Tag = { id: string; name: string; color: string };
type Attachment = { id: string; kind: "IMAGE" | "RESOURCE"; fileName: string; mimeType: string; fileUrl: string; sizeBytes: number | null };
type Note = {
  id: string;
  title: string;
  noteType: "PERSONAL" | "EXPLANATION" | "PEARL" | "IMAGE" | "LINKED_CASE";
  content: string;
  collectionId: string | null;
  collection: Collection | null;
  isFavorite: boolean;
  tags: Tag[];
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
};
type Block = { id: string; text: string };
type VersionSnapshot = { id: string; savedAt: string; title: string; noteType: Note["noteType"]; content: string };
type Command = { id: string; label: string; description: string; icon: React.ReactNode; apply: (value: string) => string };

const noteTypes: Note["noteType"][] = ["PERSONAL", "EXPLANATION", "PEARL", "IMAGE", "LINKED_CASE"];

function blockId() {
  return crypto.randomUUID();
}
function contentToBlocks(content: string): Block[] {
  const parts = content.split(/\n{2,}/).map((text) => text.trimEnd()).filter((text) => text.length);
  return parts.length ? parts.map((text) => ({ id: blockId(), text })) : [{ id: blockId(), text: "" }];
}
function blocksToContent(blocks: Block[]) {
  return blocks.map((block) => block.text.trimEnd()).filter((text) => text.trim()).join("\n\n");
}
function snapshotBlocks(blocks: Block[]) {
  return blocks.map((block) => ({ ...block }));
}
function versionKey(userId: string | undefined, noteId: string) {
  return `mdp:note-versions:${userId || "anonymous"}:${noteId}`;
}
function draftKey(userId: string | undefined, noteId: string | null) {
  return `mdp:note-draft:${userId || "anonymous"}:${noteId || "new"}`;
}
function readVersions(userId: string | undefined, noteId: string): VersionSnapshot[] {
  try {
    const value = JSON.parse(localStorage.getItem(versionKey(userId, noteId)) || "[]") as VersionSnapshot[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

const commands: Command[] = [
  { id: "heading", label: "Heading", description: "Create a section heading", icon: <FiType />, apply: (value) => `## ${value.replace(/^\/\w*\s*/, "") || "Section heading"}` },
  { id: "checklist", label: "Checklist", description: "Insert a task checkbox", icon: <FiCheckSquare />, apply: (value) => `- [ ] ${value.replace(/^\/\w*\s*/, "") || "Task"}` },
  { id: "bullets", label: "Bullet list", description: "Start a bulleted point", icon: <FiList />, apply: (value) => `- ${value.replace(/^\/\w*\s*/, "") || "Point"}` },
  { id: "quote", label: "Pearl callout", description: "Highlight a memorable insight", icon: <FiStar />, apply: (value) => `> PEARL: ${value.replace(/^\/\w*\s*/, "") || "Key insight"}` },
  { id: "code", label: "Code block", description: "Insert a fenced code block", icon: <FiCode />, apply: (value) => `\`\`\`\n${value.replace(/^\/\w*\s*/, "")}\n\`\`\`` },
  { id: "date", label: "Current date", description: "Insert today’s date", icon: <FiClock />, apply: () => new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) },
  { id: "divider", label: "Divider", description: "Separate sections", icon: <FiMinus />, apply: () => "---" },
];

export function AdvancedNotebookEditor() {
  const { user, request } = useAuth();
  const { notify, celebrate } = useUx();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNoteId = searchParams.get("note");
  const [noteId, setNoteId] = useState<string | null>(requestedNoteId);
  const [title, setTitle] = useState("");
  const [noteType, setNoteType] = useState<Note["noteType"]>("PERSONAL");
  const [collectionId, setCollectionId] = useState("");
  const [tagIds, setTagIds] = useState<Set<string>>(new Set());
  const [favorite, setFavorite] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([{ id: blockId(), text: "" }]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentMime, setAttachmentMime] = useState("application/pdf");
  const [activeSlashBlock, setActiveSlashBlock] = useState<string | null>(null);
  const [draggedBlock, setDraggedBlock] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"SAVED" | "DIRTY" | "SAVING" | "RECOVERED">("SAVED");
  const [error, setError] = useState<string | null>(null);
  const [baseline, setBaseline] = useState("");
  const undoStack = useRef<Block[][]>([]);
  const redoStack = useRef<Block[][]>([]);
  const editStart = useRef<Block[] | null>(null);
  const autosaveTimer = useRef(0);
  const localDraftTimer = useRef(0);
  const loadedRef = useRef(false);

  const serialized = useMemo(() => JSON.stringify({ title, noteType, collectionId, tagIds: [...tagIds].sort(), favorite, content: blocksToContent(blocks) }), [blocks, collectionId, favorite, noteType, tagIds, title]);
  const content = useMemo(() => blocksToContent(blocks), [blocks]);
  const wordCount = useMemo(() => content.trim() ? content.trim().split(/\s+/).length : 0, [content]);
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 220));
  const dirty = loadedRef.current && serialized !== baseline;

  const restoreDraft = useCallback((id: string | null) => {
    try {
      const saved = localStorage.getItem(draftKey(user?.id, id));
      if (!saved) return false;
      const parsed = JSON.parse(saved) as { title?: string; noteType?: Note["noteType"]; collectionId?: string; tagIds?: string[]; favorite?: boolean; content?: string; savedAt?: string };
      if (parsed.title !== undefined) setTitle(parsed.title);
      if (parsed.noteType && noteTypes.includes(parsed.noteType)) setNoteType(parsed.noteType);
      setCollectionId(parsed.collectionId || "");
      setTagIds(new Set(parsed.tagIds || []));
      setFavorite(Boolean(parsed.favorite));
      setBlocks(contentToBlocks(parsed.content || ""));
      setSaveState("RECOVERED");
      return true;
    } catch {
      return false;
    }
  }, [user?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    loadedRef.current = false;
    try {
      const [collectionRows, tagRows] = await Promise.all([
        request<Collection[]>("/notebook/collections"),
        request<Tag[]>("/notebook/tags"),
      ]);
      setCollections(collectionRows);
      setTags(tagRows);
      if (requestedNoteId) {
        const note = await request<Note>(`/notebook/notes/${requestedNoteId}`);
        setNoteId(note.id);
        setTitle(note.title);
        setNoteType(note.noteType);
        setCollectionId(note.collectionId || "");
        setTagIds(new Set(note.tags.map((tag) => tag.id)));
        setFavorite(note.isFavorite);
        setBlocks(contentToBlocks(note.content));
        setAttachments(note.attachments || []);
        setVersions(readVersions(user?.id, note.id));
        const serverState = JSON.stringify({ title: note.title, noteType: note.noteType, collectionId: note.collectionId || "", tagIds: note.tags.map((tag) => tag.id).sort(), favorite: note.isFavorite, content: note.content });
        setBaseline(serverState);
        const recovered = restoreDraft(note.id);
        if (!recovered) setSaveState("SAVED");
      } else {
        setNoteId(null);
        setTitle("");
        setNoteType("PERSONAL");
        setCollectionId("");
        setTagIds(new Set());
        setFavorite(false);
        setBlocks([{ id: blockId(), text: "" }]);
        setAttachments([]);
        setVersions([]);
        setBaseline(JSON.stringify({ title: "", noteType: "PERSONAL", collectionId: "", tagIds: [], favorite: false, content: "" }));
        restoreDraft(null);
      }
      undoStack.current = [];
      redoStack.current = [];
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the note editor.");
    } finally {
      loadedRef.current = true;
      setLoading(false);
    }
  }, [request, requestedNoteId, restoreDraft, user?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!loadedRef.current) return;
    setSaveState((current) => current === "RECOVERED" ? current : dirty ? "DIRTY" : "SAVED");
    window.clearTimeout(localDraftTimer.current);
    localDraftTimer.current = window.setTimeout(() => {
      localStorage.setItem(draftKey(user?.id, noteId), JSON.stringify({ title, noteType, collectionId, tagIds: [...tagIds], favorite, content, savedAt: new Date().toISOString() }));
    }, 450);
    return () => window.clearTimeout(localDraftTimer.current);
  }, [collectionId, content, dirty, favorite, noteId, noteType, tagIds, title, user?.id]);

  useEffect(() => {
    if (!noteId || !dirty || !title.trim() || !content.trim() || saveState === "RECOVERED") return;
    window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => void save(false), 1400);
    return () => window.clearTimeout(autosaveTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, noteId]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function record(previous: Block[]) {
    undoStack.current.push(snapshotBlocks(previous));
    if (undoStack.current.length > 80) undoStack.current.shift();
    redoStack.current = [];
  }

  function mutate(next: Block[], previous = blocks) {
    record(previous);
    setBlocks(next);
  }

  function undo() {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(snapshotBlocks(blocks));
    setBlocks(snapshotBlocks(previous));
  }

  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(snapshotBlocks(blocks));
    setBlocks(snapshotBlocks(next));
  }

  function updateBlock(id: string, value: string) {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, text: value } : block));
    setActiveSlashBlock(value.startsWith("/") ? id : null);
  }

  function beginBlockEdit() {
    editStart.current = snapshotBlocks(blocks);
  }

  function endBlockEdit() {
    const previous = editStart.current;
    editStart.current = null;
    if (previous && JSON.stringify(previous) !== JSON.stringify(blocks)) record(previous);
  }

  function addBlock(afterId?: string, text = "") {
    const next = snapshotBlocks(blocks);
    const index = afterId ? next.findIndex((block) => block.id === afterId) + 1 : next.length;
    next.splice(Math.max(0, index), 0, { id: blockId(), text });
    mutate(next);
  }

  function removeBlock(id: string) {
    if (blocks.length === 1) {
      mutate([{ ...blocks[0], text: "" }]);
      return;
    }
    mutate(blocks.filter((block) => block.id !== id));
  }

  function dropBlock(targetId: string) {
    if (!draggedBlock || draggedBlock === targetId) return;
    const next = snapshotBlocks(blocks);
    const from = next.findIndex((block) => block.id === draggedBlock);
    const to = next.findIndex((block) => block.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDraggedBlock(null);
    mutate(next);
  }

  function applyCommand(blockIdValue: string, command: Command) {
    const next = blocks.map((block) => block.id === blockIdValue ? { ...block, text: command.apply(block.text) } : block);
    mutate(next);
    setActiveSlashBlock(null);
  }

  function editorKey(event: KeyboardEvent<HTMLTextAreaElement>, block: Block) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      addBlock(block.id);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if ([...event.clipboardData.items].some((item) => item.type.startsWith("image/"))) {
      event.preventDefault();
      setAttachmentOpen(true);
      notify({ title: "Clipboard image detected", description: "This backend stores attachment URLs, not uploaded binary files. Add the hosted image URL in the attachment panel.", tone: "info" });
    }
  }

  function saveVersion(savedId: string) {
    const snapshot: VersionSnapshot = { id: crypto.randomUUID(), savedAt: new Date().toISOString(), title, noteType, content };
    const next = [snapshot, ...readVersions(user?.id, savedId)].slice(0, 12);
    localStorage.setItem(versionKey(user?.id, savedId), JSON.stringify(next));
    setVersions(next);
  }

  async function save(showToast = true) {
    if (saving) return noteId;
    if (!title.trim()) {
      setError("A note title is required before saving.");
      return null;
    }
    if (!content.trim()) {
      setError("Add at least one content block before saving.");
      return null;
    }
    setSaving(true);
    setSaveState("SAVING");
    setError(null);
    try {
      const body = {
        title: title.trim(),
        note_type: noteType,
        content,
        collection_id: collectionId || null,
        is_favorite: favorite,
        tag_ids: [...tagIds],
      };
      const saved = noteId
        ? await request<Note>(`/notebook/notes/${noteId}`, { method: "PUT", body })
        : await request<Note>("/notebook/notes", { method: "POST", body: { ...body, collection_id: collectionId || undefined } });
      setNoteId(saved.id);
      setAttachments(saved.attachments || attachments);
      const nextBaseline = JSON.stringify({ title: saved.title, noteType: saved.noteType, collectionId: saved.collectionId || "", tagIds: saved.tags.map((tag) => tag.id).sort(), favorite: saved.isFavorite, content: saved.content });
      setBaseline(nextBaseline);
      localStorage.removeItem(draftKey(user?.id, noteId));
      localStorage.removeItem(draftKey(user?.id, saved.id));
      saveVersion(saved.id);
      setSaveState("SAVED");
      if (!noteId) {
        router.replace(`/notebook/new?note=${saved.id}`, { scroll: false });
        celebrate({ id: `note-created-${saved.id}`, title: "Note created", description: `${saved.title} is now part of your knowledge workspace.`, points: 10 });
      } else if (showToast) notify({ title: "Note saved", description: "A local version snapshot was also recorded.", tone: "success" });
      return saved.id;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the note.");
      setSaveState("DIRTY");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function addAttachment(event: FormEvent) {
    event.preventDefault();
    let targetId = noteId;
    if (!targetId) targetId = await save(false);
    if (!targetId) return;
    setSaving(true);
    try {
      const created = await request<Attachment>(`/notebook/notes/${targetId}/attachments`, {
        method: "POST",
        body: {
          kind: attachmentMime.startsWith("image/") ? "IMAGE" : "RESOURCE",
          file_name: attachmentName.trim() || new URL(attachmentUrl).pathname.split("/").pop() || "Attachment",
          mime_type: attachmentMime,
          file_url: attachmentUrl,
        },
      });
      setAttachments((current) => [...current, created]);
      setAttachmentUrl("");
      setAttachmentName("");
      setAttachmentOpen(false);
      notify({ title: "Attachment linked", description: created.fileName, tone: "success" });
    } catch (cause) {
      notify({ title: "Could not add attachment", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function removeAttachment(attachment: Attachment) {
    if (!noteId) return;
    try {
      await request(`/notebook/notes/${noteId}/attachments/${attachment.id}`, { method: "DELETE" });
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      notify({ title: "Attachment removed", tone: "success" });
    } catch (cause) {
      notify({ title: "Could not remove attachment", description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    }
  }

  function restoreVersion(version: VersionSnapshot) {
    record(blocks);
    setTitle(version.title);
    setNoteType(version.noteType);
    setBlocks(contentToBlocks(version.content));
    setHistoryOpen(false);
    notify({ title: "Version restored into the editor", description: "Save the note to make this restoration persistent.", tone: "info" });
  }

  function discardRecovery() {
    localStorage.removeItem(draftKey(user?.id, noteId));
    void load();
  }

  return <ProductShell search="Search your notebook"><main className="pp-page advanced-note-editor-page">
    <header className="advanced-editor-header"><div><span className="page-eyebrow">STRUCTURED NOTE EDITOR</span><input aria-label="Note title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="Untitled note" /><p>{wordCount} words · {readingMinutes} min read · {blocks.length} block{blocks.length === 1 ? "" : "s"}</p></div><div className="editor-save-state" data-state={saveState.toLowerCase()}><i />{saveState === "SAVING" ? "Saving…" : saveState === "DIRTY" ? "Unsaved changes" : saveState === "RECOVERED" ? "Recovered local draft" : "Saved"}</div><div className="editor-header-actions"><button className="pp-button secondary" type="button" disabled={!undoStack.current.length} onClick={undo}><FiRotateCcw /> Undo</button><button className="pp-button secondary" type="button" disabled={!redoStack.current.length} onClick={redo}><FiRotateCw /> Redo</button><button className="pp-button secondary" type="button" onClick={() => setHistoryOpen(true)}><FiClock /> Versions</button><button className="pp-button" type="button" disabled={saving || !dirty} onClick={() => void save()}><FiSave /> {saving ? "Saving…" : "Save"}</button></div></header>

    {error && <ErrorState description={error} onRetry={() => void load()} />}
    {saveState === "RECOVERED" && <section className="recovery-banner"><FiRotateCcw /><div><b>Recovered a local draft</b><p>Review it, then save to the server or discard it to reload the last server version.</p></div><button type="button" onClick={discardRecovery}>Discard recovery</button></section>}

    {loading ? <PageSkeleton variant="workspace" label="Loading note editor" /> : <div className="advanced-editor-layout">
      <aside className="editor-metadata-panel">
        <Panel title="Note properties"><label>Type<select value={noteType} onChange={(event) => setNoteType(event.target.value as Note["noteType"])}>{noteTypes.map((value) => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label>Collection<select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}><option value="">Unfiled</option>{collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select></label><button className={`editor-favorite-toggle ${favorite ? "active" : ""}`} type="button" onClick={() => setFavorite((value) => !value)}><FiStar /> {favorite ? "Favorited" : "Add to favorites"}</button><button className={`editor-pearl-toggle ${noteType === "PEARL" ? "active" : ""}`} type="button" onClick={() => setNoteType(noteType === "PEARL" ? "PERSONAL" : "PEARL")}><FiStar /> {noteType === "PEARL" ? "Marked as pearl" : "Mark as pearl"}</button></Panel>
        <Panel title="Tags"><div className="editor-tag-grid">{tags.length ? tags.map((tag) => <button className={tagIds.has(tag.id) ? "active" : ""} type="button" key={tag.id} onClick={() => setTagIds((current) => { const next = new Set(current); if (next.has(tag.id)) next.delete(tag.id); else next.add(tag.id); return next; })}><FiTag /> {tag.name}</button>) : <p>No tags have been created yet.</p>}</div></Panel>
        <Panel title={`Attachments (${attachments.length})`} action={<button className="editor-panel-action" type="button" onClick={() => setAttachmentOpen(true)}><FiPlus /></button>}><div className="editor-attachment-list">{attachments.length ? attachments.map((attachment) => <article key={attachment.id}><span>{attachment.kind === "IMAGE" ? <FiImage /> : <FiFileText />}</span><div><b>{attachment.fileName}</b><small>{attachment.mimeType}</small></div><a href={attachment.fileUrl} target="_blank" rel="noreferrer"><FiLink /></a><button type="button" onClick={() => void removeAttachment(attachment)}><FiTrash2 /></button></article>) : <p>Link an image, PDF, or other hosted resource.</p>}</div></Panel>
      </aside>

      <section className="block-editor-canvas" onDragOver={(event: DragEvent) => event.preventDefault()}>
        <div className="block-editor-toolbar"><span><FiEdit3 /> Blocks are stored as plain text separated by blank lines.</span><button type="button" onClick={() => addBlock()}><FiPlus /> Add block</button></div>
        {blocks.map((block, index) => <article className={`editor-block ${activeSlashBlock === block.id ? "slash-open" : ""}`} draggable onDragStart={() => setDraggedBlock(block.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropBlock(block.id)} onDragEnd={() => setDraggedBlock(null)} key={block.id}>
          <div className="block-handle"><FiGripVertical /><span>{index + 1}</span></div>
          <textarea value={block.text} rows={Math.max(3, Math.min(16, block.text.split("\n").length + Math.ceil(block.text.length / 85)))} placeholder={index === 0 ? "Start writing, or type / for commands…" : "Continue writing…"} onFocus={beginBlockEdit} onBlur={endBlockEdit} onChange={(event) => updateBlock(block.id, event.target.value)} onKeyDown={(event) => editorKey(event, block)} onPaste={handlePaste} />
          <div className="block-actions"><button type="button" title="Add block below" onClick={() => addBlock(block.id)}><FiPlus /></button><button type="button" title="Delete block" onClick={() => removeBlock(block.id)}><FiTrash2 /></button></div>
          {activeSlashBlock === block.id && <div className="slash-command-menu" role="listbox" aria-label="Block commands">{commands.filter((command) => command.label.toLowerCase().includes(block.text.slice(1).toLowerCase().trim())).map((command) => <button type="button" role="option" key={command.id} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCommand(block.id, command)}><span>{command.icon}</span><div><b>{command.label}</b><small>{command.description}</small></div></button>)}</div>}
        </article>)}
        <button className="add-final-block" type="button" onClick={() => addBlock()}><FiPlus /> Add another block</button>
      </section>
    </div>}

    {historyOpen && <div className="editor-modal-backdrop" role="presentation" onMouseDown={() => setHistoryOpen(false)}><section className="editor-modal" role="dialog" aria-modal="true" aria-label="Note version history" onMouseDown={(event) => event.stopPropagation()}><header><div><small>LOCAL SNAPSHOTS</small><h2>Version history</h2></div><button type="button" onClick={() => setHistoryOpen(false)}><FiX /></button></header><p>Snapshots are stored in this browser after successful server saves. They are recovery aids, not a server audit log.</p>{versions.length ? <div className="version-list">{versions.map((version) => <article key={version.id}><div><b>{version.title}</b><small>{new Date(version.savedAt).toLocaleString()} · {version.noteType.replaceAll("_", " ")}</small><p>{version.content.slice(0, 180)}{version.content.length > 180 ? "…" : ""}</p></div><button type="button" onClick={() => restoreVersion(version)}>Restore</button></article>)}</div> : <EmptyState title="No snapshots yet" description="Save the note to create the first local version snapshot." />}</section></div>}

    {attachmentOpen && <div className="editor-modal-backdrop" role="presentation" onMouseDown={() => setAttachmentOpen(false)}><section className="editor-modal compact" role="dialog" aria-modal="true" aria-label="Link an attachment" onMouseDown={(event) => event.stopPropagation()}><header><div><small>URL-BACKED ATTACHMENT</small><h2>Add attachment</h2></div><button type="button" onClick={() => setAttachmentOpen(false)}><FiX /></button></header><form className="attachment-url-form" onSubmit={addAttachment}><label>Hosted file URL<input required type="url" value={attachmentUrl} onChange={(event) => setAttachmentUrl(event.target.value)} placeholder="https://…" /></label><label>Display name<input value={attachmentName} onChange={(event) => setAttachmentName(event.target.value)} placeholder="Optional file name" /></label><label>MIME type<select value={attachmentMime} onChange={(event) => setAttachmentMime(event.target.value)}><option value="application/pdf">PDF</option><option value="image/png">PNG image</option><option value="image/jpeg">JPEG image</option><option value="video/mp4">MP4 video</option><option value="text/plain">Text file</option><option value="application/octet-stream">Other file</option></select></label><p><FiBookOpen /> Binary upload and image cropping are not exposed by the current backend. This form persists the original hosted URL.</p><footer><button className="pp-button secondary" type="button" onClick={() => setAttachmentOpen(false)}>Cancel</button><button className="pp-button" disabled={saving}><FiLink /> Link attachment</button></footer></form></section></div>}
  </main></ProductShell>;
}