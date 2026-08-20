import assert from "node:assert/strict";
import {
  sanitizePacket,
  expandPacket,
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

// Large AI widgets must chunk instead of failing PeerJS silently.
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

// Large tile maps expand into safe pieces.
const bigTile = "data:image/png;base64," + "B".repeat(MAX_PACKET_CHARS);
const tileParts = expandPacket({
  type: "SYNC_TILES",
  tiles: { "0,0": bigTile },
  done: true,
});
assert.ok(tileParts.length >= 1);
assert.ok(
  tileParts.every(
    (p) =>
      (p.type === "SYNC_TILES" && JSON.stringify(p).length <= MAX_PACKET_CHARS + 512) ||
      p.type === "SYNC_TILE_PART"
  )
);
if (tileParts[0].type === "SYNC_TILE_PART") {
  assert.equal(
    tileParts.map((p) => (p.type === "SYNC_TILE_PART" ? p.chunk : "")).join(""),
    bigTile
  );
}

// Stroke / erase packets stay single and pass through untouched.
assert.deepEqual(
  expandPacket({
    type: "SYNC_STROKE_SEGMENT",
    a: { x: 0, y: 0 },
    b: { x: 1, y: 1 },
    erase: true,
    size: 12,
    color: "#000",
  }),
  [
    {
      type: "SYNC_STROKE_SEGMENT",
      a: { x: 0, y: 0 },
      b: { x: 1, y: 1 },
      erase: true,
      size: 12,
      color: "#000",
    },
  ]
);

console.log("sync.test.ts: ok");
