"use client";
// ============================================================
// Drawva — Canvas App (client component with PenEcho AI Header)
// Composes CanvasProvider + CanvasToolbarLeft + CanvasViewport + CanvasToolbarRight
// Full-screen playground layout with AI header controls.
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { CanvasProvider } from "@/components/canvas/CanvasProvider";
import { CanvasToolbarLeft } from "@/components/canvas/CanvasToolbarLeft";
import { CanvasToolbarRight } from "@/components/canvas/CanvasToolbarRight";
import { CanvasViewport } from "@/components/canvas/CanvasViewport";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiBrain02Icon,
  StructureIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";

type HugeIcon = Parameters<typeof HugeiconsIcon>[0]["icon"];
function Icon({ icon, size = 15 }: { icon: HugeIcon; size?: number }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.8} />;
}

export function CanvasApp() {
  const [aiMode, setAiMode] = useState<"auto" | "manual">("auto");
  const [reasoning, setReasoning] = useState<"none" | "low" | "medium" | "high" | "max">("medium");
  const [showPluginsModal, setShowPluginsModal] = useState(false);
  const [plugins, setPlugins] = useState({
    professionalDiagrams: true,
    generalHtml: true,
    smilesChemistry: true,
    vegaCharts: true,
  });

  return (
    <CanvasProvider>
      <div className="flex h-dvh w-screen overflow-hidden bg-background">
        {/* Primary tools on left sidebar */}
        <CanvasToolbarLeft />

        {/* Canvas workspace in middle */}
        <main className="flex flex-1 flex-col overflow-hidden relative">
          {/* Top header bar — PenEcho AI Control Bar */}
          <header className="flex h-11 items-center justify-between border-b border-border/60 bg-card/80 px-4 backdrop-blur-sm shrink-0 z-10 select-none">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="flex size-6.5 items-center justify-center rounded-lg bg-foreground text-background text-xs font-black">
                  D
                </span>
                <span className="font-heading font-black text-xs uppercase tracking-widest text-foreground">
                  Drawva
                </span>
              </div>

              {/* Status Indicator Pill */}
              <div
                className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                  aiMode === "auto"
                    ? "bg-muted/60 text-muted-foreground"
                    : "bg-muted/30 text-muted-foreground/50"
                }`}
                title={
                  aiMode === "auto"
                    ? "Auto AI: watching for pen strokes — observations run 2.5s after you stop drawing"
                    : "Auto observation is off — use the prompt bar to trigger AI manually"
                }
              >
                <span
                  className={`size-2 rounded-full ${
                    aiMode === "auto"
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-muted-foreground/40"
                  }`}
                />
                {aiMode === "auto" ? "Observing canvas..." : "Observation paused"}
              </div>
            </div>

            {/* AI Control Center */}
            <div className="flex items-center gap-2">
              {/* AI Auto / Manual Toggle Button */}
              <button
                onClick={() => setAiMode((m) => (m === "auto" ? "manual" : "auto"))}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                  aiMode === "auto"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
                title="Toggle Auto AI background observation vs manual trigger"
              >
                <Icon icon={AiBrain02Icon} size={14} />
                {aiMode === "auto" ? "Auto (2.5s)" : "Manual AI"}
              </button>

              {/* Reasoning Selector Dropdown */}
              <div className="flex items-center gap-1 bg-muted/50 rounded-xl px-2 py-0.5 border border-border/40">
                <span className="text-[11px] text-muted-foreground font-medium">Reasoning:</span>
                <select
                  value={reasoning}
                  onChange={(e) => setReasoning(e.target.value as "none" | "low" | "medium" | "high" | "max")}
                  className="bg-transparent text-xs text-foreground font-semibold outline-none cursor-pointer"
                >
                  <option value="none">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Med</option>
                  <option value="high">High</option>
                  <option value="max">Max</option>
                </select>
              </div>

              {/* Plugins Modal Button */}
              <button
                onClick={() => setShowPluginsModal((p) => !p)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-muted/60 hover:bg-muted text-xs text-foreground font-medium transition-colors border border-border/40"
                title="Manage AI Canvas Plugins"
              >
                <Icon icon={StructureIcon} size={14} />
                Plugins
              </button>

              <Link
                href="/"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium ml-2"
              >
                ← Home
              </Link>
            </div>
          </header>

          {/* Plugins Modal */}
          {showPluginsModal && (
            <div className="absolute top-14 right-16 z-40 w-72 p-4 rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-border/60 pb-2 mb-3">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Icon icon={Settings02Icon} size={15} />
                  AI Plugins
                </span>
                <button
                  onClick={() => setShowPluginsModal(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <label className="flex items-center justify-between cursor-pointer">
                  <span>Professional Diagrams</span>
                  <input
                    type="checkbox"
                    checked={plugins.professionalDiagrams}
                    onChange={(e) => setPlugins((p) => ({ ...p, professionalDiagrams: e.target.checked }))}
                    className="accent-primary cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span>General HTML</span>
                  <input
                    type="checkbox"
                    checked={plugins.generalHtml}
                    onChange={(e) => setPlugins((p) => ({ ...p, generalHtml: e.target.checked }))}
                    className="accent-primary cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span>SMILES Chemical Structures</span>
                  <input
                    type="checkbox"
                    checked={plugins.smilesChemistry}
                    onChange={(e) => setPlugins((p) => ({ ...p, smilesChemistry: e.target.checked }))}
                    className="accent-primary cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span>Vega-Lite Data Charts</span>
                  <input
                    type="checkbox"
                    checked={plugins.vegaCharts}
                    onChange={(e) => setPlugins((p) => ({ ...p, vegaCharts: e.target.checked }))}
                    className="accent-primary cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Canvas viewport */}
          <CanvasViewport aiMode={aiMode} />
        </main>

        {/* Playground controls & conditional options on right sidebar */}
        <CanvasToolbarRight />
      </div>
    </CanvasProvider>
  );
}
