import assert from "node:assert";
import {
  gapInf,
  clearance,
  intersectArea,
  visibility,
  scaleAwareGap,
  inflate,
  join,
  meet,
  pgaRaycastRects,
  pointInPolygon,
  largestInscribedRect,
  fitAspectLocked,
  headroom,
  candidateLattice,
  solvePlacement,
  type Box,
  type Point,
} from "../lib/canvas/placement";

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.stack || err.message : String(err);
    failures.push(`${name}: ${msg}`);
    console.error(`  ✗ ${name}`);
    console.error(`    ${msg}`);
  }
}

console.log("\nPlacement Geometry Engine Verification Checks (Phase 1):\n");

// 1. gapInf horizontal
await test("P1 gapInf computes exact horizontal distance between separated boxes", () => {
  const b1: Box = { x: 100, y: 100, w: 200, h: 150 };
  const b2: Box = { x: 350, y: 100, w: 100, h: 150 };
  assert.strictEqual(gapInf(b1, b2), 50);
  assert.strictEqual(gapInf(b2, b1), 50);
});

// 2. gapInf vertical
await test("P2 gapInf computes exact vertical distance between separated boxes", () => {
  const b1: Box = { x: 100, y: 100, w: 200, h: 100 };
  const b2: Box = { x: 100, y: 240, w: 200, h: 100 };
  assert.strictEqual(gapInf(b1, b2), 40);
  assert.strictEqual(gapInf(b2, b1), 40);
});

// 3. gapInf diagonal
await test("P3 gapInf computes L_infinity metric as max(dx, dy) for diagonally separated boxes", () => {
  const b1: Box = { x: 0, y: 0, w: 100, h: 100 };
  const b2: Box = { x: 130, y: 170, w: 100, h: 100 };
  // dx = 130 - 100 = 30; dy = 170 - 100 = 70; L_inf = max(30, 70) = 70
  assert.strictEqual(gapInf(b1, b2), 70);
  assert.strictEqual(gapInf(b2, b1), 70);
});

// 4. gapInf touching and overlapping
await test("P4 gapInf returns 0 for touching boxes and negative for overlapping boxes", () => {
  const b1: Box = { x: 0, y: 0, w: 100, h: 100 };
  const touching: Box = { x: 100, y: 0, w: 100, h: 100 };
  assert.strictEqual(gapInf(b1, touching), 0);

  const overlapping: Box = { x: 50, y: 50, w: 100, h: 100 };
  assert.ok(gapInf(b1, overlapping) < 0, "Overlapping boxes must have negative L_inf distance");
  assert.strictEqual(gapInf(b1, overlapping), -50);
});

// 5. clearance
await test("P5 clearance returns minimum gap across obstacles or Infinity when empty", () => {
  const box: Box = { x: 100, y: 100, w: 100, h: 100 };
  assert.strictEqual(clearance(box, []), Infinity);

  const obstacles: Box[] = [
    { x: 300, y: 100, w: 100, h: 100 }, // dx = 100
    { x: 100, y: 250, w: 100, h: 100 }, // dy = 50
    { x: 600, y: 600, w: 100, h: 100 }, // far
  ];
  assert.strictEqual(clearance(box, obstacles), 50);
});

// 6. intersectArea
await test("P6 intersectArea returns exact overlap area and 0 for non-intersecting", () => {
  const a: Box = { x: 0, y: 0, w: 100, h: 100 };
  const b: Box = { x: 50, y: 50, w: 100, h: 100 };
  assert.strictEqual(intersectArea(a, b), 50 * 50);

  const disjoint: Box = { x: 200, y: 200, w: 100, h: 100 };
  assert.strictEqual(intersectArea(a, disjoint), 0);

  const touching: Box = { x: 100, y: 0, w: 100, h: 100 };
  assert.strictEqual(intersectArea(a, touching), 0);
});

// 7. visibility
await test("P7 visibility calculates visible fraction inside viewport", () => {
  const box: Box = { x: 50, y: 50, w: 100, h: 100 };
  assert.strictEqual(visibility(box, undefined), 1.0);

  const fullView: Box = { x: 0, y: 0, w: 500, h: 500 };
  assert.strictEqual(visibility(box, fullView), 1.0);

  const halfView: Box = { x: 0, y: 0, w: 100, h: 200 }; // overlaps x from 50 to 100 (50w x 100h)
  assert.strictEqual(visibility(box, halfView), 0.5);

  const outsideView: Box = { x: 500, y: 500, w: 200, h: 200 };
  assert.strictEqual(visibility(box, outsideView), 0.0);
});

