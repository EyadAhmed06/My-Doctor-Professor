import { Suspense } from "react";
import { ConnectedNoteEditorPage } from "@/components/connected-note-editor-page";
export default function Page(){return <Suspense fallback={<div className="product-auth-loading">Loading note editor…</div>}><ConnectedNoteEditorPage/></Suspense>}
