import type { Metadata } from "next";
import { CanvasProvider } from "@/components/canvas/CanvasProvider";
import { CanvasApp } from "@/components/canvas/CanvasApp";

export const metadata: Metadata = {
  title: "Interactive AI Canvas Studio",
  description:
    "Draw, sketch, and let multimodal AI perceive your ink to render Mermaid diagrams, LaTeX formulas, function plots, and interactive applets in real-time.",
  alternates: {
    canonical: "/canvas",
  },
  openGraph: {
    title: "Interactive AI Canvas Studio | Drawva",
    description:
      "Draw, sketch, and let multimodal AI perceive your ink to render Mermaid diagrams, LaTeX formulas, function plots, and interactive applets in real-time.",
    url: "/canvas",
  },
};

export default function CanvasPage() {
  return (
    <CanvasProvider>
      <CanvasApp />
    </CanvasProvider>
  );
}
