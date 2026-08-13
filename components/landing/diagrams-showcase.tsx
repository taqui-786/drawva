"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon, SourceCodeIcon, CheckmarkCircle01Icon } from "@hugeicons/core-free-icons";
import { Card } from "@/components/ui/card";
import { CONTAINER } from "@/components/landing/container";

const DIAGRAM_FORMATS = [
  {
    id: "mermaid",
    name: "Mermaid",
    category: "Flowcharts & Sequences",
    library: "mermaid.esm.min.mjs",
    code: `graph TD
  A[Client Request] --> B{API Gateway}
  B -->|Valid| C[Auth Service]
  B -->|Invalid| D[401 Error]
  C --> E[(IndexedDB)]`,
    description: "Flowcharts, sequence diagrams, class diagrams, and entity relationship models.",
  },
  {
    id: "graphviz",
    name: "Graphviz DOT",
    category: "Trees & Hierarchies",
    library: "@viz-js/viz (WASM)",
    code: `digraph G {
  rankdir=LR;
  node [shape=box, style=rounded];
  CanvasEngine -> GridLayer;
  CanvasEngine -> TileLayer;
  CanvasEngine -> ObjectLayer;
}`,
    description: "Complex network trees, graph dependency networks, and architectural state machines.",
  },
  {
    id: "vegalite",
    name: "Vega-Lite",
    category: "Charts & Analytics",
    library: "vega + vega-lite",
    code: `{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "data": { "values": [{"a": "A", "b": 28}, {"a": "B", "b": 55}] },
  "mark": "bar",
  "encoding": { "x": {"field": "a"}, "y": {"field": "b"} }
}`,
    description: "Statistical bar graphs, scatter plots, histograms, and trend analytics.",
  },
  {
    id: "smiles",
    name: "SMILES Chemistry",
    category: "Molecular Structures",
    library: "openchemlib",
    code: `CC(=O)OC1=CC=CC=C1C(=O)O
// Aspirin Molecule Structure`,
    description: "Chemical bond structures, molecular formulas, and organic compound rendering.",
  },
  {
    id: "bpmn",
    name: "BPMN XML",
    category: "Business Workflows",
    library: "bpmn-viewer",
    code: `<bpmn:definitions>
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1" />
  </bpmn:process>
</bpmn:definitions>`,
    description: "Standard business process modeling notation XML workflows and decision gateways.",
  },
  {
    id: "cytoscape",
    name: "Cytoscape JSON",
    category: "Network Topology",
    library: "cytoscape",
    code: `[
  { "data": { "id": "a" } },
  { "data": { "id": "b" } },
  { "data": { "id": "ab", "source": "a", "target": "b" } }
]`,
    description: "Interactive graph networks with force-directed physics layouts.",
  },
  {
    id: "geojson",
    name: "GeoJSON",
    category: "Spatial Maps",
    library: "leaflet",
    code: `{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": { "type": "Point", "coordinates": [125.6, 10.1] }
  }]
}`,
    description: "Geographic spatial vector maps, region boundaries, and Leaflet pin rendering.",
  },
];

export function DiagramsShowcase() {
  const [selectedId, setSelectedId] = useState("mermaid");
  const selected = DIAGRAM_FORMATS.find((d) => d.id === selectedId) || DIAGRAM_FORMATS[0];

  return (
    <section id="diagrams" className="w-full py-16 md:py-24 border-t border-border/40 bg-muted/20">
      <div className={CONTAINER}>
        <div className="flex flex-col items-center text-center space-y-4 max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <HugeiconsIcon icon={SourceCodeIcon} className="size-3.5" />
            <span>Multi-Format Output Engine</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            7 Supported Diagram Formats
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base">
            No lock-in. Drawva renders industry-standard diagram languages into sandboxed vector applets directly on your canvas.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          {DIAGRAM_FORMATS.map((fmt) => (
            <button
              key={fmt.id}
              onClick={() => setSelectedId(fmt.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                selectedId === fmt.id
                  ? "bg-primary text-primary-foreground shadow-md scale-[1.02]"
                  : "bg-card border border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <span>{fmt.name}</span>
              {selectedId === fmt.id && (
                <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-3.5" />
              )}
            </button>
          ))}
        </div>

        {/* Format Viewer Card */}
        <Card className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-xl backdrop-blur-md">
          <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border/60">
            {/* Left Code View */}
            <div className="flex-1 p-6 space-y-4 bg-muted/40 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <span className="text-primary font-semibold flex items-center gap-1.5">
                  <HugeiconsIcon icon={SparklesIcon} className="size-4" />
                  {selected.name} Markup
                </span>
                <span className="text-[10px] text-muted-foreground bg-background px-2 py-0.5 rounded border border-border/60">
                  {selected.library}
                </span>
              </div>

              <pre className="overflow-x-auto text-foreground/90 p-4 rounded-xl bg-background border border-border/60 leading-relaxed max-h-60">
                <code>{selected.code}</code>
              </pre>

              <p className="text-muted-foreground text-[11px]">
                Category: <span className="text-foreground font-medium">{selected.category}</span>
              </p>
            </div>

            {/* Right Format Overview */}
            <div className="flex-1 p-6 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="inline-block rounded-lg bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-mono text-primary font-semibold">
                  {selected.category}
                </div>
                <h3 className="text-2xl font-bold text-foreground">{selected.name} Engine</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {selected.description}
                </p>
              </div>

              <div className="space-y-2 pt-4 border-t border-border/40">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  <span>Sandboxed iframe host (`/widget-host.html`)</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  <span>Accept / Discard action bar controls (`×`, `⤢`, `✓`)</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  <span>Interactive DOM hover & resize transforms</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
