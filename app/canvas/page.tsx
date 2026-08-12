import { CanvasProvider } from "@/components/canvas/CanvasProvider";
import { CanvasApp } from "@/components/canvas/CanvasApp";

export default function CanvasPage() {
  return (
    <CanvasProvider>
      <CanvasApp />
    </CanvasProvider>
  );
}
