import { Suspense } from "react";
import { AuthenticatedBundlesPage } from "@/components/authenticated-bundles-page";
import { ProtectedRoute } from "@/components/protected-route";

export default function Page() {
  return (
    <ProtectedRoute label="Verifying learning access">
      <Suspense fallback={<div className="product-auth-loading">Loading bundles…</div>}>
        <AuthenticatedBundlesPage />
      </Suspense>
    </ProtectedRoute>
  );
}
