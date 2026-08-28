"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canvas } from "@/lib/db/schema";
import type { ProjectSnapshot } from "@/lib/canvas/persistence";

export async function getCanvasSnapshot(): Promise<{
  success: boolean;
  canvas: {
    id: string;
    title: string;
    data: ProjectSnapshot;
    savedAt: number;
    updatedAt: number;
  } | null;
  error?: string;
}> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, canvas: null, error: "Unauthorized" };
    }

    const rows = await db
      .select()
      .from(canvas)
      .where(eq(canvas.userId, session.user.id))
      .limit(1);

    if (rows.length === 0) {
      return { success: true, canvas: null };
    }

    const row = rows[0];
    let parsedData: ProjectSnapshot;
    try {
      parsedData = JSON.parse(row.data) as ProjectSnapshot;
    } catch {
      return { success: false, canvas: null, error: "Corrupted canvas data" };
    }

    return {
      success: true,
      canvas: {
        id: row.id,
        title: row.title,
        data: parsedData,
        savedAt: new Date(row.savedAt).getTime(),
        updatedAt: new Date(row.updatedAt).getTime(),
      },
    };
  } catch (err) {
    console.error("getCanvasSnapshot error:", err);
    return { success: false, canvas: null, error: "Failed to fetch canvas" };
  }
}

export async function saveCanvasSnapshot(
  snapshot: ProjectSnapshot,
  title?: string
): Promise<{ success: boolean; savedAt?: number; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (!snapshot || typeof snapshot !== "object") {
      return { success: false, error: "Invalid snapshot" };
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

    return { success: true, savedAt: now.getTime() };
  } catch (err) {
    console.error("saveCanvasSnapshot error:", err);
    return { success: false, error: "Failed to save canvas" };
  }
}
