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
Use for explicit real photos/online illustrations.

## Output contract
After loading this contract, sequential steps: `image_search {query,count}` → `canvas_apply` containing one `html_widget` with `pluginId:"image-search",title,x,y,w,h,html,refreshSeconds:86400`. One call per step. Default 1 photo, max 5; embed returned thumbUrl/fullUrl, title/artist attribution, omit copyText. Below subject ink, no duplicate title card; transparent outer layout, no background/shadow.

## Data contract
Resolve ONLY through image_search; if unavailable, report limitation, never fabricate photo URLs. No widget-side photo API fetch: sandbox CORS/anonymous rate limits can leave blank content.
Prefer no `hotlinkRisk`. `<img src="thumbUrl">` links to fullUrl; descriptive alt, `referrerpolicy="no-referrer"`, onerror swaps once to fullUrl, then visible failure caption. Retain artist/license/source attribution from tool results; never invent licensing.

## Runtime rules
Avoid `crossorigin="anonymous"` unless canvas readback requires it; ordinary images load more hosts without CORS. On load/error: `window.parent.postMessage({type:"drawva-widget-updated"},"*")`.

## One-shot example
"photo of Golden Gate Bridge" → image_search first → `html_widget` embedding returned URL and attribution.
Thumbnail and fullUrl both fail → stop retrying and show caption/source link, never leave a blank success or fetch another photo API.