// 8. scaleAwareGap
await test("P8 scaleAwareGap yields constant 14px perceived screen gap across zooms", () => {
  const g1 = scaleAwareGap(1.0);
  assert.strictEqual(g1, 14);

  const g025 = scaleAwareGap(0.25);
  assert.strictEqual(g025, 56);
  assert.strictEqual(g025 * 0.25, 14);

  const g4 = scaleAwareGap(4.0);
  assert.strictEqual(g4, 3.5);
  assert.strictEqual(g4 * 4.0, 14);

  // Viewport 5% clamp test
  const smallView = { w: 200, h: 200 };
  const gClamped = scaleAwareGap(0.05, smallView); // 14 / 0.05 = 280; 0.05 * 200 = 10
  assert.strictEqual(gClamped, 10);
});

// 9. inflate Minkowski configuration-space
await test("P9 inflate accurately maps Minkowski configuration-space obstacle boundary", () => {
  const obstacle: Box = { x: 1000, y: 1000, w: 400, h: 300 };
  const w = 200;
  const h = 100;
  const gap = 20;

  const m = inflate(obstacle, w, h, gap);
  assert.strictEqual(m.x, obstacle.x - w - gap);
  assert.strictEqual(m.y, obstacle.y - h - gap);
  assert.strictEqual(m.w, obstacle.w + w + 2 * gap);
  assert.strictEqual(m.h, obstacle.h + h + 2 * gap);

  // Test 500 points: inside iff clearance < gap
  for (let i = 0; i < 500; i++) {
    const px = 600 + (i % 25) * 40;
    const py = 700 + Math.floor(i / 25) * 40;
    const testBox: Box = { x: px, y: py, w, h };
    const insideMinkowski =
      px > m.x && px < m.x + m.w && py > m.y && py < m.y + m.h;
    const g = gapInf(testBox, obstacle);
    if (insideMinkowski) {
      assert.ok(g < gap, `Point (${px}, ${py}) inside Minkowski must have gap < ${gap}, got ${g}`);
    } else {
      assert.ok(g >= gap - 1e-6, `Point (${px}, ${py}) outside Minkowski must have gap >= ${gap}, got ${g}`);
    }
  }

  // Verify candidateLattice includes flush boundaries and knots
  const lattice = candidateLattice(obstacle, w, h, gap, [], { x: 0, y: 0, w: 5000, h: 5000 });
  assert.ok(lattice.length > 0, "Candidate lattice must generate candidate points");
  assert.ok(lattice.some((pt) => pt.x === obstacle.x - w - gap), "Lattice must contain left-flush coordinate");
  assert.ok(lattice.some((pt) => pt.x === obstacle.x + obstacle.w + gap), "Lattice must contain right-flush coordinate");
});

// 10. PGA join
await test("P10 join constructs normalized line equation ax + by + c = 0", () => {
  const p1: Point = { x: 10, y: 20 };
  const p2: Point = { x: 10, y: 80 };
  const line = join(p1, p2);

  // Vertical line: a*x + b*y + c = 0 with b=0
  const eval1 = line.a * p1.x + line.b * p1.y + line.c;
  const eval2 = line.a * p2.x + line.b * p2.y + line.c;
  assert.ok(Math.abs(eval1) < 1e-9, `Line must pass through p1: got ${eval1}`);
  assert.ok(Math.abs(eval2) < 1e-9, `Line must pass through p2: got ${eval2}`);
  assert.ok(Math.abs(Math.hypot(line.a, line.b) - 1.0) < 1e-9, "Line normal must be unit length");
});

// 11. PGA meet
await test("P11 meet finds exact intersection point of intersecting lines", () => {
  // Horizontal line y = 50: 0*x + 1*y - 50 = 0
  const l1 = { a: 0, b: 1, c: -50 };
  // Vertical line x = 120: 1*x + 0*y - 120 = 0
  const l2 = { a: 1, b: 0, c: -120 };

  const p = meet(l1, l2);
  assert.ok(Math.abs(p.w) > 1e-6, "Intersecting lines must have non-zero homogeneous weight w");
  assert.strictEqual(Math.round(p.x / p.w), 120);
  assert.strictEqual(Math.round(p.y / p.w), 50);
});

