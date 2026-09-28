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

## Use
Use for current tech news, Hacker News headlines, or topic-specific stories.

## Output contract
Return one html_widget command ({ tool: "html_widget", pluginId: "tech-news", title, x, y, w, h, html, refreshSeconds: 900 }). Default w:720, h:480. When user draws a container or specifies item count (e.g. 5 items), strictly scale geometry and headlines count to fit without overflow. When targeting a drawn container/box, apply a 20px inner margin (x = box.x + 20, y = box.y + 20, w = box.w - 40, h = box.h - 40) and pass placement: "inside_target". Treat w/h as whiteboard pixels: never use 12-16px type. Collaborative ink layout: when user ink states the topic/header (e.g. 'Recent Tech News'), do not duplicate the title as a header card inside the box; flow directly into the news stories. Mandatory high contrast: story titles must be dark slate or black (#0f172a / #111827), body text #1e293b, and metadata solid slate #475569; NEVER use white, off-white, light gray, or colors matching the light playground background. Use a full-height flex column (flex-direction: column; never side-by-side columns in square or portrait boxes), responsive body text around 26-34px for the default size (up to about 40px in larger boxes), metadata at least 20px, and proportional padding/gaps. Let each story row flex to occupy available height so items do not cluster in the top corner. Reflow or shorten metadata on narrow boxes rather than shrinking it below readable size.

## Data contract
- Front page: GET https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=10
- Topic: GET https://hn.algolia.com/api/v1/search_by_date?query={encodedTopic}&tags=story&hitsPerPage=10
Read hits[]: title, url (fallback https://news.ycombinator.com/item?id={objectID}), points, num_comments, author.

## Runtime rules
Fetch declared origin with credentials: "omit". Handle loading/error states. Call window.parent.postMessage({ type: "drawva-widget-updated" }, "*").

## One-shot example
User writes "Recent Tech News [5]" pointing to a drawn box: measure box, apply 20px inner margin, and emit html_widget with placement: "inside_target" containing 5 stories stacked vertically in a full-height flex column.
