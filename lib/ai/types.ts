import { CanvasCommand } from "@/lib/canvas/commands";

export interface AiRequestPayload {
  image?: string;
  trigger?: "manual" | "user_paused" | "auto";
  userAction?: string;
  scene?: Array<{
    id: string;
    kind: string;
    box: { x: number; y: number; w: number; h: number };
    text?: string;
    latex?: string;
    expression?: string;
    title?: string;
  }>;
  visibleRect?: { x: number; y: number; w: number; h: number };
  typedInput?: string;
}

export interface AiReplyResponse {
  intent?: string;
  message?: string;
  commands: CanvasCommand[];
  attempts?: number;
  requestId?: string;
}
