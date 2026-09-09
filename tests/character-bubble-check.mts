/**
 * Guards the character thought-bubble copy so live reasoning is not replaced
 * by ticker status ("Deep in thought…") while the sprite is still walking.
 */
import assert from "node:assert";
import {
  formatThinkingStream,
  isStreamingThought,
  pickStandPoint,
  resolveThoughtText,
  routeAround,
  segmentHitsRect,
  wrapThoughtLines,
  getToolStartNarration,
  getToolEndNarration,
} from "../lib/canvas/agentCharacter";

const reasoning = "The user drew a login box. I should inspect the board, then place a flowchart to the right of the ink.";

const streaming = resolveThoughtText({
  thinkingBuffer: reasoning,
  turnActive: true,
  narration: "Deep in thought… · The user drew a login box.",
});

assert.ok(streaming, "reasoning must produce thought-bubble text");
assert.doesNotMatch(
  streaming,
  /^Deep in thought/,
  "ticker status must not win over a live reasoning stream",
);
assert.equal(streaming, formatThinkingStream(reasoning));
assert.match(streaming, /flowchart|ink|login/i);

const walkingOverwrite = resolveThoughtText({
  thinkingBuffer: "Considering a snapshot of the current layout before drawing.",
  turnActive: true,
  narration: "Taking a look at your board…",
});
assert.equal(
  walkingOverwrite,
  formatThinkingStream("Considering a snapshot of the current layout before drawing."),
);

assert.equal(
  resolveThoughtText({
    thinkingBuffer: "",
    turnActive: true,
    narration: "Drawing onto the board…",
  }),
  "Drawing onto the board…",
);

assert.equal(
  resolveThoughtText({
    thinkingBuffer: "leftover",
    turnActive: false,
    narration: "All done! Take a look ✨",
  }),
  "All done! Take a look ✨",
);

const longReasoning = Array.from({ length: 40 }, (_, i) => `step${i}`).join(" ");
const spoken = formatThinkingStream(longReasoning, 160);
assert.ok(spoken.startsWith("…"), "speech window should keep the tail of a long reasoning stream");
assert.ok(spoken.includes("step39"), "newest reasoning tokens must remain visible on the bubble");
assert.ok(!spoken.includes("step0"), "oldest reasoning tokens should fall off the bubble window");

assert.equal(isStreamingThought({ turnActive: true, thinkingBuffer: "evaluating coords" }), true);
assert.equal(isStreamingThought({ turnActive: false, thinkingBuffer: "evaluating coords" }), false);
assert.equal(isStreamingThought({ turnActive: true, thinkingBuffer: "   " }), false);

const wrapped = wrapThoughtLines("first second third fourth fifth sixth seventh eighth ninth tenth", 100, 3, null);
assert.ok(wrapped.length <= 3, "wrapped lines should not exceed maxLines");
assert.ok(wrapped[wrapped.length - 1].includes("tenth"), "tail line must include newest token");

const box = { x: 100, y: 100, w: 100, h: 100 };
const leftStand = pickStandPoint({ x: 40, y: 150 }, box, 24);
assert.equal(leftStand.side, "l");
assert.ok(leftStand.x < box.x, "should stand to the left of the drawing");
const rightStand = pickStandPoint({ x: 280, y: 140 }, box, 24);
assert.equal(rightStand.side, "r");

const through = routeAround({ x: 20, y: 150 }, { x: 280, y: 150 }, box, 8);
assert.ok(through.length >= 2, "blocked path should detour around the drawing");
for (const p of through.slice(0, -1)) {
  assert.equal(
    p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h,
    false,
    "detour waypoint must stay outside the drawing",
  );
}
assert.equal(segmentHitsRect({ x: 20, y: 150 }, { x: 280, y: 150 }, box), true);
assert.equal(segmentHitsRect({ x: 20, y: 40 }, { x: 280, y: 40 }, box), false);
const clear = routeAround({ x: 20, y: 40 }, { x: 280, y: 40 }, box, 8);
assert.equal(clear.length, 1, "clear line of sight should walk straight");

// Verify tool calling narration (no raw parameters or cryptic summaries)
assert.equal(getToolStartNarration("canvas_apply", "write_text"), "Let me write something here…");
assert.equal(getToolStartNarration("canvas_apply", "draw"), "Drawing this onto the board…");
assert.equal(getToolStartNarration("canvas_apply", "html_widget"), "Building an interactive widget…");
assert.equal(getToolStartNarration("canvas_apply", "diagram_source"), "Generating a diagram for this…");
assert.equal(getToolStartNarration("canvas_snapshot"), "Taking a quick look at the board…");
assert.equal(getToolStartNarration("canvas_scan"), "Scanning the canvas layout…");
assert.equal(getToolStartNarration("custom_xyz"), "Lemme run the custom xyz tool…");
assert.equal(getToolStartNarration("xyz"), "Lemme run the xyz tool…");

assert.equal(getToolEndNarration("canvas_apply", "write_text", true), "Okay, written! Now next…");
assert.equal(getToolEndNarration("canvas_apply", "html_widget", true), "Widget ready! Now next…");
assert.equal(getToolEndNarration("custom_xyz", undefined, true), "Okay, done! Now next…");
assert.equal(getToolEndNarration("custom_xyz", undefined, false), "Hit a small snag… let me fix that.");

console.log("character-bubble-check: ok");
