// ============================================================
// Drawva AI System — Next.js API Route Handler
// POST /api/canvas/ai
// Thin delegate: 100% of execution lives in the LangChain
// Runnable Agent pipeline (lib/ai/agent.ts).
// ============================================================

import { NextResponse } from "next/server";
import { runCanvasAiAgent } from "@/lib/ai/agent";
import type { AiRequest } from "@/lib/ai/types";

export async function POST(request: Request) {
  try {
    const body: AiRequest = await request.json();

    if (!body.canvasSize || typeof body.canvasSize.w !== "number") {
      return NextResponse.json(
        { error: "Invalid canvasSize in request body" },
        { status: 400 },
      );
    }

    console.log(
      `[AI Route] 🚀 Processing request | userAction: "${body.userAction}" | prompt: "${body.userPrompt || ""}"`,
    );

    const reply = await runCanvasAiAgent(body);
    return NextResponse.json(reply);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[AI Route Error]", error);
    return NextResponse.json(
      { error: errMsg || "Internal server error in AI route" },
      { status: 500 },
    );
  }
}