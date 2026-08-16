import type { NextConfig } from "next";

const apiOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1").origin; }
  catch { return "http://localhost:3000"; }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  `connect-src 'self' ${apiOrigin} https://accounts.google.com https://www.googleapis.com`,
  "frame-src https://accounts.google.com",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(process.env.NODE_ENV === "production" ? [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  ] : []),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["terminal.local", "localhost", "127.0.0.1"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
