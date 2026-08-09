import { ProtectedRoute } from "@/components/protected-route";
import { RoleAwareDashboardEntry } from "@/components/role-aware-dashboard-entry";

export default function Page() {
  return <ProtectedRoute roles={["STUDENT"]} label="Verifying student access"><RoleAwareDashboardEntry /></ProtectedRoute>;
}
