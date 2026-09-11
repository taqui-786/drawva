import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { toggleDravLike } from "@/lib/dravs/queries";

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

    const result = await toggleDravLike(id, userId);
    if (!result) {
      return NextResponse.json({ error: "Drav not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API POST /api/dravs/[id]/like] Error:", error);
    return NextResponse.json(
      { error: "Failed to toggle like" },
      { status: 500 }
    );
  }
}
