import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { deleteDravComment } from "@/lib/dravs/queries";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { commentId } = await params;
    const sessionRes = await requireSession(req);
    if (sessionRes instanceof NextResponse) {
      return sessionRes;
    }
    const { userId } = sessionRes;

    const success = await deleteDravComment(commentId, userId);
    if (!success) {
      return NextResponse.json(
        { error: "Comment not found or unauthorized to delete" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API DELETE /api/dravs/[id]/comments/[commentId]] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete comment" },
      { status: 500 }
    );
  }
}