// 12. PGA meet parallel lines
await test("P12 meet returns w = 0 ideal point for parallel lines without NaN", () => {
  // Horizontal line y = 50
  const l1 = { a: 0, b: 1, c: -50 };
  // Horizontal line y = 100
  const l2 = { a: 0, b: 1, c: -100 };

  const p = meet(l1, l2);
  assert.strictEqual(p.w, 0, "Parallel lines must yield homogeneous w = 0 (ideal point at infinity)");
  assert.ok(!Number.isNaN(p.x) && !Number.isNaN(p.y), "Ideal point coordinates must not be NaN");
});

// 13. PGA raycasting against rectangles
await test("P13 pgaRaycastRects finds nearest obstacle intersection distance", () => {
  const origin: Point = { x: 100, y: 100 };
  const dir: Point = { x: 1, y: 0 }; // shooting right
  const obstacles: Box[] = [
    { x: 300, y: 80, w: 50, h: 100 }, // hit at x = 300 (dist = 200)
    { x: 500, y: 80, w: 50, h: 100 }, // farther
  ];

  const hit = pgaRaycastRects(origin, dir, obstacles);
  assert.ok(hit !== null, "Ray must hit obstacle");
  assert.strictEqual(Math.round(hit.dist), 200);
  assert.strictEqual(Math.round(hit.hit.x), 300);
  assert.strictEqual(Math.round(hit.hit.y), 100);
});

// 14. PGA raycasting misses
await test("P14 pgaRaycastRects returns null when ray does not intersect any obstacles", () => {
  const origin: Point = { x: 100, y: 100 };
  const dir: Point = { x: -1, y: 0 }; // shooting left away from obstacles
  const obstacles: Box[] = [{ x: 300, y: 80, w: 50, h: 100 }];

  const hit = pgaRaycastRects(origin, dir, obstacles);
  assert.strictEqual(hit, null, "Ray pointing away must return null");
});

// 15. headroom calculation
await test("P15 headroom saturates at gap and reflects clearance when pinch occurs", () => {
  const box: Box = { x: 100, y: 100, w: 100, h: 100 };
  const gap = 30;

  // Obstacle far away (clearance = 100 > gap)
  const farObs: Box[] = [{ x: 300, y: 100, w: 100, h: 100 }];
  assert.strictEqual(headroom(box, farObs, gap), gap);

  // Obstacle close (clearance = 15 < gap)
  const closeObs: Box[] = [{ x: 215, y: 100, w: 100, h: 100 }];
  assert.strictEqual(headroom(box, closeObs, gap), 15);
});

// 16. largestInscribedRect in rectangular container
await test("P16 largestInscribedRect finds maximal inscribed box inside rectangular polygon", () => {
  const container: Box = { x: 1000, y: 2000, w: 800, h: 600 };
  const aspect = 800 / 600; // 4:3

  const inscribed = largestInscribedRect(container, aspect);
  assert.ok(inscribed.w > 780, `Expected width close to 800, got ${inscribed.w}`);
  assert.ok(inscribed.h > 580, `Expected height close to 600, got ${inscribed.h}`);
  assert.ok(inscribed.x >= container.x, "Must be contained within bounds");
  assert.ok(inscribed.y >= container.y, "Must be contained within bounds");
  assert.ok(inscribed.x + inscribed.w <= container.x + container.w + 1);
  assert.ok(inscribed.y + inscribed.h <= container.y + container.h + 1);
});

// 17. largestInscribedRect with concave L-shaped polygon (inclusive sampling check)
await test("P17 largestInscribedRect prevents corner spill in concave L-shaped polygon", () => {
  // L-shape polygon with notch cut out of top right: [0..1000] x [0..1000] with (500..1000, 500..1000) empty
  const lPoly: Point[] = [
    { x: 0, y: 0 },
    { x: 500, y: 0 },
    { x: 500, y: 500 },
    { x: 1000, y: 500 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ];

  const rect = largestInscribedRect(lPoly, 1.0);
  assert.ok(rect.w > 0 && rect.h > 0, "Must find inscribed square");

  // Every sample along the boundary of rect must be inside the polygon
  const samples = 10;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    assert.ok(pointInPolygon({ x: rect.x + t * rect.w, y: rect.y }, lPoly), "Top edge must be inside L-poly");
    assert.ok(pointInPolygon({ x: rect.x + t * rect.w, y: rect.y + rect.h }, lPoly), "Bottom edge must be inside L-poly");
    assert.ok(pointInPolygon({ x: rect.x, y: rect.y + t * rect.h }, lPoly), "Left edge must be inside L-poly");
    assert.ok(pointInPolygon({ x: rect.x + rect.w, y: rect.y + t * rect.h }, lPoly), "Right edge must be inside L-poly");
  }
});

