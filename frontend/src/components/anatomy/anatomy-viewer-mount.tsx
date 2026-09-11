"use client";

/**
 * Client boundary for the 3D viewer.
 *
 * This file exists so `ssr: false` is legal: in the App Router that option is rejected
 * outright inside a Server Component, so the dynamic import must happen inside a component
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
    (gl.getExtension("WEBGL_lose_context") as WEBGL_lose_context | null)?.loseContext();
    return true;
  } catch {
    return false;
  }
}

type FallbackProps = {
  title: string;
  poster: string;
  structures: AnatomyStructure[];
  removedTextures: string[];
  notice: string;
  actionLabel?: string;
  onAction?: () => void;
};

function StaticFallback({
  title, poster, structures, removedTextures, notice, actionLabel, onAction,
}: FallbackProps) {
  return (
    <div className="anatomy-viewer anatomy-viewer--fallback">
      <div className="anatomy-viewer__stage">
        {/* eslint-disable-next-line @next/next/no-img-element -- keep the fallback independent from Next image optimisation */}
        <img src={poster} alt={`Still image of the ${title.toLowerCase()} model`} loading="lazy" decoding="async" />
        <p className="anatomy-viewer__notice">{notice}</p>
        {actionLabel && onAction ? <button className="anatomy-viewer__load" type="button" onClick={onAction}>{actionLabel}</button> : null}
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

type AssetProbe = { state: "idle" | "checking" | "ready" | "failed"; message?: string };

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
  const [supported, setSupported] = useState<boolean | null>(null);
  const [defer3D, setDefer3D] = useState(false);
  const [probeNonce, setProbeNonce] = useState(0);
  const [assetProbe, setAssetProbe] = useState<AssetProbe>({ state: "idle" });

  useEffect(() => {
    setSupported(detectWebGL());
    setDefer3D(window.matchMedia("(max-width: 700px), (pointer: coarse)").matches);
  }, []);

  // Keep a missing CDN/S3 object from reaching GLTFLoader. A Next.js/S3 error page starts
  // with '<', which GLTFLoader then reports as a misleading JSON parse failure. HEAD is cheap,
  // verifies status/content type before the multi-megabyte download begins, and lets the UI
  // degrade to the static poster instead of replacing the page with an error state.
  useEffect(() => {
    if (!supported || defer3D) {
      setAssetProbe({ state: "idle" });
      return;
    }

    const controller = new AbortController();
    setAssetProbe({ state: "checking" });

    (async () => {
      try {
        const response = await fetch(url, {
          method: "HEAD",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        if (contentType.includes("text/html") || contentType.includes("application/json")) {
          throw new Error(`unexpected ${contentType || "response type"}`);
        }

        const contentLength = Number(response.headers.get("content-length") || "0");
        if (contentLength > 0 && contentLength < 12) throw new Error("model response is too small");

        setAssetProbe({ state: "ready" });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "asset request failed";
        setAssetProbe({ state: "failed", message });
      }
    })();

    return () => controller.abort();
  }, [supported, defer3D, url, probeNonce]);

  if (supported === null) {
    return <div className="anatomy-viewer__boot" role="status"><p>Checking device support…</p></div>;
  }

  if (!supported) {
    return <StaticFallback
      title={title}
      poster={poster}
      structures={structures}
      removedTextures={removedTextures}
      notice="Interactive 3D is unavailable on this device or browser, so a still image is shown instead. The structures below are the ones the 3D model labels."
    />;
  }

  if (defer3D) {
    return <StaticFallback
      title={title}
      poster={poster}
      structures={structures}
      removedTextures={removedTextures}
      notice="A lightweight preview is shown to save mobile data and battery. Load the interactive model when you are ready."
      actionLabel="Load interactive 3D"
      onAction={() => setDefer3D(false)}
    />;
  }

  if (assetProbe.state === "idle" || assetProbe.state === "checking") {
    return (
      <div className="anatomy-viewer__boot" role="status">
        <div className="anatomy-viewer__bar anatomy-viewer__bar--indeterminate"><i /></div>
        <p>Checking 3D model…</p>
      </div>
    );
  }

  if (assetProbe.state === "failed") {
    return <StaticFallback
      title={title}
      poster={poster}
      structures={structures}
      removedTextures={removedTextures}
      notice={`The interactive model is temporarily unavailable (${assetProbe.message ?? "asset check failed"}). A still image is shown instead.`}
      actionLabel="Try 3D again"
      onAction={() => setProbeNonce((value) => value + 1)}
    />;
  }

  return <AnatomyViewer url={url} title={title} systems={systems} removedTextures={removedTextures} debug={debug} />;
}
