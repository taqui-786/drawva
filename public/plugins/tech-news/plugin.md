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
Return one html_widget command ({ tool: "html_widget", pluginId: "tech-news", title, x, y, w, h, html, refreshSeconds: 900 }). Default w:720, h:480. When user draws a container or specifies item count (e.g. 3 items), strictly scale geometry and headlines count to fit without overflow. Treat w/h as whiteboard pixels: never use 12-16px type. Use a full-height flex column, responsive body text around 26-34px for the default size (up to about 40px in larger boxes), metadata at least 20px, and proportional padding/gaps. Let each story row flex to occupy available height so a 3-item result does not cluster in the top corner. Reflow or shorten metadata on narrow boxes rather than shrinking it below readable size.

## Data contract
- Front page: GET https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=10
- Topic: GET https://hn.algolia.com/api/v1/search_by_date?query={encodedTopic}&tags=story&hitsPerPage=10
Read hits[]: title, url (fallback https://news.ycombinator.com/item?id={objectID}), points, num_comments, author.

## Runtime rules
Fetch declared origin with credentials: "omit". Handle loading/error states. Call window.parent.postMessage({ type: "drawva-widget-updated" }, "*").

## One-shot example
User writes "Tech News (3)" pointing to box: emit html_widget inside target box with 3 stories from Hacker News.
