import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { getDravById } from "@/lib/dravs/queries";
import { db } from "@/lib/db";
import { canvas } from "@/lib/db/schema";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionRes = await requireSession(req);
    if (sessionRes instanceof NextResponse) {
      return sessionRes;
    }
    const { userId } = sessionRes;

    const targetDrav = await getDravById(id, userId);
    if (!targetDrav) {
      return NextResponse.json({ error: "Drav not found or private" }, { status: 404 });
    }

    const newCanvasId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const remixTitle = `Remix of ${targetDrav.title}`;
    const now = new Date();

    await db.insert(canvas).values({
      id: newCanvasId,
      userId,
      title: remixTitle,
      data: targetDrav.snapshot,
      savedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json(
      {
        canvasId: newCanvasId,
        title: remixTitle,
        redirectUrl: `/canvas/${newCanvasId}`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API POST /api/dravs/[id]/remix] Error:", error);
    return NextResponse.json(
      { error: "Failed to remix Drav" },
      { status: 500 }
    );
  }
}
