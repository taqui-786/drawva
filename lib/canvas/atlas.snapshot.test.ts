import assert from "node:assert/strict";
import { fittedImageRect } from "./atlas";

const box = { x: 100, y: 200, w: 1080, h: 520 };

const matching = fittedImageRect(1080, 520, box);
assert.equal(matching.x, box.x);
assert.equal(matching.y, box.y);
assert.equal(matching.w, box.w);
assert.equal(matching.h, box.h);

const squareClock = fittedImageRect(240, 240, box);
assert.ok(Math.abs(squareClock.w - squareClock.h) < 1, "a square clock must stay circular");
assert.ok(squareClock.w <= box.h + 1, "must not stretch to the dashboard width");
assert.ok(squareClock.x > box.x, "letterboxed horizontally");
assert.equal(Math.round(squareClock.h), box.h);

const threeClocks = fittedImageRect(1080, 520, box);
assert.equal(threeClocks.w, 1080);
assert.equal(threeClocks.h, 520);

console.log("atlas.snapshot.test.ts: ok");
