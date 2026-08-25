---
drawva-plugin: 1
id: general
name: General HTML
version: 1
description: Responsive HTML/SVG for drawings, simulations, applets, overlays, and custom UI.
category: Creative
source: Public HTTPS web
connect: []
recommended-refresh-seconds: 60
---

# General HTML

## Use
Use for rich static drawings, 2D animations, interactive simulations, custom visualizations, and live widgets where native primitives are insufficient. Prefer inline SVG for vector art. Use native write_text/draw_formula/plot_function for pure text, equations, and simple math plots.

## Output contract
Return exactly one html_widget command ({ tool: "html_widget", pluginId: "general", x, y, w, h, title, html, refreshSeconds: 0 }). Set transparent outer styling (no background, border, or shadow). SVGs must use width="100%" height="100%" and viewBox="0 0 {w} {h}" tightly framing the graphic.

### Actor Anchoring
When anchoring between drawn actors at image pixels (px1, py1) and (px2, py2):
1. Convert to global: gx = round(sourceRect.x + px / imageScale), gy = round(sourceRect.y + py / imageScale).
2. Set widget bounds: x = min(gx1,gx2)-80, y = min(gy1,gy2)-100, w = abs(gx2-gx1)+160, h = max(160, abs(gy2-gy1)+200).
3. In SVG viewBox="0 0 {w} {h}", local coords are relX = gx - x, relY = gy - y. Connect paths precisely between (relX1, relY1) and (relX2, relY2).

## Data contract
Generated HTML may access public HTTPS endpoints with fetch(url, { credentials: "omit" }). Do not require API keys or private auth.

## Runtime rules
Load third-party HTTPS scripts/fonts/styles only when needed. Do not use cookies, storage, forms, or navigation. Call window.parent.postMessage({ type: "drawva-widget-updated" }, "*") after render.

## One-shot example
User draws two figures and writes "throw ball between them": measure anchor pixels, compute global bounds, and emit one html_widget containing transparent SVG with animated projectile arc connecting the two figures.
