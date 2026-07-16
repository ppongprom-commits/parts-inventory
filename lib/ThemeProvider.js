"use client";

import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);
const STORAGE_KEY = "parts_inventory_theme";

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState("light"); // default สว่างเสมอ
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let saved = "light";
    try {
      saved = localStorage.getItem(STORAGE_KEY) || "light";
    } catch {
      // ignore (private mode)
    }
    setThemeState(saved);
    document.documentElement.setAttribute("data-theme", saved);
    setMounted(true);
  }, []);

  function setTheme(newTheme) {
    setThemeState(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // ignore
    }
  }

  function toggleTheme() {
    setTheme(theme === "light" ? "dark" : "light");
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme ต้องใช้ภายใน <ThemeProvider>");
  return ctx;
}
