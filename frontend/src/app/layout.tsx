import type { Metadata } from "next";
import "./globals.css";
import { AppThemeProvider } from "@/components/app-theme";
import { BRAND_NAME, BRAND_TAGLINE } from "@/components/brand";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><AppThemeProvider><AuthProvider>{children}</AuthProvider></AppThemeProvider></body></html>;
}
