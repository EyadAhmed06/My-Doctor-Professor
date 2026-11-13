"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "./auth-provider";

type Annotation = {
  id: string;
  kind: "NOTE" | "HIGHLIGHT";
  pageNumber: number;
  body: string;
  createdAt: string;
};

export function PdfResourceAnnotations({ resourceId }: { resourceId: string }) {
  const { request } = useAuth();
  const [items, setItems] = useState<Annotation[]>([]);
  const [kind, setKind] = useState<"NOTE" | "HIGHLIGHT">("NOTE");
  const [page, setPage] = useState(1);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setItems([]);
    setError(null);
    void request<Annotation[]>(`/academic/resources/${resourceId}/annotations`)
      .then(rows => { if (active) setItems(rows); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load annotations"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [resourceId, request]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !body.trim() || !Number.isSafeInteger(page) || page < 1) return;
    setBusy(true);
    setError(null);
    setSavedMessage("");
    try {
      const result = await request<Annotation>(`/academic/resources/${resourceId}/annotations`, {
        method: "POST",
        body: { kind, page_number: page, body: body.trim() },
      });
      setItems(current => [...current, result].sort((a, b) => a.pageNumber - b.pageNumber));
      setBody("");
      setSavedMessage("Saved to your account. It will still be here after refresh.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed. Your text is still here; retry.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy || !window.confirm("Delete this saved annotation?")) return;
    setBusy(true);
    setError(null);
    try {
      await request(`/academic/resources/${resourceId}/annotations/${id}`, { method: "DELETE" });
      setItems(current => current.filter(item => item.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete annotation");
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label="Saved PDF annotations" style={{ padding: 16, borderTop: "1px solid var(--pp-border, #dedee7)" }}>
    <h3 style={{ marginBottom: 8 }}>Saved notes & highlighted passages</h3>
    <p style={{ marginBottom: 12, fontSize: 13 }}>
      Save a note or copy a passage from the PDF and mark it as a highlight. These annotations are stored with your account.
      Marks drawn directly inside the browser PDF viewer are not synced.
    </p>
    <form onSubmit={save} style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label>Type <select value={kind} onChange={event => setKind(event.target.value as "NOTE" | "HIGHLIGHT")}>
          <option value="NOTE">Note</option><option value="HIGHLIGHT">Highlight quotation</option>
        </select></label>
        <label>PDF page <input aria-label="PDF page number" type="number" min={1} max={10000} step={1} value={page} onChange={event => setPage(Number(event.target.value))} style={{ width: 75 }} /></label>
      </div>
      <textarea aria-label="Annotation text" rows={3} maxLength={4000} value={body}
        onChange={event => { setBody(event.target.value); setSavedMessage(""); }}
        placeholder={kind === "NOTE" ? "Write your note..." : "Paste the text you want to remember as highlighted..."}
        style={{ width: "100%", resize: "vertical" }} />
      <button type="submit" className="pp-button" disabled={busy || loading || !body.trim() || page < 1}>
        {busy ? "Saving..." : "Save annotation"}
      </button>
    </form>
    {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
    {savedMessage && <p role="status">{savedMessage}</p>}
    {loading ? <p>Loading saved annotations...</p> : items.length === 0 ? <p>No saved annotations yet.</p> :
      <ul style={{ listStyle: "none", padding: 0, marginTop: 12, display: "grid", gap: 8 }}>
        {items.map(item => <li key={item.id} style={{ padding: 10, borderRadius: 8, border: "1px solid var(--pp-border, #dedee7)", borderLeft: item.kind === "HIGHLIGHT" ? "4px solid #dbad36" : "4px solid #638fd5" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <strong>{item.kind === "HIGHLIGHT" ? "Highlighted passage" : "Note"} · Page {item.pageNumber}</strong>
            <button type="button" onClick={() => void remove(item.id)} disabled={busy} aria-label="Delete annotation">Delete</button>
          </div>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 6 }}>{item.body}</p>
        </li>)}
      </ul>}
  </section>;
}
