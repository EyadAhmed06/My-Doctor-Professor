import { Suspense } from "react";
import { ConnectedPearlEditorPage } from "@/components/connected-pearl-editor-page";

export default function Page() {
  return <Suspense fallback={<div className="product-auth-loading">Loading pearl editor…</div>}><ConnectedPearlEditorPage /></Suspense>;
}
