import { useEffect, useRef, useState } from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
type Theme = "system" | "light" | "dark";
const options = [
  { value: "system", label: "跟随系统", Icon: Monitor },
  { value: "light", label: "浅色模式", Icon: Sun },
  { value: "dark", label: "深色模式", Icon: Moon },
] as const;
export function ThemeButton() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const value = localStorage.getItem("secondlook-theme");
      return value === "light" || value === "dark" ? value : "system";
    } catch {
      return "system";
    }
  });
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
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
      /* Browser storage can be unavailable. */
    }
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const current = options.find((option) => option.value === theme)!;
  const Icon = current.Icon;
  return (
    <div
      ref={container}
      className="theme-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="theme-button"
        title={`外观：${current.label}`}
        aria-label={`外观：${current.label}`}
        aria-expanded={open}
        aria-controls="appearance-options"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon size={18} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="appearance-options"
            className="appearance-options"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
          >
            <p>外观</p>
            {options.map(({ value, label, Icon: OptionIcon }) => (
              <button
                key={value}
                aria-pressed={theme === value}
                onClick={() => {
                  setTheme(value);
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                <OptionIcon size={16} />
                <span>{label}</span>
                {theme === value && <Check size={15} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
