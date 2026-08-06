import { Suspense } from "react";
import { AuthenticatedBundlesPage } from "@/components/authenticated-bundles-page";

export default function Page() {
  return (
    <Suspense fallback={<div className="product-auth-loading">Loading bundles…</div>}>
      <AuthenticatedBundlesPage />
    </Suspense>
  );
}
