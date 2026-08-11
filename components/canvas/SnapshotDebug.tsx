"use client";
// ============================================================
// Drawva — AI Snapshot Debug Viewer (testing tool)
// Shows the exact atlas image + metadata that gets POSTed to
// /api/canvas/ai, so you can verify what the AI observes.
// ============================================================

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiBrain02Icon,
  Cancel01Icon,
  Camera01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { AiSnapshot } from "@/hooks/useAiCanvas";

type HugeIcon = Parameters<typeof HugeiconsIcon>[0]["icon"];
function Icon({ icon, size = 15 }: { icon: HugeIcon; size?: number }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.8} />;
}

interface SnapshotDebugProps {
  snapshots: AiSnapshot[];
  onClear: () => void;
}

function fmtRect(s: AiSnapshot): string {
  const r = s.worldRect;
  return `x ${Math.round(r.x)}, y ${Math.round(r.y)} · ${Math.round(r.w)}×${Math.round(r.h)} world`;
}

function fmtBytes(dataUrl: string): string {
  const est = (dataUrl.length - (dataUrl.indexOf(",") + 1)) * 0.75;
  if (est > 1024 * 1024) return `${(est / 1024 / 1024).toFixed(1)} MB`;
  if (est > 1024) return `${(est / 1024).toFixed(1)} KB`;
  return `${Math.round(est)} B`;
}

export function SnapshotDebug({ snapshots, onClear }: SnapshotDebugProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute bottom-4 right-4 z-40 flex flex-col items-end gap-2 select-none">
      {/* Toggle Button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Inspect the canvas snapshots sent to the AI"
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-2xl backdrop-blur-xl transition-all",
          open
            ? "bg-primary text-primary-foreground border-primary/40"
            : "bg-card/95 text-foreground border-border/80 hover:bg-card",
        )}
      >
        <Icon icon={Camera01Icon} size={14} />
        Snapshots
        {snapshots.length > 0 && (
          <span className="flex size-4.5 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-bold">
            {snapshots.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="flex w-[340px] max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Icon icon={AiBrain02Icon} size={14} />
              AI Snapshots
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClear}
                disabled={snapshots.length === 0}
                className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Icon icon={Cancel01Icon} size={14} />
              </button>
            </div>
          </div>

          {snapshots.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-[11px] text-muted-foreground">
              No snapshots yet. Trigger an AI prompt or draw with a pen to
              send one.
            </p>
          ) : (
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {snapshots.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-border/60 bg-background/60 p-2"
                >
                  <div className="flex gap-2">
                    {/* Thumbnail → open full snapshot in new tab */}
                    <a
                      href={s.dataUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Open full snapshot (new tab)"
                      className="relative block size-20 shrink-0 overflow-hidden rounded-lg bg-muted transition-transform hover:scale-[1.03]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={s.dataUrl}
                        alt="AI snapshot"
                        className="h-full w-full object-cover"
                      />
                    </a>

                    <div className="min-w-0 flex-1 text-[11px] leading-relaxed">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 font-semibold",
                            s.observation
                              ? "bg-emerald-500/15 text-emerald-600"
                              : s.isRefine
                                ? "bg-purple-500/15 text-purple-600"
                                : "bg-blue-500/15 text-blue-600",
                          )}
                        >
                          {s.observation ? "Observation" : s.isRefine ? "Refine" : "Prompt"}
                        </span>
                        {s.prompt && (
                          <span className="truncate font-medium text-foreground/80">
                            {s.prompt}
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground">{fmtRect(s)}</p>
                      <p className="text-muted-foreground">
                        {s.outW}×{s.outH}px · scale {s.scale.toFixed(2)} ·{" "}
                        {fmtBytes(s.dataUrl)}
                      </p>
                      <p className="text-muted-foreground/70">
                        {new Date(s.sentAt).toLocaleTimeString()} · action{" "}
                        {s.action}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}