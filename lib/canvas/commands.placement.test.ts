import assert from "node:assert/strict";
import { fitWidgetGeometry, placeAroundAnchor, PLACE_GAP, validateCommand } from "./commands";

const view = { x: 8000, y: 4000, w: 1600, h: 1000 };
const ink = { x: 8200, y: 4200, w: 420, h: 70 };
const html = "<html><body><div>clocks</div></body></html>";

function widget(partial: Record<string, unknown> = {}) {
  return validateCommand(
    {
      tool: "html_widget",
      pluginId: "general",
      title: "World clocks",
      html,
      w: 1080,
      h: 520,
      placement: "below",
      refreshSeconds: 0,
      ...partial,
    },
    {
      aiColor: "#2679b8",
      scale: 1,
      widgetSlots: 8,
      plugins: new Set(["general", "flowchart"]),
      visibleRect: view,
      changedBox: ink,
      sceneItems: [],
    }
  );
}

const placed = widget();
assert.ok(placed && placed.tool === "html_widget");
if (placed.tool === "html_widget") {
  assert.equal(placed.w, 1080, "must not crush a 3-clock width down to the old 540 default");
  assert.equal(placed.h, 520);
  assert.equal(placed.x, ink.x, "below the ink, left-aligned to the handwriting");
  assert.equal(placed.y, ink.y + ink.h + PLACE_GAP);
  assert.ok(placed.y > ink.y + ink.h, "must not cover the user's ink");
  assert.ok(placed.x + placed.w < view.x + view.w + 200, "stays near the writing, not across the canvas");
}

const geom = fitWidgetGeometry(
  { w: 1080, h: 520, placement: "below" },
  view,
  ink,
  true,
  undefined,
  [{ kind: "html", x: ink.x, y: ink.y + ink.h + PLACE_GAP, w: 900, h: 400 }]
);
assert.ok(geom);
assert.ok(geom.x > ink.x, "slides beside a blocking widget instead of overlapping it");
assert.ok(Math.abs(geom.y - (ink.y + ink.h + PLACE_GAP)) <= 8, "stays on the below side while sliding");
assert.ok(geom.x < ink.x + 1400, "slide must not teleport");

const noDump = fitWidgetGeometry(
  { w: 720, h: 480, placement: "below" },
  view,
  { x: view.x, y: view.y, w: view.w, h: view.h }
);
assert.ok(noDump);
assert.ok(noDump.y < view.y + view.h, "full-viewport dump must not park the widget below the whole capture");
assert.ok(noDump.y > view.y, "dump fallback stays inside the visible page");

const near = placeAroundAnchor(ink, 720, 480, view, [], "below");
assert.equal(near.x, ink.x);
assert.equal(near.y, ink.y + ink.h + PLACE_GAP);

const leftEdge = placeAroundAnchor({ x: 40, y: 5000, w: 120, h: 40 }, 900, 400, { x: 0, y: 4500, w: 1400, h: 900 }, [], "left");
assert.ok(leftEdge.x >= 0, "must stay on canvas");
assert.ok(Math.abs(leftEdge.y - 5040) <= 80 || Math.abs(leftEdge.x - 160) <= 80, "falls to below/right of the ink, not a distant park");

const overlapInk = fitWidgetGeometry({ w: 720, h: 400, placement: "below" }, view, ink);
assert.ok(overlapInk);
assert.ok(overlapInk.y >= ink.y + ink.h, "html applets must sit past the handwriting, not on top of it");

console.log("commands.placement.test.ts: ok");
