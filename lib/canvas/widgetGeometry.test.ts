import assert from "node:assert/strict";
import {
  normalizeWidgetGeometry,
  resizeWidgetGeometry,
  settleWidgetContent,
  widgetScale,
} from "./widgetGeometry";

const legacy = normalizeWidgetGeometry({ x: -20, y: 25_000, w: 500, h: 300 });
assert.equal(legacy.x, 0);
assert.equal(legacy.y, 19_700);
assert.equal(legacy.contentW, 500);

const base = normalizeWidgetGeometry({ x: 100, y: 100, w: 600, h: 400, contentW: 600, contentH: 400 });
const wide = resizeWidgetGeometry(base, "horizontal", 900, 400);
assert.equal(wide.contentW, 900);
assert.equal(wide.h, 400);
assert.equal(widgetScale(wide), 1);

const tall = resizeWidgetGeometry(base, "vertical", 600, 700);
assert.equal(tall.contentH, 700);
assert.equal(tall.w, 600);

const corner = resizeWidgetGeometry(base, "corner", 900, 500);
assert.equal(corner.w, 900);
assert.equal(corner.h, 600);

const reflowed = settleWidgetContent(wide, 900, 640);
assert.equal(reflowed.w, 900);
assert.equal(reflowed.h, 640);
