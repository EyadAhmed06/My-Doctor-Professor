import { Suspense } from "react";
import { ConnectedPastExamsPage } from "@/components/connected-past-exams-page";
import { ProtectedRoute } from "@/components/protected-route";

export default function Page() {
  return (
    <ProtectedRoute roles={["STUDENT"]} label="Loading configured exams">
      <Suspense fallback={<div className="product-auth-loading">Loading configured exams…</div>}>
        <ConnectedPastExamsPage />
      </Suspense>
    </ProtectedRoute>
  );
}
