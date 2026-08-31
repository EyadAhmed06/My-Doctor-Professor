import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { AppThemeProvider } from "@/components/app-theme";
import { AchievementFeedbackBridge } from "@/components/achievement-feedback-bridge";
import { BRAND_NAME, BRAND_TAGLINE } from "@/components/brand";
import { AuthProvider } from "@/components/auth-provider";
import { BundleQuizAvailabilityGuard } from "@/components/bundle-quiz-availability-guard";
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
import "@/components/phase-five-achievements.css";
import "@/components/completion-ux.css";
import "@/components/notifications-completion.css";
import "@/components/analytics-completion.css";
import "@/components/study-plan-completion.css";
import "@/components/study-plan-calendar-polish.css";
import "@/components/notebook-completion.css";
import "@/components/study-guides-completion.css";
import "@/components/bundles-completion.css";
import "@/components/bundle-sidebar-fix.css";
import "@/components/bundle-quiz-availability.css";
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
import "@/components/logout-modal-polish.css";
import "@/components/section9-polish.css";
import "@/components/final-theme-fixes.css";
import "@/components/release-regression-fixes.css";
import "@/components/register-submit-fix.css";
import "@/components/requested-ui-alignment-fixes.css";
import "@/components/authenticated-mobile-rendering-fix.css";
import "@/components/public-home-viewport-fix.css";
import "@/components/student-navbar-spacing-fix.css";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning>
    <head><Script src="/preference-bootstrap.js" strategy="beforeInteractive" /></head>
    <body><LocaleProvider><AppThemeProvider><PublicThemeAccess /><AuthProvider><UxProvider><AchievementFeedbackBridge /><GlobalKeyboardShortcuts /><BundleQuizAvailabilityGuard />{children}</UxProvider></AuthProvider></AppThemeProvider></LocaleProvider></body>
  </html>;
}
