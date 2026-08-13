"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  SparklesIcon,
  ShieldCheck,
  SourceCodeIcon,
  Layers01Icon,
} from "@hugeicons/core-free-icons";
import { Card } from "@/components/ui/card";
import { CONTAINER } from "@/components/landing/container";

const FEATURES = [
  {
    icon: SparklesIcon,
    title: "3-Stage Multimodal Perception",
    subtitle: "Vision → Evaluation → Structured Code",
    description:
      "Stage 1 detects bounding boxes & visual shapes (Nemotron-3 / Qwen2-VL). Stage 2 evaluates intent and context (DeepSeek-V4). Stage 3 outputs clean, executable widget code.",
    accent: "from-emerald-500/20 to-primary/20",
  },
  {
    icon: SourceCodeIcon,
    title: "Dynamic Sandboxed Widgets",
    subtitle: "7 Formats & Custom HTML Applets",
    description:
      "Renders Mermaid flowcharts, Graphviz trees, Vega-Lite charts, SMILES molecules, BPMN workflows, Cytoscape networks, and GeoJSON maps inside isolated HTML iframes.",
    accent: "from-blue-500/20 to-primary/20",
  },
  {
    icon: Layers01Icon,
    title: "60 FPS Multi-Layer Tile Engine",
    subtitle: "512px Offscreen Canvas Caching",
    description:
      "Strokes are rasterized onto offscreen tile layers for ultra-fast panning and zooming ($0.03\\times .. 4.0\\times$) without frame drops or re-render stutters.",
    accent: "from-purple-500/20 to-primary/20",
  },
  {
    icon: ShieldCheck,
    title: "100% Privacy & Zero-Cloud Sync",
    subtitle: "WebRTC P2P DataChannels & IndexedDB",
    description:
      "Your canvas never touches a central cloud database. Peer-to-peer sync transmits canvas state directly browser-to-browser with sub-30ms latency.",
    accent: "from-amber-500/20 to-primary/20",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="w-full py-16 md:py-24 border-t border-border/40">
      <div className={CONTAINER}>
        <div className="flex flex-col items-center text-center space-y-4 max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <span>Engineering Architecture</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Built for performance, privacy, and precision
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base">
            Drawva combines standard web technologies with a 3-stage LLM pipeline to create a fast, local-first infinite canvas engine.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURES.map((f) => (
            <Card
              key={f.title}
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-6 sm:p-8 backdrop-blur-sm transition-all hover:border-primary/50 hover:shadow-lg"
            >
              {/* Background gradient blur */}
              <div
                aria-hidden
                className={`pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-gradient-to-br ${f.accent} opacity-20 blur-2xl transition-opacity group-hover:opacity-40`}
              />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary shadow-xs">
                    <HugeiconsIcon icon={f.icon} className="size-6" />
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
                    {f.subtitle}
                  </span>
                </div>

                <div className="space-y-2 pt-2">
                  <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                    {f.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {f.description}
                  </p>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-border/40 flex items-center justify-between text-xs font-mono text-muted-foreground">
                <span>Drawva Stack Core</span>
                <span className="text-primary font-medium group-hover:underline">Explore docs →</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
