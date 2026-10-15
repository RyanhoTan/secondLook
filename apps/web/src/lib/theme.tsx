import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
type Theme = "system" | "light" | "dark";
export function ThemeButton() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const value = localStorage.getItem("secondlook-theme");
      return value === "light" || value === "dark" ? value : "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    try {
      localStorage.setItem("secondlook-theme", theme);
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label = { system: "跟随系统", light: "浅色模式", dark: "深色模式" }[
    theme
  ];
  return (
    <button
      className="theme-button"
      onClick={() =>
        setTheme(
          theme === "system" ? "light" : theme === "light" ? "dark" : "system",
        )
      }
      aria-label={`主题：${label}，点击切换`}
    >
      <Icon size={17} />
      <span>{label}</span>
    </button>
  );
}
