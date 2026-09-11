"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { FiMoon, FiSun } from "react-icons/fi";

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";
type ThemeContextValue = {
  theme: Theme;
  preference: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialPreference(): ThemePreference {
  if (typeof document === "undefined") return "system";
  const value = document.documentElement.dataset.themePreference;
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function initialTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const [theme, setResolvedTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    const saved = localStorage.getItem("mdp-theme");
    setPreference(saved === "dark" || saved === "light" || saved === "system" ? saved : initialPreference());
  }, []);

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setResolvedTheme(preference === "system" ? (media.matches ? "dark" : "light") : preference);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
    localStorage.setItem("mdp-theme", preference);
  }, [preference, theme]);

  const setTheme = (value: ThemePreference) => setPreference(value);
  const toggleTheme = () => setPreference(theme === "dark" ? "light" : "dark");

  return <ThemeContext.Provider value={{ theme, preference, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useAppTheme must be used inside AppThemeProvider");
  return value;
}

export function ThemeToggle({ compact = false, iconOnly = false }: { compact?: boolean; iconOnly?: boolean }) {
  const { theme, toggleTheme } = useAppTheme();
  return <button type="button" className={`global-theme-toggle ${compact ? "compact" : ""} ${iconOnly ? "icon-only" : ""}`} onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Use ${theme === "dark" ? "light" : "dark"} theme`}>
    {iconOnly ? (theme === "dark" ? <FiSun /> : <FiMoon />) : <><FiSun /><span><i /></span><FiMoon /></>}
  </button>;
}
