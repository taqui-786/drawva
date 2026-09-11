import { NextRequest, NextResponse } from "next/server";
import { requireSession, getOptionalSession } from "@/lib/api-guard";
import { createCommentSchema } from "@/lib/dravs/validation";
import { listDravComments, createDravComment } from "@/lib/dravs/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await getOptionalSession(req);

    const comments = await listDravComments(id, userId);
    return NextResponse.json({ comments });
  } catch (error) {
    console.error("[API GET /api/dravs/[id]/comments] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

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
    const parseResult = createCommentSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid comment body", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const newComment = await createDravComment({
      dravId: id,
      userId,
      body: parseResult.data.body.trim(),
    });

    return NextResponse.json(newComment, { status: 201 });
  } catch (error) {
    console.error("[API POST /api/dravs/[id]/comments] Error:", error);
    return NextResponse.json(
      { error: "Failed to post comment" },
      { status: 500 }
    );
  }
}
