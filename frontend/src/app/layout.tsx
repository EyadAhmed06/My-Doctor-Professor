import type { Metadata } from "next";
import "./globals.css";
import { AppThemeProvider } from "@/components/app-theme";

export const metadata: Metadata = {
  title: "The Doctor & My Professor",
  description: "Clinical learning, built for mastery.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><AppThemeProvider>{children}</AppThemeProvider></body></html>;
}
