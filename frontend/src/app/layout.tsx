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

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><AppThemeProvider><UxProvider><AuthProvider>{children}</AuthProvider></UxProvider></AppThemeProvider></body></html>;
}