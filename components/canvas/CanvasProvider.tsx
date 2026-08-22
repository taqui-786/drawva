"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CanvasEngine } from "@/lib/canvas/engine";

interface CanvasContextValue {
  engine: CanvasEngine | null;
  ready: boolean;
  mountRef: (el: HTMLDivElement | null) => void;
}

const CanvasContext = createContext<CanvasContextValue>({
  engine: null,
  ready: false,
  mountRef: () => {},
});

export function useCanvas(): CanvasContextValue {
  return useContext(CanvasContext);
}

export function CanvasProvider({ children }: { children: React.ReactNode }) {
  const [engine, setEngine] = useState<CanvasEngine | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);

  const mountRef = useCallback((el: HTMLDivElement | null) => {
    engineRef.current?.destroy();
    engineRef.current = null;
    if (el) {
      const instance = new CanvasEngine(el);
      const isDark = document.documentElement.classList.contains("dark");
      instance.syncTheme(isDark);
      engineRef.current = instance;
      setEngine(instance);
    } else {
      setEngine(null);
    }
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      engineRef.current?.syncTheme(isDark);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  const ready = engine !== null;

  return (
    <CanvasContext.Provider value={{ engine, ready, mountRef }}>
      {children}
    </CanvasContext.Provider>
  );
}

export function useEngineRequestRender(): () => void {
  const { engine } = useCanvas();
  return useCallback(() => engine?.requestRender(), [engine]);
}
