"use client";

import { FiAlertOctagon, FiRefreshCw } from "react-icons/fi";
import "@/components/app-state.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html><body><main className="app-route-state error"><section><span className="state-icon"><FiAlertOctagon /></span><h1>The application shell stopped unexpectedly</h1><p>{error.message || "A root-level error interrupted the application."}{error.digest ? ` Reference: ${error.digest}.` : ""}</p><div className="state-actions"><button className="primary" type="button" onClick={reset}><FiRefreshCw /> Restart application shell</button></div></section></main></body></html>;
}