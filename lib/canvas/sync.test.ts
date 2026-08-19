import assert from "node:assert/strict";
import { sanitizePacket, type SyncPacket } from "./sync";

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

console.log("sync.test.ts: ok");
