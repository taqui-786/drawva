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
assert.ok(
  Math.abs(leftEdge.y - (5040 + PLACE_GAP)) <= 8 || Math.abs(leftEdge.x - (160 + PLACE_GAP)) <= 8,
  "falls to below/right of the ink, not a distant park"
);

const overlapInk = fitWidgetGeometry({ w: 720, h: 400, placement: "below" }, view, ink);
assert.ok(overlapInk);
assert.ok(overlapInk.y >= ink.y + ink.h, "html applets must sit past the handwriting, not on top of it");

// Reproduce the Neural Pipeline bug: model returns placement "below" while a
// previous widget sits in widgetEdit / scene. The new iframe must NOT inherit
// that widget's box.
const playgroundView = { x: 6789, y: 11503, w: 5309, h: 2432 };
const existingDiagram = { kind: "diagram", x: 8585, y: 9974, w: 2372, h: 774, title: "Agent Flowchart — System Spec v2.4" };
const handwriting = { x: 7200, y: 12840, w: 1960, h: 180 };
const widgetEditBox = { x: 8585, y: 9974, w: 2372, h: 774 };

const independent = fitWidgetGeometry(
  { w: 1440, h: 680, placement: "below", title: "Neural Pipeline Network" },
  playgroundView,
  handwriting,
  true,
  widgetEditBox,
  [existingDiagram]
);
assert.ok(independent);
assert.equal(independent.w, 1440, "must keep the model's content size, not copy the old widget");
assert.equal(independent.h, 680);
assert.equal(independent.x, handwriting.x, "left-aligned to the new handwriting");
assert.equal(independent.y, handwriting.y + handwriting.h + PLACE_GAP, "sits below the new request, not on the old diagram");
assert.ok(
  independent.y >= handwriting.y + handwriting.h,
  "must not cover the user's new ink"
);
assert.ok(
  independent.y >= existingDiagram.y + existingDiagram.h ||
    independent.x + independent.w <= existingDiagram.x ||
    independent.x >= existingDiagram.x + existingDiagram.w,
  "must not collapse onto the previous iframe"
);

const refined = fitWidgetGeometry(
  { w: 1440, h: 680, placement: "in_place", title: "Agent Flowchart — System Spec v2.4" },
  playgroundView,
  handwriting,
  true,
  widgetEditBox,
  [existingDiagram]
);
assert.ok(refined);
assert.equal(refined.x, widgetEditBox.x);
assert.equal(refined.y, widgetEditBox.y);
assert.equal(refined.w, widgetEditBox.w);
assert.equal(refined.h, widgetEditBox.h, "in_place still freezes the target box");

const explicitRefineBelow = fitWidgetGeometry(
  { w: 1440, h: 680, placement: "below" },
  playgroundView,
  handwriting,
  false,
  widgetEditBox,
  [existingDiagram]
);
assert.ok(explicitRefineBelow);
assert.equal(explicitRefineBelow.y, handwriting.y + handwriting.h + PLACE_GAP, "explicit Refine still honors an explicit new-item side");

const explicitRefineOmitted = fitWidgetGeometry(
  { w: 1440, h: 680 },
  playgroundView,
  handwriting,
  false,
  widgetEditBox,
  [existingDiagram]
);
assert.ok(explicitRefineOmitted);
assert.equal(explicitRefineOmitted.x, widgetEditBox.x);
assert.equal(explicitRefineOmitted.y, widgetEditBox.y, "explicit Refine with no side still snaps in place");

// Snapshot shows Neural Pipeline, but widgetEdit still points at a different
// off-screen flowchart. in_place must follow the command title, not the stale box.
const neuralView = { x: 8618, y: 11351, w: 2557, h: 1172 };
const specDiagram = { kind: "diagram", x: 8237, y: 9778, w: 1882, h: 409, title: "System Spec v2.4 - Agent Flowchart" };
const neuralDiagram = { kind: "diagram", x: 9087, y: 11450, w: 1170, h: 951, title: "Neural Pipeline Network" };
const staleInk = { x: 8827, y: 9680, w: 553, h: 135 };
const specBox = { x: specDiagram.x, y: specDiagram.y, w: specDiagram.w, h: specDiagram.h };

const skipOntoVisible = fitWidgetGeometry(
  { w: 1170, h: 951, placement: "in_place", title: "Neural Pipeline Network" },
  neuralView,
  staleInk,
  true,
  specBox,
  [specDiagram, neuralDiagram]
);
assert.ok(skipOntoVisible);
assert.equal(skipOntoVisible.x, neuralDiagram.x, "in_place must land on the named visible diagram");
assert.equal(skipOntoVisible.y, neuralDiagram.y);
assert.equal(skipOntoVisible.w, neuralDiagram.w);
assert.equal(skipOntoVisible.h, neuralDiagram.h, "must not copy the off-screen flowchart box");

const explicitKeepsChosen = fitWidgetGeometry(
  { w: 1170, h: 951, placement: "in_place", title: "Neural Pipeline Network" },
  neuralView,
  staleInk,
  false,
  specBox,
  [specDiagram, neuralDiagram]
);
assert.ok(explicitKeepsChosen);
assert.equal(explicitKeepsChosen.x, specBox.x, "explicit Refine still freezes the chosen widget");
assert.equal(explicitKeepsChosen.y, specBox.y);

const dumpWithNeighbor = fitWidgetGeometry(
  { w: 1440, h: 680, placement: "below" },
  playgroundView,
  playgroundView,
  true,
  widgetEditBox,
  [existingDiagram]
);
assert.ok(dumpWithNeighbor);
assert.ok(
  dumpWithNeighbor.x !== existingDiagram.x || dumpWithNeighbor.y !== existingDiagram.y,
  "a viewport dump plus widgetEdit must not park on the previous iframe"
);

console.log("commands.placement.test.ts: ok");
