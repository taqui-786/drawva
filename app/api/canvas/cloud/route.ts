import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canvas } from "@/lib/db/schema";
import type { ProjectSnapshot } from "@/lib/canvas/persistence";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ authenticated: false, canvas: null }, { status: 401 });
    }

    const rows = await db
      .select()
      .from(canvas)
      .where(eq(canvas.userId, session.user.id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ authenticated: true, canvas: null });
    }

    const row = rows[0];
    let parsedData: ProjectSnapshot;
    try {
      parsedData = JSON.parse(row.data) as ProjectSnapshot;
    } catch {
      return NextResponse.json(
        { authenticated: true, canvas: null, error: "Corrupted canvas data" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      canvas: {
        id: row.id,
        title: row.title,
        data: parsedData,
        savedAt: new Date(row.savedAt).getTime(),
        updatedAt: new Date(row.updatedAt).getTime(),
      },
    });
  } catch (err) {
    console.error("GET /api/canvas/cloud error:", err);
    return NextResponse.json(
      { authenticated: false, canvas: null, error: "Failed to fetch cloud canvas" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, authenticated: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    let body: { snapshot: ProjectSnapshot; title?: string };
    try {
      body = (await req.json()) as { snapshot: ProjectSnapshot; title?: string };
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const { snapshot, title } = body;
    if (!snapshot || typeof snapshot !== "object") {
      return NextResponse.json({ success: false, error: "Missing canvas snapshot" }, { status: 400 });
    }

    const now = new Date();
    const serialized = JSON.stringify(snapshot);

    const existing = await db
      .select({ id: canvas.id })
      .from(canvas)
      .where(eq(canvas.userId, session.user.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(canvas)
        .set({
          data: serialized,
          title: title || undefined,
          savedAt: now,
          updatedAt: now,
        })
        .where(eq(canvas.id, existing[0].id));
    } else {
      await db.insert(canvas).values({
        id: `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userId: session.user.id,
        title: title || "Untitled Canvas",
        data: serialized,
        savedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({ success: true, savedAt: now.getTime() });
  } catch (err) {
    console.error("POST /api/canvas/cloud error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save cloud canvas" },
      { status: 500 }
    );
  }
}
