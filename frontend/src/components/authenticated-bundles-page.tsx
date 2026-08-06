"use client";

import { PageSkeleton } from "./async-state";
import { useAuth } from "./auth-provider";
import { ConnectedBundlesPage } from "./connected-bundles-page";

export function AuthenticatedBundlesPage() {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return (
      <main className="product-auth-loading">
        <PageSkeleton variant="workspace" label="Loading your bundles" />
      </main>
    );
  }

  return <ConnectedBundlesPage />;
}
