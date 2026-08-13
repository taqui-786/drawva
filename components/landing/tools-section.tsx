"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  PencilIcon,
  PaintBrush01Icon,
  EraserIcon,
  TextFontIcon,
  ShapesIcon,
  MoveIcon,
  Cursor01Icon,
} from "@hugeicons/core-free-icons";
import { Card } from "@/components/ui/card";
import { CONTAINER } from "@/components/landing/container";

const CANVAS_TOOLS = [
  {
    shortcut: "V",
    name: "Selection & Marquee",
    icon: Cursor01Icon,
    description: "Click-select ink clusters, drag rectangular marquee over objects, translate raster tiles.",
  },
  {
    shortcut: "H",
    name: "2D Hand Pan",
    icon: MoveIcon,
    description: "Fluid 2D canvas navigation. Click and drag or middle-mouse drag across infinite space.",
  },
  {
    shortcut: "P",
    name: "Vector Pen",
    icon: PencilIcon,
    description: "Real-time vector pen stroke drawing with pressure sensitivity and multi-layer rendering.",
  },
  {
    shortcut: "Shift+H",
    name: "Highlighter",
    icon: PaintBrush01Icon,
    description: "Semi-transparent yellow overlay stroke for emphasizing key text, diagrams, and formulas.",
  },
  {
    shortcut: "E",
    name: "Precision Eraser",
    icon: EraserIcon,
    description: "Stroke-level raycast line erasing to cleanly remove pen lines and vector strokes.",
  },
  {
    shortcut: "T",
    name: "Text Tool",
    icon: TextFontIcon,
    description: "Interactive SVG text box insertion for custom annotations and markdown titles.",
  },
  {
    shortcut: "R / O / A",
    name: "Vector Shapes",
    icon: ShapesIcon,
    description: "Draw geometric primitives: Rectangles (R), Ellipses (O), and Directed Arrows (A).",
  },
];

export function ToolsSection() {
  return (
    <section id="tools" className="w-full py-16 md:py-24 border-t border-border/40">
      <div className={CONTAINER}>
        <div className="flex flex-col items-center text-center space-y-4 max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <span>Canvas Workflow</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Fluid tools designed for speed
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base">
            Work seamlessly with keyboard shortcuts. Every drawing tool feels immediate and responsive.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CANVAS_TOOLS.map((tool) => (
            <Card
              key={tool.name}
              className="group flex flex-col justify-between rounded-xl border border-border/60 bg-card/70 p-5 backdrop-blur-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
                    <HugeiconsIcon icon={tool.icon} className="size-5" />
                  </div>
                  <span className="kbd font-mono text-xs">{tool.shortcut}</span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                    {tool.name}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {tool.description}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
