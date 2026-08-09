"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [requestedStage, setRequestedStage] = useState<number | null>(null);
  const [stageResolved, setStageResolved] = useState(false);

  useEffect(() => {
    const value = Number(new URLSearchParams(window.location.search).get("stage"));
    setRequestedStage(Number.isInteger(value) && value >= 1 && value <= 4 ? value : null);
    setStageResolved(true);
  }, []);

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
    if (!stageResolved || user?.role !== "STUDENT" || requestedStage === null) return;
    router.replace(`/bundles?tab=curriculum&stage=${requestedStage}`);
  }, [requestedStage, router, stageResolved, user?.role]);

  if (loading || !user || !stageResolved || (user.role === "STUDENT" && requestedStage !== null)) {
    return <main className="product-auth-loading"><PageSkeleton variant="workspace" label={requestedStage !== null ? "Opening your academic stage" : "Loading your dashboard"} /></main>;
  }

  if (user.role === "STUDENT") {
    return <ProductShell search="Search cases, topics, or concepts"><ConnectedDashboardPage /></ProductShell>;
  }

  return <RoleDashboardPage />;
}
