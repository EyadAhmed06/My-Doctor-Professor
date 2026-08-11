import { Suspense } from "react";
import { AuthenticatedBundlesPage } from "@/components/authenticated-bundles-page";
import { BundleQuizAvailabilityGuard } from "@/components/bundle-quiz-availability-guard";
import { ProtectedRoute } from "@/components/protected-route";

export default function Page() {
  return (
    <ProtectedRoute label="Verifying learning access">
      <BundleQuizAvailabilityGuard />
      <Suspense fallback={<div className="product-auth-loading">Loading bundles…</div>}>
        <AuthenticatedBundlesPage />
      </Suspense>
    </ProtectedRoute>
  );
}
