import { NextRequest, NextResponse } from "next/server";
import { requireSession, getOptionalSession } from "@/lib/api-guard";
import { publishDravSchema } from "@/lib/dravs/validation";
import { listDravs, createDrav } from "@/lib/dravs/queries";
import { uploadThumbnailToR2 } from "@/lib/dravs/r2";
import { DravSortOption, DravVisibility } from "@/lib/dravs/types";
import { db } from "@/lib/db";
import { canvas } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const tag = searchParams.get("tag") || undefined;
    const search = searchParams.get("search") || undefined;
    const sort = (searchParams.get("sort") as DravSortOption) || "trending";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));

    const { userId } = await getOptionalSession(req);

    const result = await listDravs({
      category,
      tag,
      search,
      sort,
      page,
      limit,
      currentUserId: userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API GET /api/dravs] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Dravs list" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionRes = await requireSession(req);
    if (sessionRes instanceof NextResponse) {
      return sessionRes;
    }
    const { userId } = sessionRes;

    const body = await req.json();
    const parseResult = publishDravSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const {
      canvasId,
      title,
      description,
      category,
      tags,
      visibility,
      snapshot,
      thumbnailBase64,
    } = parseResult.data;

    // Sync canvas record ownership to the active publisher
    try {
      await db
        .update(canvas)
        .set({ userId })
        .where(eq(canvas.id, canvasId));
    } catch (e) {
      console.warn("Could not sync canvas owner:", e);
    }

    // Upload thumbnail to Cloudflare R2 if thumbnailBase64 is provided
    let thumbnailUrl: string | undefined = undefined;
    if (thumbnailBase64) {
      thumbnailUrl = await uploadThumbnailToR2(thumbnailBase64, `thumb_${canvasId}`);
    }

    const createdDrav = await createDrav({
      userId,
      canvasId,
      title,
      description,
      category,
      tags,
      visibility: visibility as DravVisibility,
      snapshot,
      thumbnailUrl,
    });

    return NextResponse.json(createdDrav, { status: 201 });
  } catch (error) {
    console.error("[API POST /api/dravs] Error publishing Drav:", error);
    return NextResponse.json(
      { error: "Failed to publish Drav" },
      { status: 500 }
    );
  }
}
