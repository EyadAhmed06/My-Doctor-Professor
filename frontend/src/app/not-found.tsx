import Link from "next/link";
import { FiArrowLeft, FiCompass, FiHome } from "react-icons/fi";
import "@/components/app-state.css";

export default function NotFound() {
  return <main className="app-route-state"><section><span className="state-icon"><FiCompass /></span><h1>That workspace does not exist</h1><p>The address may be outdated, unavailable to your role, or missing a required resource identifier.</p><div className="state-actions"><Link className="primary" href="/dashboard"><FiHome /> Open dashboard</Link><Link href="/bundles"><FiArrowLeft /> Browse bundles</Link></div></section></main>;
}