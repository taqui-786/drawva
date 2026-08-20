import assert from "node:assert/strict";
import {
  sanitizePacket,
  expandPacket,
  compactWidgetForSync,
  widgetNeedsHydration,
  MAX_PACKET_CHARS,
  type SyncPacket,
} from "./sync";

const objectAdd = sanitizePacket({
  type: "SYNC_OBJECT_ADD",
  object: {
    id: "o1",
    kind: "text",
    x: 10,
    y: 20,
    w: 100,
    h: 40,
    contentW: 100,
    contentH: 40,
    source: "hi",
    color: "#000",
    fontSize: 24,
    status: "accepted",
    image: { not: "serializable" } as unknown as HTMLCanvasElement,
  },
});
assert.ok(objectAdd && objectAdd.type === "SYNC_OBJECT_ADD");
assert.equal("image" in objectAdd.object, false);

const widgetAdd = sanitizePacket({
  type: "SYNC_WIDGET_ADD",
  widget: {
    id: "w1",
    kind: "html",
    pluginId: "general",
    x: 1,
    y: 2,
    w: 300,
    h: 200,
    contentW: 300,
    contentH: 200,
    title: "Clock",
    html: "<div/>",
    status: "draft",
    cachedImage: {} as HTMLImageElement,
  },
});
assert.ok(widgetAdd && widgetAdd.type === "SYNC_WIDGET_ADD");
assert.equal("cachedImage" in widgetAdd.widget, false);

const ink = sanitizePacket({
  type: "SYNC_INK_ERASE",
  x: 8,
  y: 9,
  w: 40,
  h: 12,
});
assert.deepEqual(ink, { type: "SYNC_INK_ERASE", x: 8, y: 9, w: 40, h: 12 });

const move: SyncPacket = {
  type: "SYNC_INK_MOVE",
  from: { x: 0, y: 0, w: 10, h: 10 },
  x: 20,
  y: 30,
  w: 10,
  h: 10,
  dataUrl: "data:image/webp;base64,abc",
};
assert.deepEqual(sanitizePacket(move), move);

// Diagram AI widgets must sync SOURCE only — not the huge rendered iframe HTML.
const diagramHtml = `<!doctype html><html><body>${"SVG".repeat(20_000)}</body></html>`;
const compact = compactWidgetForSync({
  id: "d1",
  kind: "diagram",
  pluginId: "flowchart",
  sourceFormat: "mermaid",
  x: 10,
  y: 20,
  w: 500,
  h: 400,
  contentW: 500,
  contentH: 400,
  title: "Flow",
  html: diagramHtml,
  copyText: "flowchart LR\n  A-->B",
  status: "draft",
});
assert.equal(compact.html, "");
assert.equal(compact.copyText, "flowchart LR\n  A-->B");
assert.equal(widgetNeedsHydration(compact), true);

const diagramPackets = expandPacket({
  type: "SYNC_WIDGET_ADD",
  widget: {
    id: "d1",
    kind: "diagram",
    pluginId: "flowchart",
    sourceFormat: "mermaid",
    x: 10,
    y: 20,
    w: 500,
    h: 400,
    contentW: 500,
    contentH: 400,
    title: "Flow",
    html: diagramHtml,
    copyText: "flowchart LR\n  A-->B",
    status: "draft",
  },
});
assert.equal(diagramPackets.length, 1);
assert.equal(diagramPackets[0].type, "SYNC_WIDGET_ADD");
if (diagramPackets[0].type === "SYNC_WIDGET_ADD") {
  assert.equal(diagramPackets[0].widget.html, "");
  assert.ok(JSON.stringify(diagramPackets[0]).length < MAX_PACKET_CHARS);
}

// Large AI applets (no rebuildable source) must chunk under the PeerJS ceiling.
const hugeHtml = "x".repeat(MAX_PACKET_CHARS + 5000);
const hugeWidgetPackets = expandPacket({
  type: "SYNC_WIDGET_ADD",
  widget: {
    id: "w-huge",
    kind: "html",
    pluginId: "general",
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    contentW: 400,
    contentH: 300,
    title: "Huge",
    html: hugeHtml,
    status: "draft",
  },
});
assert.ok(hugeWidgetPackets.length > 1);
assert.ok(hugeWidgetPackets.every((p) => p.type === "SYNC_WIDGET_PART"));
assert.ok(hugeWidgetPackets.every((p) => JSON.stringify(p).length <= MAX_PACKET_CHARS + 512));
const reassembledHtml = hugeWidgetPackets
  .map((p) => (p.type === "SYNC_WIDGET_PART" ? p.htmlChunk : ""))
  .join("");
assert.equal(reassembledHtml, hugeHtml);
assert.equal(hugeWidgetPackets[0].type === "SYNC_WIDGET_PART" && !!hugeWidgetPackets[0].meta, true);

// SCENE with widgets fans out to clear + individual adds (never one mega packet).
const scenePackets = expandPacket({
  type: "SYNC_SCENE",
  widgets: [
    {
      id: "d2",
      kind: "diagram",
      pluginId: "flowchart",
      sourceFormat: "mermaid",
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      contentW: 100,
      contentH: 100,
      title: "S",
      html: diagramHtml,
      copyText: "graph TD;A-->B",
      status: "accepted",
    },
  ],
  objects: [],
});
assert.ok(scenePackets.length >= 2);
assert.equal(scenePackets[0].type, "SYNC_SCENE");
if (scenePackets[0].type === "SYNC_SCENE") {
  assert.equal(scenePackets[0].widgets.length, 0);
}
assert.ok(scenePackets.slice(1).every((p) => p.type === "SYNC_WIDGET_ADD" || p.type === "SYNC_WIDGET_PART"));

// Oversized ink moves chunk the dataUrl.
const hugeDataUrl = "data:image/webp;base64," + "A".repeat(MAX_PACKET_CHARS);
const inkParts = expandPacket({
  type: "SYNC_INK_MOVE",
  from: { x: 1, y: 2, w: 3, h: 4 },
  x: 10,
  y: 20,
  w: 3,
  h: 4,
  dataUrl: hugeDataUrl,
});
assert.ok(inkParts.length > 1);
assert.ok(inkParts.every((p) => p.type === "SYNC_INK_MOVE_PART"));
assert.equal(
  inkParts.map((p) => (p.type === "SYNC_INK_MOVE_PART" ? p.chunk : "")).join(""),
  hugeDataUrl
);

// INIT_STATE must not go out as one giant packet — callers use SCENE+TILES.
assert.deepEqual(
  expandPacket({
    type: "SYNC_INIT_STATE",
    snapshot: { version: 1, savedAt: 0, tiles: { "0,0": "data:tiny" }, widgets: [], objects: [] },
  }),
  []
);

console.log("sync.test.ts: ok");
