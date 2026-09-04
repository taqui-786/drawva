import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function requireSession(req: Request): Promise<{ userId: string } | NextResponse> {
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    }
    if (originHost !== host) {
      return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
    }
  }

  let userId: string | undefined;
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    userId = session?.user?.id;
  } catch (err) {
    console.error("[requireSession] getSession failed:", err);
    return NextResponse.json({ error: "Authentication backend unavailable." }, { status: 503 });
  }
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!consumeRateLimit(userId)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Wait a moment and retry." },
      { status: 429, headers: { "retry-after": "60" } }
    );
  }
  return { userId };
}

const RATE_CAPACITY = 30;
const RATE_REFILL_PER_SEC = 0.5;
const buckets = new Map<string, { tokens: number; last: number }>();
const MAX_BUCKETS = 10_000;

function consumeRateLimit(userId: string): boolean {
  const now = Date.now();
  const b = buckets.get(userId) ?? { tokens: RATE_CAPACITY, last: now };
  b.tokens = Math.min(RATE_CAPACITY, b.tokens + ((now - b.last) / 1000) * RATE_REFILL_PER_SEC);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(userId, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(userId, b);
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, v] of buckets) {
      if (buckets.size <= MAX_BUCKETS / 2) break;
      if (now - v.last > 300_000) buckets.delete(k);
    }
  }
  return true;
}
