import { NextResponse } from "next/server";
import { and, desc, eq, gt, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { p2pPresence, p2pRequest } from "@/lib/db/schema";
import { PRESENCE_TTL_MS } from "../presence/route";

export const runtime = "nodejs";
export const maxDuration = 15;

/** Pending requests older than this are treated as expired. */
const REQUEST_TTL_MS = 3 * 60_000;

function validPeerId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 64 &&
    /^[A-Za-z0-9-]+$/.test(value)
  );
}

function serialize(row: typeof p2pRequest.$inferSelect) {
  return {
    id: row.id,
    fromPeerId: row.fromPeerId,
    fromName: row.fromName,
    fromPeerJsId: row.fromPeerJsId,
    toPeerId: row.toPeerId,
    toName: row.toName,
    toPeerJsId: row.toPeerJsId,
    status: row.status,
    createdAt: new Date(row.createdAt).getTime(),
    updatedAt: new Date(row.updatedAt).getTime(),
  };
}

/** Verify the caller owns this presence peerId. */
async function ownsPeerId(peerId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ peerId: p2pPresence.peerId })
    .from(p2pPresence)
    .where(and(eq(p2pPresence.peerId, peerId), eq(p2pPresence.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/**
 * GET ?role=incoming&peerId=… → pending requests addressed to me.
 * GET ?role=outgoing&peerId=… → my recent sent requests (pending/accepted/rejected).
 */
export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ requests: [] }, { status: 401 });
    }
    const url = new URL(req.url);
    const role = url.searchParams.get("role");
    const peerId = url.searchParams.get("peerId");
    if (!validPeerId(peerId) || !(await ownsPeerId(peerId, session.user.id))) {
      return NextResponse.json({ requests: [] }, { status: 400 });
    }
    const freshSince = new Date(Date.now() - REQUEST_TTL_MS);
    if (role === "outgoing") {
      const rows = await db
        .select()
        .from(p2pRequest)
        .where(
          and(
            eq(p2pRequest.fromPeerId, peerId),
            gt(p2pRequest.updatedAt, new Date(Date.now() - 10 * 60_000))
          )
        )
        .orderBy(desc(p2pRequest.updatedAt))
        .limit(10);
      return NextResponse.json({ requests: rows.map(serialize) });
    }
    // incoming
    const rows = await db
      .select()
      .from(p2pRequest)
      .where(
        and(
          eq(p2pRequest.toPeerId, peerId),
          eq(p2pRequest.status, "pending"),
          gt(p2pRequest.createdAt, freshSince)
        )
      )
      .orderBy(desc(p2pRequest.createdAt))
      .limit(10);
    return NextResponse.json({ requests: rows.map(serialize) });
  } catch (err) {
    console.error("GET /api/p2p/requests error:", err);
    return NextResponse.json({ requests: [] }, { status: 500 });
  }
}

/** Send a pairing request to an online peer. */
export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    let body: { fromPeerId?: string; fromPeerJsId?: string; toPeerId?: string };
    try {
      body = (await req.json()) as { fromPeerId?: string; fromPeerJsId?: string; toPeerId?: string };
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }
    const { fromPeerId, fromPeerJsId, toPeerId } = body;
    if (!validPeerId(fromPeerId) || !(await ownsPeerId(fromPeerId, session.user.id))) {
      return NextResponse.json({ success: false, error: "Unknown sender identity" }, { status: 400 });
    }
    if (typeof fromPeerJsId !== "string" || !/^drawva-user-[A-Za-z0-9-]+$/.test(fromPeerJsId)) {
      return NextResponse.json({ success: false, error: "Invalid sender PeerJS id" }, { status: 400 });
    }
    if (!validPeerId(toPeerId) || toPeerId === fromPeerId) {
      return NextResponse.json({ success: false, error: "Invalid recipient" }, { status: 400 });
    }
    // Recipient must be online right now.
    const target = await db
      .select()
      .from(p2pPresence)
      .where(
        and(
          eq(p2pPresence.peerId, toPeerId),
          gt(p2pPresence.lastSeen, new Date(Date.now() - PRESENCE_TTL_MS))
        )
      )
      .limit(1);
    if (target.length === 0) {
      return NextResponse.json({ success: false, error: "That user is no longer online" }, { status: 410 });
    }
    // No duplicate pending request in either direction.
    const dupes = await db
      .select({ id: p2pRequest.id })
      .from(p2pRequest)
      .where(
        and(
          eq(p2pRequest.status, "pending"),
          gt(p2pRequest.createdAt, new Date(Date.now() - REQUEST_TTL_MS)),
          or(
            and(eq(p2pRequest.fromPeerId, fromPeerId), eq(p2pRequest.toPeerId, toPeerId)),
            and(eq(p2pRequest.fromPeerId, toPeerId), eq(p2pRequest.toPeerId, fromPeerId))
          )
        )
      )
      .limit(1);
    if (dupes.length > 0) {
      return NextResponse.json({ success: false, error: "A request is already pending" }, { status: 409 });
    }
    const fromName =
      session.user.name?.trim().slice(0, 48) || session.user.email || "User";
    const id = `pr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    await db.insert(p2pRequest).values({
      id,
      fromPeerId,
      fromName,
      fromPeerJsId,
      toPeerId,
      toName: target[0].displayName,
      toPeerJsId: target[0].peerJsId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("POST /api/p2p/requests error:", err);
    return NextResponse.json({ success: false, error: "Failed to send request" }, { status: 500 });
  }
}

/** Accept / reject (recipient) or cancel (sender) a request. */
export async function PATCH(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    let body: { id?: string; action?: string; peerId?: string };
    try {
      body = (await req.json()) as { id?: string; action?: string; peerId?: string };
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }
    const { id, action, peerId } = body;
    if (typeof id !== "string" || !validPeerId(peerId) || !(await ownsPeerId(peerId, session.user.id))) {
      return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
    }
    const rows = await db.select().from(p2pRequest).where(eq(p2pRequest.id, id)).limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }
    const row = rows[0];
    if (row.status !== "pending") {
      return NextResponse.json({ success: false, error: `Request is already ${row.status}`, request: serialize(row) });
    }
    if (action === "accept" || action === "reject") {
      if (row.toPeerId !== peerId) {
        return NextResponse.json({ success: false, error: "Not your request to answer" }, { status: 403 });
      }
      const status = action === "accept" ? "accepted" : "rejected";
      await db.update(p2pRequest).set({ status, updatedAt: new Date() }).where(eq(p2pRequest.id, id));
      const updated = { ...row, status };
      return NextResponse.json({ success: true, request: serialize(updated) });
    }
    if (action === "cancel") {
      if (row.fromPeerId !== peerId) {
        return NextResponse.json({ success: false, error: "Not your request to cancel" }, { status: 403 });
      }
      await db.update(p2pRequest).set({ status: "canceled", updatedAt: new Date() }).where(eq(p2pRequest.id, id));
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("PATCH /api/p2p/requests error:", err);
    return NextResponse.json({ success: false, error: "Failed to update request" }, { status: 500 });
  }
}
