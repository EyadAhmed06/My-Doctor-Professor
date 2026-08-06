import { Suspense } from "react";
import { ConnectedStudyGuidesPage } from "@/components/connected-study-guides-page";

export default function Page(){
  return <Suspense fallback={<div className="product-auth-loading">Loading study guides…</div>}><ConnectedStudyGuidesPage/></Suspense>;
}
