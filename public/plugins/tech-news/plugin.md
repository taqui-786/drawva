---
drawva-plugin: 1
id: tech-news
name: Tech News
version: 1
description: Hacker News front page or recent stories matching a requested technology topic.
category: News
source: Hacker News Algolia
connect:
  - https://hn.algolia.com
recommended-refresh-seconds: 900
---

# Tech News

Use for current technology news, Hacker News headlines, or recent stories on a named tech topic. This source reflects one community and is not a complete or neutral news survey.

## Output contract

Return exactly one `html_widget` command and no prose, with `pluginId:"tech-news"`. Place it at the user's destination, target container, or nearby blank space. Default dimensions on open canvas are `w:720`, `h:480`, `refreshSeconds:900`. When the user specifies an item count (e.g. 3 headlines) or draws a container box, scale `{x, y, w, h}` and render only the requested number of headlines to fit cleanly inside that container without overflowing. Generate the responsive HTML yourself with clear headlines, age, source domain, score, and comments; make the requested topic prominent. Keep the outer layout transparent with no card background, border, or shadow.

## Data contract

For the front page fetch JSON `GET https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=10`. For a topic fetch `GET https://hn.algolia.com/api/v1/search_by_date?query={encodedTopic}&tags=story&hitsPerPage=10`. Response `hits[]` can include `objectID`, `title`, `url`, `author`, `points`, `num_comments`, `created_at`, and `created_at_i`. Filter missing titles and deduplicate. Slice to the user's requested item count when specified. Make every headline a public HTTPS link using `url`, falling back to `https://news.ycombinator.com/item?id={objectID}`, with `target="_blank"` and `rel="noopener noreferrer"`; show its hostname. Display Hacker News/Algolia attribution and label the selected view as community-ranked or newest.

## Runtime rules

Fetch only the declared origin with `credentials:"omit"`. The HTML owns fetching and its timer. Do not use external assets, current-frame navigation, forms, cookies, storage, or secrets. Show loading/error states and last successful update. After every render call `window.parent.postMessage({type:"drawva-widget-updated"}, "*")`.

## One-shot examples

### Example 1: Open Canvas News
User writes `Recent AI news` and points below. Produce one `html_widget` below showing recent AI-related story titles, age, source, score/comments, source caveat, and update time.

### Example 2: Container Box with Item Count
User writes `Recent Tech News (3)`, draws an arrow pointing to a hand-drawn rectangle box, with `<- Any 3`. Measure the drawn rectangle's bounding box `(gx, gy, gw, gh)`, set widget `{x: gx+20, y: gy+20, w: gw-40, h: gh-40}`, fetch stories, slice to exactly 3 items, and layout inside the container with no overflow.
