"use client";

import { useEffect } from "react";
import { PageSkeleton } from "./async-state";
import { useAuth } from "./auth-provider";
import { ConnectedDashboardPage } from "./connected-dashboard-page";
import { RoleDashboardPage } from "./management-workspaces";
import { useUx } from "./ux-provider";

export function RoleAwareDashboardEntry() {
  const { user, loading } = useAuth();
  const { celebrate } = useUx();

  useEffect(() => {
    if (user?.role !== "STUDENT") return;
    celebrate({
      id: "student-learning-workspace-opened",
      title: "Learning workspace activated",
      description: "Your bundles, review queue, notebook, analytics, and plan now form one learning loop.",
      points: 20,
    });
  }, [celebrate, user?.role]);

  if (loading || !user) {
    return <main className="product-auth-loading"><PageSkeleton variant="workspace" label="Loading your dashboard" /></main>;
  }

  if (user.role === "STUDENT") return <ConnectedDashboardPage />;
  return <RoleDashboardPage />;
}
