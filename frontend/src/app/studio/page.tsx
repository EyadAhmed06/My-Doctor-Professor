import { ProtectedRoute } from "@/components/protected-route";
import { StudentStudioPage } from "@/components/student-studio-page";

export default function Page() {
  return (
    <ProtectedRoute roles={["STUDENT"]} label="Opening Studio">
      <StudentStudioPage />
    </ProtectedRoute>
  );
}
