"use client";

import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({
  theme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
  mounted: false,
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("addp_theme") || "dark";
      setThemeState(savedTheme);
      applyThemeToDom(savedTheme);
    } catch {
      applyThemeToDom("dark");
    }
    setMounted(true);
  }, []);

  const applyThemeToDom = (t) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (t === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
      root.setAttribute("data-theme", "light");
      root.style.colorScheme = "light";
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
      root.style.colorScheme = "dark";
    }
  };

  const setTheme = (t) => {
    const validTheme = t === "light" ? "light" : "dark";
    setThemeState(validTheme);
    try {
      localStorage.setItem("addp_theme", validTheme);
    } catch {}
    applyThemeToDom(validTheme);
  };

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
