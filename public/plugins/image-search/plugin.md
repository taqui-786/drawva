---
drawva-plugin: 1
id: image-search
name: Show Real Photos Online
version: 1
description: Search Wikimedia Commons and Openverse photos.
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
Return one html_widget command ({ tool: "html_widget", pluginId: "image-search", title, x, y, w, h, html, refreshSeconds: 86400 }). Default to 1 photo unless user requests more (max 5). Do not provide copyText.

## Data contract
- Primary: https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch={query}&gsrlimit={count}&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=1200
- Fallback: https://api.openverse.org/v1/images/?q={query}&page_size={count}

## Runtime rules
Fetch with credentials: "omit". Use crossorigin="anonymous" on images. Call window.parent.postMessage({ type: "drawva-widget-updated" }, "*").

## One-shot example
User writes "photo of Golden Gate Bridge": emit html_widget displaying attributed photo.
