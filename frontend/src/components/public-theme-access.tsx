"use client";

import { ThemeToggle } from "./app-theme";
import { GlobalLanguageAccess } from "./global-language-access";
import "./public-theme-access.css";

export function PublicThemeAccess() {
  return <>
    <aside className="public-theme-access" aria-label="Appearance controls">
      <span>Appearance</span>
      <ThemeToggle compact />
    </aside>
    <GlobalLanguageAccess />
  </>;
}
