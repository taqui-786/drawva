import { NextResponse } from "next/server";
import { getPluginMetadataList } from "@/lib/plugins/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const plugins = getPluginMetadataList();
    return NextResponse.json({ plugins }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/plugins] Error loading plugins:", err);
    return NextResponse.json(
      { error: "Failed to load plugins catalog", plugins: [] },
      { status: 500 }
    );
  }
}
