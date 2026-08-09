// ============================================================
// Drawva — /canvas route (Server Component)
// Wraps the canvas client shell with metadata.
// ============================================================

import type { Metadata } from "next";
import { CanvasShell } from "./CanvasShell";

export const metadata: Metadata = {
  title: "Drawva — Infinite Canvas",
  description:
    "Production-grade infinite whiteboard. Draw, erase, pan, zoom, export. Built with a hand-rolled tile-based canvas engine.",
};

export default function CanvasPage() {
  return <CanvasShell />;
}
