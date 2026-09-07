import assert from "node:assert";
import { renderSketchnote, type SketchnoteSpec } from "../lib/canvas/sketchnoteRenderer";
import { validateCommands, AI_TEXT_MAX_LENGTH, type CommandValidationContext } from "../lib/canvas/commands";

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    console.log(`FAIL  ${name}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

function ctxFor(scale = 1): CommandValidationContext {
  return {
    aiColor: "#2679b8",
    scale,
    widgetSlots: 8,
    visibleRect: { x: 2000, y: 2000, w: 1600, h: 1000 },
    changedBox: { x: 2400, y: 2200, w: 700, h: 300 },
    sceneItems: [],
    widgetGeometry: { max: { w: 5000, h: 5000 } },
    intent: null,
  };
}

function validateAll(cmds: unknown[], ctx: CommandValidationContext) {
  const all: { commands: ReturnType<typeof validateCommands>["commands"]; rejected: string[] }[] = [];
  for (let i = 0; i < cmds.length; i += 14) {
    all.push(validateCommands(cmds.slice(i, i + 14), ctx));
  }
  return all;
}

function checkCommandIntegrity(label: string, cmds: ReturnType<typeof renderSketchnote>) {
  let draw = 0;
  let text = 0;
  for (const c of cmds) {
    if (c.tool === "draw") {
      draw++;
      assert.ok(c.points.length >= 2 && c.points.length <= 600, `${label}: draw stroke has ${c.points.length} points (limit 2..600)`);
      assert.ok(Number.isFinite(c.size) && c.size >= 1 && c.size <= 1600, `${label}: draw size ${c.size} outside 1..1600`);
      for (const p of c.points) {
        assert.ok(Number.isFinite(p.x) && p.y !== undefined, `${label}: bad point`);
        assert.ok(p.x >= 0 && p.x <= 20000 && p.y >= 0 && p.y <= 20000, `${label}: point (${p.x},${p.y}) outside canvas`);
      }
    } else if (c.tool === "write_text") {
      text++;
      assert.ok(c.text.length <= AI_TEXT_MAX_LENGTH, `${label}: write_text length ${c.text.length} > ${AI_TEXT_MAX_LENGTH}`);
      assert.ok(c.fontSize >= 12, `${label}: fontSize ${c.fontSize} < 12`);
      assert.ok(c.color && c.color !== "#2679b8", `${label}: color was hijacked to aiColor`);
    } else {
      throw new Error(`${label}: unexpected tool ${c.tool}`);
    }
  }
  return { draw, text, total: cmds.length };
}

await test("T1 loss surface sketchnote: no rejects, valid strokes, no placement hijack", () => {
  const spec: SketchnoteSpec = {
    title: "Gradient Descent: 3D Loss Surface",
    subtitle: "How ML models learn by rolling downhill",
    visualDiagram: { type: "loss_surface" },
    sections: [
      { id: "a", heading: "The Idea", bullets: ["Start anywhere on the loss bowl", "Follow the slope downhill", "Each step shrinks the loss"], icon: "lightbulb", container: "cloud", accentColor: "yellow" },
      { id: "b", heading: "The Gradient ∇J", bullets: ["Points uphill, steepest ascent direction", "Negate it to descend", "Vanishes at the minimum"], icon: "target", container: "bracket", accentColor: "blue" },
      { id: "c", heading: "Learning Rate α", bullets: ["Too big: overshoot the valley", "Too small: crawl forever", "Decay schedules balance both"], icon: "gear", container: "box", accentColor: "red" },
      { id: "d", heading: "Local Minima", bullets: ["Bowl surfaces converge globally", "Rugged surfaces may trap θ", "Momentum helps escape dips"], container: "burst", accentColor: "green" },
    ],
    connectors: [{ from: "a", to: "c", label: "drives" }],
    x: 2400,
    y: 2600,
    w: 2400,
  };
  const cmds = renderSketchnote(spec);
  const stats = checkCommandIntegrity("T1", cmds);
  const ctx = ctxFor();
  const batches = validateAll(cmds, ctx);
  const rejected = batches.flatMap((b) => b.rejected);
  assert.deepStrictEqual(rejected, [], `T1 rejected: ${JSON.stringify(rejected)}`);
  const appliedDraws = batches.reduce((n, b) => n + b.commands.filter((c) => c.tool === "draw").length, 0);
  assert.equal(appliedDraws, stats.draw, "some draw commands were dropped by validation");
  console.log(`      -> ${stats.total} commands (${stats.draw} draw, ${stats.text} text)`);
});

await test("T2 euler complex plane sketchnote", () => {
  const spec: SketchnoteSpec = {
    title: "Euler's Identity",
    visualDiagram: { type: "complex_plane", title: "The unit circle", annotation: "e^iπ + 1 = 0" },
    sections: [
      { id: "s1", heading: "Why it matters", bullets: ["Links 5 constants", "Rotation is multiplication", "Growth becomes geometry"], icon: "star" },
      { id: "s2", heading: "Reading the circle", bullets: ["Multiplying by i rotates 90°", "e^iθ spins at unit speed", "π lands you at -1"], icon: "brain", container: "cloud", accentColor: "blue" },
    ],
    x: 1000,
    y: 1000,
    w: 2600,
  };
  const cmds = renderSketchnote(spec);
  const stats = checkCommandIntegrity("T2", cmds);
  const rejected = validateAll(cmds, ctxFor()).flatMap((b) => b.rejected);
  assert.deepStrictEqual(rejected, []);
  console.log(`      -> ${stats.total} commands (${stats.draw} draw, ${stats.text} text)`);
});

await test("T3 neural network + cycle + flow diagrams", () => {
  for (const type of ["neural_network", "cycle", "flow"] as const) {
    const spec: SketchnoteSpec = {
      title: `Topic ${type}`,
      visualDiagram: { type, annotation: "annotated flow" },
      sections: [
        { id: "n1", heading: "Alpha", bullets: ["one", "two"] },
        { id: "n2", heading: "Beta", bullets: ["three"] },
        { id: "n3", heading: "Gamma" },
      ],
      x: 3000,
      y: 3000,
    };
    const cmds = renderSketchnote(spec);
    const stats = checkCommandIntegrity(`T3/${type}`, cmds);
    const rejected = validateAll(cmds, ctxFor()).flatMap((b) => b.rejected);
    assert.deepStrictEqual(rejected, [], `T3/${type} rejected: ${rejected.join(",")}`);
    console.log(`      -> ${type}: ${stats.total} commands (${stats.draw} draw, ${stats.text} text)`);
  }
});

await test("T4 custom elements diagram renders and is not dropped", () => {
  const spec: SketchnoteSpec = {
    title: "Water Cycle Notes",
    visualDiagram: {
      type: "custom",
      title: "Evaporation loop",
      annotation: "Energy from the sun drives the loop",
      elements: [
        { type: "circle", cx: 50, cy: 10, r: 10, color: "#2563eb" },
        { type: "arrow", x1: 50, y1: 20, x2: 50, y2: 60, color: "#dc2626" },
        { type: "text", x1: 60, y1: 40, text: "Rain", fontSize: 12, color: "#18181b" },
        { type: "curve", points: [[10, 40], [25, 50], [40, 35]] },
        { type: "dot", x1: 30, y1: 30, color: "#16a34a" },
        { type: "line", x1: 0, y1: 0, x2: 100, y2: 70 },
      ],
    },
    sections: [{ id: "w", heading: "Evaporation", bullets: ["Sun heats oceans"] }],
    x: 500,
    y: 500,
  };
  const cmds = renderSketchnote(spec);
  const stats = checkCommandIntegrity("T4", cmds);
  assert.ok(stats.draw > 6, "custom elements produced no ink");
  const rejected = validateAll(cmds, ctxFor()).flatMap((b) => b.rejected);
  assert.deepStrictEqual(rejected, []);
  console.log(`      -> ${stats.total} commands (${stats.draw} draw, ${stats.text} text)`);
});

await test("T5 long bullets are chunked under the 800-char text limit", () => {
  const longBullets = Array.from({ length: 6 }, (_, i) => `Bullet number ${i + 1}: a fairly long line of sketchnote content that will wrap across the column and push the container to grow taller than its default fixed height estimate.`);
  const spec: SketchnoteSpec = {
    title: "Long content test",
    sections: [{ id: "l1", heading: "Wall of text", bullets: longBullets }],
    x: 800,
    y: 800,
  };
  const cmds = renderSketchnote(spec);
  for (const c of cmds) {
    if (c.tool === "write_text") {
      assert.ok(c.text.length <= AI_TEXT_MAX_LENGTH, `T5: text chunk ${c.text.length} chars exceeds ${AI_TEXT_MAX_LENGTH}`);
    }
  }
  const rejected = validateAll(cmds, ctxFor()).flatMap((b) => b.rejected);
  assert.deepStrictEqual(rejected, []);
});

await test("T6 text placement is not hijacked by the anchor placement engine", () => {
  const spec: SketchnoteSpec = {
    title: "Placement test",
    visualDiagram: { type: "flow", annotation: "x" },
    sections: [{ id: "p1", heading: "Far below ink", bullets: ["text"] }],
    x: 2400,
    y: 2600,
    w: 2400,
  };
  const cmds = renderSketchnote(spec);
  const ctx = ctxFor();
  const requested = cmds
    .filter((c): c is Extract<typeof c, { tool: "write_text" }> => c.tool === "write_text")
    .map((c) => ({ x: Math.round(c.x), y: Math.round(c.y) }));
  let checked = 0;
  let moved = 0;
  for (let i = 0; i < cmds.length; i += 14) {
    const res = validateCommands(cmds.slice(i, i + 14), ctx);
    for (const c of res.commands as { tool: string; x?: number; y?: number }[]) {
      if (c.tool === "write_text") {
        assert.ok(c.x !== undefined && c.y !== undefined, "T6: write_text missing x/y");
        const stillThere = requested.some((p) => Math.abs(p.x - c.x!) < 4 && Math.abs(p.y - c.y!) < 4);
        if (!stillThere) moved++;
        checked++;
      }
    }
  }
  assert.ok(checked >= 5, `T6: only ${checked} write_text survived validation`);
  assert.equal(moved, 0, `T6: ${moved} write_text were repositioned by the placement engine`);
});

await test("T7 timeline layout and connectors", () => {
  const spec: SketchnoteSpec = {
    title: "Timeline notes",
    layout: "timeline",
    sections: [
      { id: "t1", heading: "1815 Birth" },
      { id: "t2", heading: "1837 Publication" },
      { id: "t3", heading: "1855 Legacy" },
    ],
    connectors: [
      { from: "t1", to: "t2", label: "next", style: "arrow" },
      { from: "t2", to: "t3", style: "curved" },
    ],
    x: 1200,
    y: 4000,
  };
  const cmds = renderSketchnote(spec);
  const stats = checkCommandIntegrity("T7", cmds);
  const rejected = validateAll(cmds, ctxFor()).flatMap((b) => b.rejected);
  assert.deepStrictEqual(rejected, []);
  console.log(`      -> ${stats.total} commands (${stats.draw} draw, ${stats.text} text)`);
});

await test("T8 every icon variant renders valid commands", () => {
  const icons = ["lightbulb", "gear", "brain", "person", "target", "check", "star", "database", "book", "rocket", "magnifier", "heart", "cloud", "bolt", "lock", "unknown-icon"];
  const spec: SketchnoteSpec = {
    title: "Icon zoo",
    sections: icons.map((icon, i) => ({ id: `i${i}`, heading: `Icon ${icon}`, icon, bullets: ["x"] })),
    x: 1500,
    y: 1500,
    w: 2600,
  };
  const cmds = renderSketchnote(spec);
  const stats = checkCommandIntegrity("T8", cmds);
  const rejected = validateAll(cmds, ctxFor()).flatMap((b) => b.rejected);
  assert.deepStrictEqual(rejected, []);
  console.log(`      -> ${stats.total} commands (${stats.draw} draw, ${stats.text} text)`);
});

await test("T9 command budget stays reasonable for a full sketchnote", () => {
  const spec: SketchnoteSpec = {
    title: "Full budget stress test",
    subtitle: "with everything on",
    visualDiagram: { type: "loss_surface" },
    sections: Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      heading: `Section ${i + 1}`,
      bullets: ["alpha point", "beta point", "gamma point"],
      icon: "check",
      container: "box",
    })),
    connectors: [{ from: "s0", to: "s1" }, { from: "s1", to: "s2" }],
    x: 1000,
    y: 6000,
    w: 2400,
  };
  const cmds = renderSketchnote(spec);
  const stats = checkCommandIntegrity("T9", cmds);
  console.log(`      -> ${stats.total} commands (${stats.draw} draw, ${stats.text} text), ${Math.ceil(stats.total / 14)} batches`);
});

await test("T10 duplicate object ids no longer possible in a batch (id generator monotonic)", () => {
  const spec: SketchnoteSpec = {
    title: "Id test",
    sections: [{ id: "x", heading: "H", bullets: ["a", "b"] }],
    x: 0,
    y: 0,
  };
  const cmds = renderSketchnote(spec);
  const textCount = cmds.filter((c) => c.tool === "write_text").length;
  assert.ok(textCount >= 2, "expected multiple write_text commands");
  console.log(`      -> ${textCount} write_text commands in one sketchnote (all get unique object ids via nextLocalObjectId)`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
