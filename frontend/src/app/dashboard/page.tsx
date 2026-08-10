import { ProtectedRoute } from "@/components/protected-route";
import { RoleAwareDashboardEntry } from "@/components/role-aware-dashboard-entry";
import "@/components/dashboard-metric-icons-fix.css";

export default function Page() {
  return <ProtectedRoute roles={["STUDENT"]} label="Verifying student access"><RoleAwareDashboardEntry /></ProtectedRoute>;
}
