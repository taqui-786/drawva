"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Moon01Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";

const KEY = "drawva-theme";

/**
 * Manual light/dark toggle. Initial state comes from localStorage, falling
 * back to the system preference; it keeps following system changes until the
 * user picks a side themselves. Only toggles the project's existing `.dark`
 * class, so no config is touched.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    let alive = true;
    const init = () => {
      if (!alive) return;
      const stored = localStorage.getItem(KEY);
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initial = stored ? stored === "dark" : systemDark;
      setDark(initial);
      document.documentElement.classList.toggle("dark", initial);
    };
    const t = window.setTimeout(init, 0);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(KEY) && alive) {
        setDark(e.matches);
        document.documentElement.classList.toggle("dark", e.matches);
      }
    };
    mq.addEventListener("change", onMedia);

    return () => {
      alive = false;
      clearTimeout(t);
      mq.removeEventListener("change", onMedia);
    };
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(KEY, next ? "dark" : "light");
  };

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      data-icon="true"
    >
      <HugeiconsIcon icon={dark ? Moon01Icon : Sun01Icon} className="size-4" aria-hidden />
    </Button>
  );
}