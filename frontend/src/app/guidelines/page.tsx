import { Suspense } from "react";
import { AdvancedStudyGuidesPage } from "@/components/advanced-study-guides-page";

export default function Page() {
  return <Suspense fallback={<div className="product-auth-loading">Loading study guides…</div>}><AdvancedStudyGuidesPage /></Suspense>;
}