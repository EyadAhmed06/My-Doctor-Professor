import type { Metadata } from "next";
import Link from "next/link";
import { REGIONS } from "@/components/anatomy/regions";
import { AnatomyAttribution } from "@/components/anatomy/anatomy-attribution";
import "@/components/anatomy/anatomy.css";

export const metadata: Metadata = {
  title: "3D anatomy",
  description: "Interactive 3D anatomical models.",
};

export default function Page() {
  return (
    <main className="anatomy-page">
      <header className="anatomy-page__header">
        <h1>3D anatomy</h1>
        <p>Pick a region. Click any structure to select and name it.</p>
      </header>
      <ul className="anatomy-index">
        {Object.entries(REGIONS).map(([slug, region]) => (
          <li key={slug}>
            <Link href={`/anatomy/${slug}`}>
              <strong>{region.label}</strong>
              <span>{region.structures.length.toLocaleString()} structures</span>
            </Link>
          </li>
        ))}
      </ul>
      <AnatomyAttribution />
    </main>
  );
}