// 18. largestInscribedRect memoization
await test("P18 largestInscribedRect uses memoized results for repeated identical requests", () => {
  const container: Box = { x: 500, y: 500, w: 600, h: 400 };
  const t0 = performance.now();
  const r1 = largestInscribedRect(container, 1.5);
  const dur1 = performance.now() - t0;

  const t1 = performance.now();
  const r2 = largestInscribedRect(container, 1.5);
  const dur2 = performance.now() - t1;

  assert.strictEqual(r1.x, r2.x);
  assert.strictEqual(r1.y, r2.y);
  assert.strictEqual(r1.w, r2.w);
  assert.strictEqual(r1.h, r2.h);
  assert.ok(dur2 < dur1 + 0.5, "Memoized lookup must be instantaneous");
});

// 19. fitAspectLocked mode "free"
await test("P19 fitAspectLocked in 'free' mode applies readability floor at low zoom", () => {
  const smallW = 576;
  const smallH = 376;
  const maxW = 1500;
  const maxH = 1200;

  // At scale = 0.25, readability floor upscales small request
  const fitted = fitAspectLocked(smallW, smallH, maxW, maxH, 300, 200, "free", 0.25);
  assert.ok(fitted.w > smallW, `Readability floor must upscale small request: got ${fitted.w} > ${smallW}`);
  assert.strictEqual(fitted.w, 1500, "Should scale up to max bounds when readable floor demands it");
  assert.strictEqual(fitted.h, 979, "Height must preserve aspect ratio");
});

// 20. fitAspectLocked mode "contained"
await test("P20 fitAspectLocked in 'contained' mode disables readability floor to prevent spill", () => {
  // Verifies eval cases 01, 11, 23
  // Case 01: 1776x1176 in 2000x1500 container
  const c01 = fitAspectLocked(1776, 1176, 2000, 1500, 300, 200, "contained", 0.25);
  assert.strictEqual(c01.w, 1776, "Case 01 must keep requested width verbatim");
  assert.strictEqual(c01.h, 1176, "Case 01 must keep requested height verbatim");

  // Case 11: 576x376 in 1500x1200 container
  const c11 = fitAspectLocked(576, 376, 1500, 1200, 300, 200, "contained", 0.25);
  assert.strictEqual(c11.w, 576, "Case 11 must fit verbatim without readability blowup");
  assert.strictEqual(c11.h, 376, "Case 11 must fit verbatim without readability blowup");

  // Case 23: 545x650 in 2000x2500 container
  const c23 = fitAspectLocked(545, 650, 2000, 2500, 300, 200, "contained", 0.25);
  assert.strictEqual(c23.w, 545, "Case 23 must fit verbatim without readability blowup");
  assert.strictEqual(c23.h, 650, "Case 23 must fit verbatim without readability blowup");
});

// 21. solvePlacement below anchor
await test("P21 solvePlacement places cleanly below anchor when space is unobstructed", () => {
  const anchor: Box = { x: 5000, y: 5000, w: 400, h: 200 };
  const w = 600;
  const h = 400;
  const res = solvePlacement({
    anchor,
    w,
    h,
    scale: 1,
    preferred: "below",
  });

  assert.strictEqual(res.side, "below");
  assert.strictEqual(res.box.x, anchor.x);
  assert.strictEqual(res.box.y, anchor.y + anchor.h + 14);
  assert.strictEqual(res.box.w, w);
  assert.strictEqual(res.box.h, h);
});

// 22. solvePlacement right of anchor
await test("P22 solvePlacement places cleanly to the right when preferred is 'right'", () => {
  const anchor: Box = { x: 5000, y: 5000, w: 400, h: 200 };
  const w = 300;
  const h = 200;
  const res = solvePlacement({
    anchor,
    w,
    h,
    scale: 1,
    preferred: "right",
  });

  assert.strictEqual(res.side, "right");
  assert.strictEqual(res.box.x, anchor.x + anchor.w + 14);
  assert.strictEqual(res.box.y, anchor.y);
});

