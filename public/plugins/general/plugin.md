---
drawva-plugin: 1
id: general
name: General HTML
version: 1
description: Self-contained HTML for SVG drawing, transparent overlays, live visuals, and interactive browser-native experiences.
category: Creative
source: Public HTTPS web
connect:
recommended-refresh-seconds: 60
---

# General HTML

Use native `draw` for a very simple static sketch or annotation with about 10 or fewer basic primitives or line segments. Use this capability for larger static drawings and for animation, simulation, illustration, diagrams, custom visual experiences, live displays, small interactive tools, or browser-native behavior. Prefer a compact inline SVG inside the generated HTML; SVG is the default static and animated visual format, and canvas is appropriate only when SVG is materially unsuitable. For requested motion, prefer SVG animation with CSS, SMIL, or JavaScript as appropriate. Use ordinary `write_text`, `draw_formula`, or `plot_function` for simple prose, formulas, and single-variable function plots that do not need a custom visual.

## Output contract

Return exactly one `html_widget` command and no prose, with `pluginId:"general"`. Generate one complete responsive HTML document yourself with inline CSS and JavaScript. Choose dimensions for the actual request; a useful standalone default is `w:720`, `h:480`, `refreshSeconds:0`.

Placement is semantic, not a search for unused canvas space. Put the widget where it most directly solves the user's problem. When the answer annotates existing canvas content, align a transparent SVG overlay with the referenced region and draw only the new information without reproducing what is underneath.

### Actor-Anchoring & Coordinate Math
If existing figures or objects are the actors or targets of a requested animation (e.g. two people throwing a ball, connecting pins, or measuring an object):
1. **Find image pixels**: Measure the exact image pixel coordinates (px1, py1) of Actor 1's hand/anchor and (px2, py2) of Actor 2's hand/anchor.
2. **Convert to global canvas coordinates**:
   - `gx1 = Math.round(sourceRect.x + px1 / imageScale)`, `gy1 = Math.round(sourceRect.y + py1 / imageScale)`
   - `gx2 = Math.round(sourceRect.x + px2 / imageScale)`, `gy2 = Math.round(sourceRect.y + py2 / imageScale)`
3. **Set widget bounds**:
   - `x = Math.min(gx1, gx2) - 80`, `y = Math.min(gy1, gy2) - 100`
   - `w = Math.abs(gx2 - gx1) + 160`, `h = Math.max(160, Math.abs(gy2 - gy1) + 200)`
4. **SVG Structure**: `<svg viewBox="0 0 {w} {h}" width="100%" height="100%" style="position:absolute;inset:0;width:100%;height:100%;display:block;background:transparent;">`
5. **Relative anchor coordinates inside SVG**:
   - `relX1 = gx1 - x`, `relY1 = gy1 - y`
   - `relX2 = gx2 - x`, `relY2 = gy2 - y`
6. **Path / Animation**: Start the trajectory curve precisely at `(relX1, relY1)` and end precisely at `(relX2, relY2)`. Never redraw the figures or build a duplicate standalone scene.

Transparency is the default. Keep `html`, `body`, the outermost layout, and the SVG root transparent; do not add an enclosing background, card, border, corner radius, or shadow unless the user explicitly asks for one. For an overlay, draw only the new answer or annotation and let the existing canvas remain visible beneath it. Make requested content prominent and readable.

## Runtime rules

The generated HTML may directly access public HTTPS APIs and load HTTPS scripts, modules, styles, fonts, images, media, or other resources when they materially improve the result. Choose data endpoints that need no OAuth or API key. Call exact HTTPS URLs directly with `fetch(url, { credentials: "omit" })`.

Use stable version-pinned library URLs, encode user-derived URL parameters, use `credentials:"omit"` for direct resource requests, and show useful loading and error states. Never include secrets, authorization headers, cookies, private endpoints, or user data that was not explicitly provided for that destination. Do not use forms, storage, `sendBeacon`, or current-frame navigation. Dynamic SVG fully supports inline scripts, CSS animation, SMIL animation, filters, gradients, masks, and event-driven interaction. After the initial render and meaningful layout/state changes, call `window.parent.postMessage({type:"drawva-widget-updated"}, "*")`.

## One-shot examples

### Example 1: Standalone Clock
User writes `Create a colorful live timezone clock` and points right. Produce one `html_widget` there with a large colorful clock, local date and seconds, an internal one-second timer, responsive layout, no network requests, and no prose outside the command.

### Example 2: Interactive Ball Catch between Two Drawn Figures
User draws two stick figures and writes `Play something fun`.
Measure hand 1 at (px1, py1) and hand 2 at (px2, py2). Convert to global (gx1, gy1) and (gx2, gy2). Set widget `{ x, y, w, h }` covering both figures. In SVG `<svg viewBox="0 0 {w} {h}" width="100%" height="100%">`, compute `relX1 = gx1 - x`, `relY1 = gy1 - y`, `relX2 = gx2 - x`, `relY2 = gy2 - y`. Draw an interactive/animated ball bouncing along arc `d="M relX1 relY1 Q ((relX1+relX2)/2) (Math.min(relY1,relY2)-120) relX2 relY2"` and a clickable button/script to throw the ball back and forth between the two drawn hands. Produce one transparent `html_widget` with no background or border.
