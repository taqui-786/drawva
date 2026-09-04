---
drawva-plugin: 1
id: image-search
name: Show Real Photos Online
version: 2
description: Resolve openly-licensed photos server-side, then display them.
category: Media
source: Wikimedia Commons + Openverse
connect:
  - https://commons.wikimedia.org
  - https://upload.wikimedia.org
  - https://api.openverse.org
recommended-refresh-seconds: 86400
---

# Show Real Photos Online

## Use
Use when the user explicitly requests real photos or online illustrations.

## Output contract
Two steps, one tool call per step. Step 1: call `image_search` with `{ query, count }`. Step 2: return one html_widget command ({ tool: "html_widget", pluginId: "image-search", title, x, y, w, h, html, refreshSeconds: 86400 }) embedding the returned `thumbUrl`/`fullUrl` directly in `<img>` tags with title + artist attribution. Default to 1 photo unless user requests more (max 5). Do not provide copyText.

## Data contract
- Resolve URLs with the `image_search` tool only. Never fetch a photo API from inside widget HTML/JS: the sandboxed iframe has no same-origin access, third-party CORS and anonymous rate limits fail there, and the board renders blank.
- Prefer results without `hotlinkRisk`. Render `<img src="thumbUrl">` linking to `fullUrl`, with `referrerpolicy="no-referrer"`, a descriptive `alt`, an `onerror` fallback that swaps to `fullUrl` once, and a visible text caption so the answer reads even if the host is down.

## Runtime rules
Do not use `crossorigin="anonymous"` on images unless you need canvas readback; plain `<img>` without CORS loads more hosts. Call window.parent.postMessage({ type: "drawva-widget-updated" }, "*") after load and after error.

## One-shot example
User writes "photo of Golden Gate Bridge": call image_search first, then emit html_widget with the returned photo URL and attribution.
