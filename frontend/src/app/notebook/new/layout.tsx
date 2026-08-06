import { Suspense } from "react";
import { AdvancedNotebookEditor } from "@/components/advanced-notebook-editor";

export default function Layout({ children }: { children: React.ReactNode }) {
  void children;
  return <Suspense fallback={<div className="product-auth-loading">Loading note editor…</div>}><AdvancedNotebookEditor /></Suspense>;
}