import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AnatomyViewerMount } from "@/components/anatomy/anatomy-viewer-mount";
import { anatomyModelUrl, anatomyPosterUrl } from "@/components/anatomy/asset-base";
import { getRegion, REGION_SLUGS, REGIONS } from "@/components/anatomy/regions";
import "@/components/anatomy/anatomy.css";

export function generateStaticParams() {
  return REGION_SLUGS.map((region) => ({ region }));
}

export async function generateMetadata({ params }: { params: Promise<{ region: string }> }): Promise<Metadata> {
  const { region } = await params;
  const entry = getRegion(region);
  if (!entry) return { title: "Anatomy" };
  return {
    title: `${entry.label} — 3D anatomy`,
    description: `Interactive 3D model of the ${entry.label.toLowerCase()}, with ${entry.structures.length} named structures.`,
  };
}

/**
 * A Server Component: everything touching three.js sits behind AnatomyViewerMount, which is
 * the client boundary. Append ?debug=1 for the live FPS / draw call / heap readout.
 */
export default async function Page({
  params, searchParams,
}: {
  params: Promise<{ region: string }>;
  searchParams: Promise<{ debug?: string }>;
}) {
  const { region } = await params;
  const { debug } = await searchParams;
  const entry = getRegion(region);
  if (!entry) notFound();

  return (
    <main className="anatomy-page">
      <header className="anatomy-page__header">
        <h1>{entry.label}</h1>
        <p>{entry.structures.length.toLocaleString()} selectable structures.</p>
        <nav className="anatomy-page__nav" aria-label="Anatomical regions">
          {Object.entries(REGIONS).map(([slug, item]) => (
            <Link key={slug} href={`/anatomy/${slug}`} aria-current={slug === region ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <AnatomyViewerMount
        url={anatomyModelUrl(region)}
        poster={anatomyPosterUrl(region)}
        title={entry.label}
        structures={entry.structures}
        systems={entry.systems}
        removedTextures={entry.nonCommercialTexturesRemoved}
        debug={debug === "1"}
      />
    </main>
  );
}
