"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageSkeleton } from "./async-state";
import { useAuth } from "./auth-provider";
import { ConnectedDashboardPage } from "./connected-dashboard-page";
import { RoleDashboardPage } from "./management-workspaces";
import { ProductShell } from "./product-shell";
import { useUx } from "./ux-provider";

type AcademicTarget = {
  stage: number;
  semester: number | null;
  track: "clerkships" | "exams" | null;
};

export function RoleAwareDashboardEntry() {
  const { user, loading } = useAuth();
  const { celebrate } = useUx();
  const router = useRouter();
  const [academicTarget, setAcademicTarget] = useState<AcademicTarget | null>(null);
  const [stageResolved, setStageResolved] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stage = Number(params.get("stage"));
    if (!Number.isInteger(stage) || stage < 1 || stage > 4) {
      setStageResolved(true);
      return;
    }
    const semesterValue = Number(params.get("semester"));
    const semester = Number.isInteger(semesterValue) && semesterValue >= 1 && semesterValue <= 12 ? semesterValue : null;
    const trackValue = params.get("track");
    const track = trackValue === "clerkships" || trackValue === "exams" ? trackValue : null;
    setAcademicTarget({ stage, semester, track });
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
    if (!stageResolved || user?.role !== "STUDENT" || !academicTarget) return;
    const params = new URLSearchParams({
      tab: academicTarget.track === "exams" ? "exams" : "curriculum",
      stage: String(academicTarget.stage),
    });
    if (academicTarget.semester !== null) params.set("semester", String(academicTarget.semester));
    if (academicTarget.track) params.set("track", academicTarget.track);
    router.replace(`/bundles?${params.toString()}`);
  }, [academicTarget, router, stageResolved, user?.role]);

  if (loading || !user || !stageResolved || (user.role === "STUDENT" && academicTarget !== null)) {
    return <main className="product-auth-loading"><PageSkeleton variant="workspace" label={academicTarget ? "Opening your academic stage" : "Loading your dashboard"} /></main>;
  }

  if (user.role === "STUDENT") {
    return <ProductShell search="Search cases, topics, or concepts"><ConnectedDashboardPage /></ProductShell>;
  }

  return <RoleDashboardPage />;
}
