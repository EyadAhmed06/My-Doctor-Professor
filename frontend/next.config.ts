import type { NextConfig } from "next";

const apiOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1").origin; }
  catch { return "http://localhost:3000"; }
})();

/**
 * Origin the anatomy .glb models are served from.
 *
 * Empty means same-origin (`/anatomy/<region>.glb` out of `public/`), which is the local
 * development default. In production the models live on S3/CDN instead: the binaries are
 * intentionally gitignored and are not copied into the Docker image.
 */
const anatomyAssetOrigin = (() => {
  const base = process.env.NEXT_PUBLIC_ANATOMY_ASSET_BASE?.trim();
  if (!base) return "";
  try { return new URL(base).origin; } catch { return ""; }
})();

/**
 * @param wasm grant 'wasm-unsafe-eval'. Needed only where a WebAssembly module is compiled.
 * @param extraConnect additional connect-src origins, for routes that fetch from a CDN.
 * @param extraImg additional img-src origins, for CDN-hosted static fallbacks/posters.
 */
function buildContentSecurityPolicy({ wasm = false, extraConnect = "", extraImg = "" } = {}) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    // Next.js currently emits framework bootstrap scripts inline. Application-owned inline
    // scripts are forbidden by the static audit; remove this fallback once nonce middleware
    // is enabled for every dynamically rendered route.
    //
    // 'wasm-unsafe-eval' is granted only where `wasm` is set - see the /anatomy entry in
    // headers() below. It permits WebAssembly compilation and nothing else; in particular it
    // does NOT permit eval() of strings, which is what 'unsafe-eval' would allow.
    `script-src 'self' 'unsafe-inline'${wasm ? " 'wasm-unsafe-eval'" : ""} https://accounts.google.com`,
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    `img-src 'self' data: blob: ${apiOrigin} https://lh3.googleusercontent.com${extraImg}`,
    `media-src 'self' blob: ${apiOrigin}`,
    `connect-src 'self' ${apiOrigin} https://accounts.google.com https://www.googleapis.com${extraConnect}`,
    "frame-src https://accounts.google.com",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
];

const productionOnly = (csp: string) => (process.env.NODE_ENV === "production" ? [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
] : []);

const securityHeaders = [...baseSecurityHeaders, ...productionOnly(buildContentSecurityPolicy())];

/**
 * The 3D anatomy viewer Draco-decodes its models in the browser, and that decoder is
 * WebAssembly. The decoder itself is self-hosted at /draco/ so no third-party origin is
 * involved, but compiling it still requires 'wasm-unsafe-eval'.
 *
 * Scoped to these routes deliberately: no other page in the application compiles WebAssembly,
 * and the checkout and authentication pages in particular keep the stricter policy.
 */
const anatomySecurityHeaders = [
  ...baseSecurityHeaders,
  ...productionOnly(buildContentSecurityPolicy({
    wasm: true,
    extraConnect: anatomyAssetOrigin ? ` ${anatomyAssetOrigin}` : "",
    extraImg: anatomyAssetOrigin ? ` ${anatomyAssetOrigin}` : "",
  })),
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["terminal.local", "localhost", "127.0.0.1"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Listed after the catch-all on purpose: when two sources match the same path and set
      // the same header key, Next keeps the last one, so this replaces the strict CSP above
      // rather than adding a second Content-Security-Policy header. That distinction matters
      // - two CSP headers are intersected by the browser, so a second, more permissive one
      // would have no effect at all.
      { source: "/anatomy/:path*", headers: anatomySecurityHeaders },
      { source: "/anatomy", headers: anatomySecurityHeaders },
    ];
  },
};

export default nextConfig;
