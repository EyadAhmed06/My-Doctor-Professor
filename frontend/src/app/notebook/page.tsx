import { Suspense } from "react";
import { ConnectedNotebookPage } from "@/components/connected-notebook-page";

export default function Page(){
  return <Suspense fallback={<div className="product-auth-loading">Loading notebook…</div>}><ConnectedNotebookPage/></Suspense>;
}
