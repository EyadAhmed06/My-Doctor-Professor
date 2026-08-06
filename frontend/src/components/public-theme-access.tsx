"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "./app-theme";
import "./public-theme-access.css";

const publicRoutes = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/verify-otp",
]);

export function PublicThemeAccess() {
  const pathname = usePathname();
  if (!publicRoutes.has(pathname)) return null;

  return <aside className="public-theme-access" aria-label="Appearance controls">
    <span>Appearance</span>
    <ThemeToggle compact />
  </aside>;
}
