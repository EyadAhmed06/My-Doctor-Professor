import { Suspense } from "react";
import { ConnectedRoundsPage } from "@/components/connected-rounds-page";
import { ProtectedRoute } from "@/components/protected-route";

export default function Page() {
  return (
    <ProtectedRoute roles={["STUDENT"]} label="Loading question practice">
      <Suspense fallback={<div className="product-auth-loading">Loading question practice…</div>}>
        <ConnectedRoundsPage />
      </Suspense>
    </ProtectedRoute>
  );
}
