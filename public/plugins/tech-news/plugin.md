---
drawva-plugin: 1
id: tech-news
name: Tech News
version: 1
description: Hacker News front page and topic-specific tech headlines.
category: News
source: Hacker News Algolia
connect:
  - https://hn.algolia.com
recommended-refresh-seconds: 900
---

# Tech News
Use for current tech news, Hacker News headlines, topic-specific stories.

## Output contract
One `html_widget` inside `canvas_apply`: `pluginId:"tech-news", title, x,y,w,h,html, refreshSeconds:900`; default 720×480, explicit target/size ceiling wins.
"Recent Tech News" ink supplies the title; begin with stories. Match requested count (e.g. 5 items), no overflow. Drawn box: x=box.x+20, y=box.y+20, w=box.w-40, h=box.h-40, `placement:"inside_target"` ON command; never erase frame.
Transparent layout/cards/rows, no shadow. Full-height flex column; each story shares height, never side-by-side in square/portrait boxes. Body 28–34px (about 40px in larger boxes), metadata 24–28px; never desktop 12–16px. Shorten/reflow metadata rather than shrinking type. Proportional padding/gaps, no top-corner cluster. Titles #0f172a/#111827, body #1e293b, metadata #475569; never white/off-white/pale gray on the light board.

## Data contract
| Request | GET |
|---|---|
| Front page | https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=10 |
| Topic | https://hn.algolia.com/api/v1/search_by_date?query={encodedTopic}&tags=story&hitsPerPage=10 |
Read `hits[]`: title, url (fallback https://news.ycombinator.com/item?id={objectID}), points, num_comments, author. Render returned text safely, never as executable HTML. Show fewer rows honestly if insufficient results.

## Runtime rules
HTML owns fetch/900-second timer; declared origin, `credentials:"omit"`, `response.ok`, loading/empty/error states, source/update time. Notify after render: `window.parent.postMessage({type:"drawva-widget-updated"},"*")`.

## One-shot example
"Recent Tech News [5]" → drawn box → measure, inset 20, one `html_widget` with `placement:"inside_target"` and five full-height vertically stacked stories.
"Rust news" → topic endpoint with encoded Rust query, not unrelated front-page results; preserve title ink.
