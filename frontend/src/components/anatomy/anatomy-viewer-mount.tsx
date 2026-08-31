"use client";

/**
 * Client boundary for the 3D viewer.
 *
 * This file exists so `ssr: false` is legal: in the App Router that option is rejected
 * outright inside a Server Component (confirmed against the Next 16.3.3 lazy-loading guide
 * in node_modules/next/dist/docs), so the dynamic import must happen inside a component
 * that is already "use client".
 */

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AnatomyAttribution } from "./anatomy-attribution";
import type { AnatomyStructure, AnatomySystem } from "./anatomy-viewer";

const AnatomyViewer = dynamic(() => import("./anatomy-viewer"), {
  ssr: false,
  loading: () => (
    <div className="anatomy-viewer__boot" role="status">
      <div className="anatomy-viewer__bar anatomy-viewer__bar--indeterminate"><i /></div>
      <p>Preparing 3D viewer…</p>
    </div>
  ),
});

/** Feature-detects WebGL rather than trusting a user-agent string. */
function detectWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return false;
    // Release it immediately; contexts are a scarce resource.
    (gl.getExtension("WEBGL_lose_context") as WEBGL_lose_context | null)?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function StaticFallback({
  title, poster, structures, removedTextures,
}: { title: string; poster: string; structures: AnatomyStructure[]; removedTextures: string[] }) {
  return (
    <div className="anatomy-viewer anatomy-viewer--fallback">
      <div className="anatomy-viewer__stage">
        {/* eslint-disable-next-line @next/next/no-img-element -- a plain img keeps the fallback free of JS the failing device may also lack */}
        <img src={poster} alt={`Still image of the ${title.toLowerCase()} model`} />
        <p className="anatomy-viewer__notice">
          Interactive 3D is unavailable on this device or browser, so a still image is shown
          instead. The structures below are the ones the 3D model labels.
        </p>
      </div>
      <div className="anatomy-viewer__side">
        <h2 className="anatomy-viewer__title">{title}</h2>
        <ol className="anatomy-viewer__list anatomy-viewer__list--static">
          {structures.map((s) => <li key={s.id}>{s.name}</li>)}
        </ol>
        <AnatomyAttribution removedTextures={removedTextures} compact />
      </div>
    </div>
  );
}

export function AnatomyViewerMount({
  url, title, poster, structures, systems, removedTextures = [], debug = false,
}: {
  url: string;
  title: string;
  poster: string;
  structures: AnatomyStructure[];
  systems: AnatomySystem[];
  removedTextures?: string[];
  debug?: boolean;
}) {
  // `null` = not yet decided; rendering either branch first would flash the wrong one.
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => { setSupported(detectWebGL()); }, []);

  if (supported === null) {
    return <div className="anatomy-viewer__boot" role="status"><p>Checking device support…</p></div>;
  }
  if (!supported) {
    return <StaticFallback title={title} poster={poster} structures={structures} removedTextures={removedTextures} />;
  }
  return <AnatomyViewer url={url} title={title} systems={systems} removedTextures={removedTextures} debug={debug} />;
}
