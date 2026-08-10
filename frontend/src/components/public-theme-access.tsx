"use client";

import { FiGlobe } from "react-icons/fi";
import { ThemeToggle } from "./app-theme";
import { LanguageSwitcher } from "./locale-provider";
import "./public-theme-access.css";

export function PublicThemeAccess() {
  return <>
    <aside className="public-theme-access" aria-label="Appearance controls">
      <span>Appearance</span>
      <ThemeToggle compact />
    </aside>
    <aside className="global-language-access" aria-label="Language controls">
      <FiGlobe aria-hidden="true" />
      <LanguageSwitcher compact />
    </aside>
  </>;
}
