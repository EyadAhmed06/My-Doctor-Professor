import type { Metadata } from "next";
import "./globals.css";
import { AppThemeProvider } from "@/components/app-theme";
import { BRAND_NAME, BRAND_TAGLINE } from "@/components/brand";
import { AuthProvider } from "@/components/auth-provider";
import { GlobalKeyboardShortcuts } from "@/components/global-keyboard-shortcuts";
import { LocaleProvider } from "@/components/locale-provider";
import { PublicThemeAccess } from "@/components/public-theme-access";
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
import "@/components/internal-medical-visuals.css";
import "@/components/flashcard-3d.css";
import "@/components/google-auth.css";
import "@/components/locale.css";
import "@/components/platform-completion.css";
import "@/components/mobile-completion.css";
import "@/components/runtime-performance.css";
import "@/components/reference-light-palette.css";
import "@/components/reference-light-palette-exact.css";
import "@/components/reference-light-palette-metallic.css";
import "@/components/brand-light-navbar.css";
import "@/components/assessment-session-responsive-fix.css";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
};

const preferenceBootstrap = `(() => {
  try {
    const preference = localStorage.getItem("mdp-theme") || "system";
    const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
    document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.themePreference = preference;
    const locale = localStorage.getItem("mdp-locale") === "ar" ? "ar" : "en";
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.locale = locale;
  } catch {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.themePreference = "system";
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    document.documentElement.dataset.locale = "en";
  }
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: preferenceBootstrap }} /></head>
    <body><LocaleProvider><AppThemeProvider><PublicThemeAccess /><UxProvider><AuthProvider><GlobalKeyboardShortcuts />{children}</AuthProvider></UxProvider></AppThemeProvider></LocaleProvider></body>
  </html>;
}
