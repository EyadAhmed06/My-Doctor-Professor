"use client";

import { PageSkeleton } from "./async-state";
import { useAuth } from "./auth-provider";
import { ConnectedDashboardPage } from "./connected-dashboard-page";
import { RoleDashboardPage } from "./management-workspaces";

export function RoleAwareDashboardPage() {
  const { user, loading } = useAuth();
  if (loading || !user) return <main className="product-auth-loading"><PageSkeleton variant="workspace" label="Loading your dashboard" /></main>;
  if (user.role === "STUDENT") return <ConnectedDashboardPage />;
  return <RoleDashboardPage />;
}
