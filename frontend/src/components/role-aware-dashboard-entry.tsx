"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageSkeleton } from "./async-state";
import { useAuth } from "./auth-provider";
import { ConnectedDashboardPage } from "./connected-dashboard-page";
import { RoleDashboardPage } from "./management-workspaces";
import { ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";

export function RoleAwareDashboardEntry() {
  const { user, loading } = useAuth();
  const { celebrate } = useUx();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedStage = Number(searchParams.get("stage"));
  const hasStage = Number.isInteger(requestedStage) && requestedStage >= 1 && requestedStage <= 4;

  useEffect(() => {
    if (user?.role !== "STUDENT") return;
    celebrate({
      id: "student-learning-workspace-opened",
      title: "Learning workspace activated",
      description: "Your bundles, review queue, notebook, analytics, and plan now form one learning loop.",
      points: 20,
    });
  }, [celebrate, user?.role]);

  useEffect(() => {
    if (user?.role !== "STUDENT" || !hasStage) return;
    router.replace(`/bundles?tab=curriculum&stage=${requestedStage}`);
  }, [hasStage, requestedStage, router, user?.role]);

  if (loading || !user || (user.role === "STUDENT" && hasStage)) {
    return <main className="product-auth-loading"><PageSkeleton variant="workspace" label={hasStage ? "Opening your academic stage" : "Loading your dashboard"} /></main>;
  }

  if (user.role === "STUDENT") {
    return <ProductShell search="Search cases, topics, or concepts"><ConnectedDashboardPage /></ProductShell>;
  }

  return <RoleDashboardPage />;
}
