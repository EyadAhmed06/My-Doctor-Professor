import { Suspense } from "react";
import { ConnectedEssayPracticePage } from "@/components/connected-essay-practice-page";

export default function EssayPracticePage() {
  return <Suspense fallback={null}><ConnectedEssayPracticePage /></Suspense>;
}
