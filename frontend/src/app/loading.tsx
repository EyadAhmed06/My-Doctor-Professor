import { FiActivity } from "react-icons/fi";
import "@/components/app-state.css";

export default function Loading() {
  return <main className="app-route-state" aria-busy="true" aria-live="polite"><section><span className="state-icon"><FiActivity /></span><h1>Preparing your workspace</h1><p>The route is loading without discarding the rest of the application state.</p><div className="route-loading-lines" aria-hidden="true"><i /><i /><i /></div></section></main>;
}