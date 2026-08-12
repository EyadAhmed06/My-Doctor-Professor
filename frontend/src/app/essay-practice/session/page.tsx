import { Suspense } from "react";
import { ConnectedEssayPracticeSession } from "@/components/connected-essay-practice-session";

export default function EssayPracticeSessionPage() {
  return <Suspense fallback={null}><ConnectedEssayPracticeSession /></Suspense>;
}
