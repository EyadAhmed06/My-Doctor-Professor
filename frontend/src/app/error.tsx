"use client";

import Link from "next/link";
import { useEffect } from "react";
import { FiAlertTriangle, FiHome, FiRefreshCw } from "react-icons/fi";
import "@/components/app-state.css";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled route error", error);
  }, [error]);

  return <main className="app-route-state error"><section><span className="state-icon"><FiAlertTriangle /></span><h1>This workspace could not finish loading</h1><p>{error.message || "An unexpected runtime error interrupted the current route."}{error.digest ? ` Reference: ${error.digest}.` : ""}</p><div className="state-actions"><button className="primary" type="button" onClick={reset}><FiRefreshCw /> Try again</button><Link href="/dashboard"><FiHome /> Open dashboard</Link></div></section></main>;
}