import { NextResponse } from "next/server";
import { and, eq, gt, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { p2pPresence } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 15;

export const PRESENCE_TTL_MS = 75_000;

function validPeerId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 64 &&
    /^[A-Za-z0-9-]+$/.test(value)
  );
}

export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ peers: [] }, { status: 401 });
    }
    const url = new URL(req.url);
    const exclude = url.searchParams.get("exclude");
    const since = new Date(Date.now() - PRESENCE_TTL_MS);
    const rows = await db
      .select({
        peerId: p2pPresence.peerId,
        displayName: p2pPresence.displayName,
        peerJsId: p2pPresence.peerJsId,
        lastSeen: p2pPresence.lastSeen,
      })
      .from(p2pPresence)
      .where(
        exclude && validPeerId(exclude)
          ? and(gt(p2pPresence.lastSeen, since), ne(p2pPresence.peerId, exclude))
          : gt(p2pPresence.lastSeen, since)
      );
    return NextResponse.json({
      peers: rows.map((r) => ({
        ...r,
        lastSeen: new Date(r.lastSeen).getTime(),
      })),
    });
  } catch (err) {
    console.error("GET /api/p2p/presence error:", err);
    return NextResponse.json({ peers: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    let body: { peerId?: string; peerJsId?: string };
    try {
      body = (await req.json()) as { peerId?: string; peerJsId?: string };
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }
    const { peerId, peerJsId } = body;
    if (!validPeerId(peerId)) {
      return NextResponse.json({ success: false, error: "Invalid peer id" }, { status: 400 });
    }
    if (typeof peerJsId !== "string" || peerJsId.length > 96 || !/^drawva-user-[A-Za-z0-9-]+$/.test(peerJsId)) {
      return NextResponse.json({ success: false, error: "Invalid PeerJS id" }, { status: 400 });
    }
    const displayName =
      session.user.name?.trim().slice(0, 48) || session.user.email || "User";
    const now = new Date();
    await db
      .insert(p2pPresence)
      .values({ peerId, userId: session.user.id, displayName, peerJsId, lastSeen: now })
      .onConflictDoUpdate({
        target: p2pPresence.peerId,
        set: { userId: session.user.id, displayName, peerJsId, lastSeen: now },
      });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/p2p/presence error:", err);
    return NextResponse.json({ success: false, error: "Failed to announce presence" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ success: false }, { status: 401 });
    }
    const url = new URL(req.url);
    const peerId = url.searchParams.get("peerId");
    if (!validPeerId(peerId)) {
      return NextResponse.json({ success: false, error: "Invalid peer id" }, { status: 400 });
    }
    await db
      .delete(p2pPresence)
      .where(and(eq(p2pPresence.peerId, peerId), eq(p2pPresence.userId, session.user.id)));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/p2p/presence error:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
