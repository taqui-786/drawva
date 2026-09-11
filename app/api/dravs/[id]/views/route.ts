import { NextRequest, NextResponse } from "next/server";
import { recordDravView } from "@/lib/dravs/views";
import { incrementDravView } from "@/lib/dravs/queries";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Extract client IP address
    const forwardedFor = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : realIp || "127.0.0.1";

    const isNewView = recordDravView(ip, id);
    if (!isNewView) {
      // Already counted within TTL window
      return NextResponse.json({ counted: false });
    }

    const viewsCount = await incrementDravView(id);
    return NextResponse.json({ counted: true, viewsCount });
  } catch (error) {
    console.error("[API POST /api/dravs/[id]/views] Error:", error);
    return NextResponse.json(
      { error: "Failed to record view" },
      { status: 500 }
    );
  }
}
