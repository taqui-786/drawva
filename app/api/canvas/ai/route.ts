import { NextResponse } from "next/server";
import { processAiCanvasRequest } from "@/lib/ai/agent";
import { validateCommand } from "@/lib/canvas/commands";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const reply = await processAiCanvasRequest({
      image: body.image,
      trigger: body.trigger,
      userAction: body.userAction,
      scene: body.scene,
      visibleRect: body.visibleRect,
      typedInput: body.typedInput,
    });

    // Server-side re-validation of output commands
    const validatedCommands = reply.commands
      .map((cmd) => validateCommand(cmd as unknown as Record<string, unknown>))
      .filter((res) => res.valid && res.command)
      .map((res) => res.command!);

    return NextResponse.json({
      intent: reply.intent || "assistant_response",
      message: reply.message || "",
      commands: validatedCommands,
      attempts: reply.attempts || 1,
      requestId: `req-${Date.now()}`,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    console.error("[API AI Route] Internal error:", errorMsg);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
