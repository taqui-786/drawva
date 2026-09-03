import { NextResponse } from "next/server";
import { getEnabledPluginDescriptors, getPluginMetadataList } from "@/lib/plugins/registry";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requireSession(req);
  if (guard instanceof NextResponse) return guard;
  try {
    const docId = new URL(req.url).searchParams.get("doc");
    if (docId) {
      const [plugin] = getEnabledPluginDescriptors([docId]);
      if (!plugin) {
        return NextResponse.json({ error: "Plugin not found" }, { status: 404 });
      }
      return NextResponse.json({ plugin }, { status: 200 });
    }
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
