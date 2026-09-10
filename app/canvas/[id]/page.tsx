import type { Metadata } from "next";
import { CanvasProvider } from "@/components/canvas/CanvasProvider";
import { CanvasApp } from "@/components/canvas/CanvasApp";

export const metadata: Metadata = {
  title: "Canvas Studio | Drawva",
  description:
    "Interactive multimodal AI whiteboard studio.",
};

interface CanvasDynamicPageProps {
  params: Promise<{ id: string }>;
}

export default async function CanvasDynamicPage({ params }: CanvasDynamicPageProps) {
  const { id } = await params;

  return (
    <CanvasProvider>
      <CanvasApp canvasId={id} />
    </CanvasProvider>
  );
}
