import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { reportDravSchema } from "@/lib/dravs/validation";
import { createDravReport } from "@/lib/dravs/queries";

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

    const body = await req.json();
    const parseResult = reportDravSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid report reason", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    await createDravReport({
      dravId: id,
      userId,
      reason: parseResult.data.reason.trim(),
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("[API POST /api/dravs/[id]/report] Error:", error);
    return NextResponse.json(
      { error: "Failed to submit report" },
      { status: 500 }
    );
  }
}
