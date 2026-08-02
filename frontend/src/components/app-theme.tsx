"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { FiMoon, FiSun } from "react-icons/fi";

type Theme = "light" | "dark";
const ThemeContext = createContext<{theme: Theme; setTheme: (theme: Theme) => void; toggleTheme: () => void} | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const saved = localStorage.getItem("mdp-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(saved === "dark" ? "dark" : "light");
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("mdp-theme", theme);
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme: () => setTheme(value => value === "dark" ? "light" : "dark") }}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useAppTheme must be used inside AppThemeProvider");
  return value;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useAppTheme();
  return <button className={`global-theme-toggle ${compact ? "compact" : ""}`} onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Use ${theme === "dark" ? "light" : "dark"} theme`}>
    <FiSun /><span><i /></span><FiMoon />
  </button>;
}
