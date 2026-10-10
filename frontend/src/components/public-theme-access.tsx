"use client";

import { ThemeToggle } from "./app-theme";
import { usePathname } from "next/navigation";
import { useLocale } from "./locale-provider";
import "./public-theme-access.css";

export function PublicThemeAccess() {
  const { locale, setLocale } = useLocale();
  const pathname = usePathname();
  if (pathname !== "/") return null;
  return <aside className="public-theme-access" style={{ display: "flex", width: "auto", height: "auto", gap: "6px" }} aria-label="Appearance controls">
    <span>Appearance</span>
    <ThemeToggle compact iconOnly />
    <div className="global-language-access" role="group" aria-label="Interface language">
      <button type="button" aria-pressed={locale === "ar"} onClick={() => setLocale("ar")}>ع</button>
      <button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
    </div>
  </aside>;
}
