/**
 * Where the anatomy models and poster images are served from.
 *
 * The .glb files are gitignored and are not copied into the Docker image, so in production
 * they are hosted on S3/CDN rather than by the app container. `NEXT_PUBLIC_ANATOMY_ASSET_BASE`
 * points at that origin; leaving it unset falls back to same-origin `/anatomy/...` out of
 * `public/`, which is what local development uses.
 *
 * Two things must stay in step when this is set:
 *   - the origin is added to `connect-src` for the /anatomy routes (see next.config.ts), or
 *     the browser blocks the fetch;
 *   - the CDN must send a long, immutable `Cache-Control`. These files are content-addressed
 *     by region name and change only when the pipeline is re-run, and re-downloading 4 MB on
 *     every visit is exactly what this work set out to avoid.
 */
const RAW_BASE = process.env.NEXT_PUBLIC_ANATOMY_ASSET_BASE?.trim() ?? "";

/** Normalised to have no trailing slash, so callers can always join with a leading one. */
export const ANATOMY_ASSET_BASE = RAW_BASE.replace(/\/+$/, "");

export function anatomyModelUrl(region: string): string {
  return `${ANATOMY_ASSET_BASE}/anatomy/${region}.glb`;
}

export function anatomyPosterUrl(region: string): string {
  return `${ANATOMY_ASSET_BASE}/anatomy/${region}-fallback.png`;
}
