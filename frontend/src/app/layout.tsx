import type { Metadata } from "next";
import "./globals.css";
import { AppThemeProvider } from "@/components/app-theme";
import { BRAND_NAME, BRAND_TAGLINE } from "@/components/brand";
import { AuthProvider } from "@/components/auth-provider";
import { UxProvider } from "@/components/ux-provider";
import "@/components/interaction-foundations.css";
import "@/components/notification-interactions.css";
import "@/components/continuity.css";
import "@/components/phase3-learning.css";
import "@/components/phase4-polish.css";
import "@/components/phase-five-ux.css";
import "@/components/phase-five-shell.css";
import "@/components/completion-ux.css";
import "@/components/notifications-completion.css";
import "@/components/analytics-completion.css";
import "@/components/study-plan-completion.css";
import "@/components/notebook-completion.css";
import "@/components/study-guides-completion.css";
import "@/components/bundles-completion.css";
import "@/components/settings-completion.css";
import "@/components/assessment-authoring-completion.css";
import "@/components/admin-operations-completion.css";
import "@/components/frontend-route-theme-audit.css";
import "@/components/dashboard-visual-fix.css";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
};

const themeBootstrap = `(() => {
  try {
    const preference = localStorage.getItem("mdp-theme") || "system";
    const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
    document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.themePreference = preference;
  } catch {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.themePreference = "system";
  }
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
    <body><AppThemeProvider><UxProvider><AuthProvider>{children}</AuthProvider></UxProvider></AppThemeProvider></body>
  </html>;
}
