import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
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

    const { searchParams } = new URL(req.url);
    const canvasId = searchParams.get("id");

    // Fetch single canvas
    if (canvasId) {
      const rows = await db
        .select()
        .from(canvas)
        .where(and(eq(canvas.id, canvasId), eq(canvas.userId, session.user.id)))
        .limit(1);

      if (rows.length === 0) {
        return NextResponse.json(
          { authenticated: true, canvas: null, error: "Canvas not found" },
          { status: 404 }
        );
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
    }

    // List all canvases for current user (lightweight, no data column)
    const rows = await db
      .select({
        id: canvas.id,
        title: canvas.title,
        savedAt: canvas.savedAt,
        updatedAt: canvas.updatedAt,
        createdAt: canvas.createdAt,
      })
      .from(canvas)
      .where(eq(canvas.userId, session.user.id))
      .orderBy(desc(canvas.updatedAt));

    const list = rows.map((r) => ({
      id: r.id,
      title: r.title,
      savedAt: new Date(r.savedAt).getTime(),
      updatedAt: new Date(r.updatedAt).getTime(),
      createdAt: new Date(r.createdAt).getTime(),
    }));

    return NextResponse.json({
      authenticated: true,
      canvases: list,
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
    const id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const finalTitle = (title && title.trim()) || "Untitled Canvas";

    await db.insert(canvas).values({
      id,
      userId: session.user.id,
      title: finalTitle,
      data: serialized,
      savedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      success: true,
      canvas: {
        id,
        title: finalTitle,
        savedAt: now.getTime(),
        updatedAt: now.getTime(),
      },
    });
  } catch (err) {
    console.error("POST /api/canvas/cloud error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to create cloud canvas" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
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

    let body: { id: string; snapshot?: ProjectSnapshot; title?: string };
    try {
      body = (await req.json()) as { id: string; snapshot?: ProjectSnapshot; title?: string };
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const { id, snapshot, title } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing canvas id" }, { status: 400 });
    }

    const now = new Date();
    const updateData: {
      savedAt: Date;
      updatedAt: Date;
      data?: string;
      title?: string;
    } = {
      savedAt: now,
      updatedAt: now,
    };

    if (snapshot && typeof snapshot === "object") {
      updateData.data = JSON.stringify(snapshot);
    }
    if (title && title.trim()) {
      updateData.title = title.trim();
    }

    await db
      .update(canvas)
      .set(updateData)
      .where(and(eq(canvas.id, id), eq(canvas.userId, session.user.id)));

    return NextResponse.json({ success: true, savedAt: now.getTime() });
  } catch (err) {
    console.error("PUT /api/canvas/cloud error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to update cloud canvas" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
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

    let id: string | null = null;
    const { searchParams } = new URL(req.url);
    id = searchParams.get("id");

    if (!id) {
      try {
        const body = (await req.json()) as { id?: string };
        id = body?.id || null;
      } catch {
        // no body
      }
    }

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing canvas id" }, { status: 400 });
    }

    await db
      .delete(canvas)
      .where(and(eq(canvas.id, id), eq(canvas.userId, session.user.id)));

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("DELETE /api/canvas/cloud error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to delete cloud canvas" },
      { status: 500 }
    );
  }
}
