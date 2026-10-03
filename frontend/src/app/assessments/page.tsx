import { ConnectedAssessmentsPage } from "@/components/connected-assessments-page";
import { ProtectedRoute } from "@/components/protected-route";

export default function Page() {
  return (
    <ProtectedRoute roles={["STUDENT"]} label="Loading questions and assessments">
      <ConnectedAssessmentsPage />
    </ProtectedRoute>
  );
}