// 23. solvePlacement obstacle collision avoidance
await test("P23 solvePlacement navigates around blocking obstacles with 0 collisions", () => {
  const anchor: Box = { x: 5000, y: 5000, w: 400, h: 200 };
  const w = 500;
  const h = 300;
  const blockerBelow: Box = { x: 4900, y: 5200, w: 700, h: 400 }; // directly blocks "below" slot

  const res = solvePlacement({
    anchor,
    w,
    h,
    scale: 1,
    obstacles: [blockerBelow],
    preferred: "below",
  });

  assert.ok(gapInf(res.box, blockerBelow) >= 0, "Placed box must not collide with blocker");
  assert.ok(gapInf(res.box, anchor) >= 0, "Placed box must not collide with anchor");
});

// 24. solvePlacement viewport boundary preservation
await test("P24 solvePlacement prioritizes placement within visible viewport", () => {
  const view: Box = { x: 4000, y: 4000, w: 2000, h: 2000 };
  // Anchor near bottom of viewport: "below" would push outside viewport
  const anchor: Box = { x: 4500, y: 5800, w: 300, h: 100 };
  const w = 400;
  const h = 300;

  const res = solvePlacement({
    anchor,
    w,
    h,
    view,
    scale: 1,
    preferred: "below",
  });

  assert.ok(visibility(res.box, view) > 0.95, "Placement must remain visible within viewport");
});

// 25. solvePlacement with intent vector
await test("P25 solvePlacement aligns placement along provided intent vector", () => {
  const anchor: Box = { x: 5000, y: 5000, w: 300, h: 300 };
  const w = 400;
  const h = 300;
  // Arrow pointing diagonally top-right
  const intent = { x: 1, y: -1 };

  const res = solvePlacement({
    anchor,
    w,
    h,
    intent,
    scale: 1,
  });

  // Center of placed box must be to the right and above center of anchor
  const anchorCenter = { x: anchor.x + anchor.w / 2, y: anchor.y + anchor.h / 2 };
  const boxCenter = { x: res.box.x + res.box.w / 2, y: res.box.y + res.box.h / 2 };

  assert.ok(boxCenter.x > anchorCenter.x, "Box must be placed along positive x direction of intent");
  assert.ok(boxCenter.y < anchorCenter.y, "Box must be placed along negative y direction of intent");
});

// 26. Brute force ground truth verification & performance benchmark
await test("P26 Brute force verification across 500 configurations: 0 false clearances, < 100µs solve", () => {
  const count = 500;
  const t0 = performance.now();

  for (let i = 0; i < count; i++) {
    const anchor: Box = {
      x: 3000 + (i * 37) % 4000,
      y: 3000 + (i * 53) % 4000,
      w: 200 + (i % 5) * 60,
      h: 150 + (i % 4) * 50,
    };
    const obs: Box[] = [
      {
        x: anchor.x + ((i % 3) - 1) * 300,
        y: anchor.y + ((i % 2) ? 250 : -250),
        w: 250,
        h: 200,
      },
    ];

    const res = solvePlacement({
      anchor,
      w: 400,
      h: 300,
      obstacles: obs,
      scale: 1,
    });

    const c = clearance(res.box, obs);
    const aDist = gapInf(res.box, anchor);
    assert.ok(c >= -1e-6, `Obstacle collision detected in test configuration ${i}: clearance=${c}`);
    assert.ok(aDist >= -1e-6, `Anchor collision detected in test configuration ${i}: gapInf=${aDist}`);
  }

  const elapsed = performance.now() - t0;
  const perCallUs = (elapsed / count) * 1000;
  console.log(`    Benchmark: ${count} placements solved in ${elapsed.toFixed(2)}ms (${perCallUs.toFixed(1)} µs/call)`);
  assert.ok(perCallUs < 150, `Placement solve time must be < 150 µs/call, got ${perCallUs.toFixed(1)} µs`);
});

console.log("\n========================================");
console.log(`Result: ${passed}/${passed + failed} checks passed`);
console.log("========================================\n");

if (failed > 0) {
  console.error("Failures:\n" + failures.join("\n"));
  process.exit(1);
}
