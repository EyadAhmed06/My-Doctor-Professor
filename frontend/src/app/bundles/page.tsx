import { Suspense } from "react";
import { ConnectedBundlesPage } from "@/components/connected-bundles-page";

export default function Page(){
  return <Suspense fallback={<div className="product-auth-loading">Loading bundles…</div>}><ConnectedBundlesPage/></Suspense>;
}
