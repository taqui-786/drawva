import { NextRequest, NextResponse } from "next/server";
import { requireSession, getOptionalSession } from "@/lib/api-guard";
import { updateDravSchema } from "@/lib/dravs/validation";
import { getDravById, updateDrav, deleteDrav } from "@/lib/dravs/queries";
import { DravVisibility } from "@/lib/dravs/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await getOptionalSession(req);

    const dravData = await getDravById(id, userId);
    if (!dravData) {
      return NextResponse.json(
        { error: "Drav not found or private" },
        { status: 404 }
      );
    }

    return NextResponse.json(dravData);
  } catch (error) {
    console.error("[API GET /api/dravs/[id]] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Drav" },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const parseResult = updateDravSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await updateDrav(id, userId, {
      ...parseResult.data,
      visibility: parseResult.data.visibility as DravVisibility | undefined,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Drav not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API PATCH /api/dravs/[id]] Error:", error);
    return NextResponse.json(
      { error: "Failed to update Drav" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const success = await deleteDrav(id, userId);
    if (!success) {
      return NextResponse.json(
        { error: "Drav not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API DELETE /api/dravs/[id]] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete Drav" },
      { status: 500 }
    );
  }
}
