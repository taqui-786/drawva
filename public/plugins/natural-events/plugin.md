---
drawva-plugin: 1
id: natural-events
name: Natural Events
version: 1
description: Active storms, wildfires, volcanoes, floods, and other natural events.
category: Earth
source: NASA EONET
connect:
  - https://eonet.gsfc.nasa.gov
recommended-refresh-seconds: 900
---

# Natural Events
Use for current worldwide/regional natural events, not emergency instructions.

## Output contract
One `html_widget` in `canvas_apply`, `pluginId:"natural-events", refreshSeconds:900`; default 720×480, target/maxWidgetSize wins. Writing/arrow/box destination or below ink; large event names/category/recency/location in a restrained list/coordinate view. No duplicate topic/question banner; transparent outer layout, no card background/border/shadow.

## Data contract
GET https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=20
Optional `category`, `days`, `start`, `end`, `bbox=minLon,minLat,maxLon,maxLat`.
Read `events[]`: `id`, `title`, `description`, `closed`, `categories[]`, `sources[]`, chronological `geometry[]`. Geometry: `date`, `type`, `coordinates`, optional `magnitudeValue`/`magnitudeUnit`. Use latest geometry for current position; respect its type and label approximate location. Display NASA EONET attribution. Open events are reported activity, not proof of an eruption at this instant; preserve source/date context.

## Runtime rules
HTML owns fetch/900-second timer. Declared origin, `credentials:"omit"`, `response.ok`; loading/empty/error, last successful update. No external assets, navigation, forms, cookies, storage, secrets. After render: `window.parent.postMessage({type:"drawva-widget-updated"},"*")`.

## One-shot example
`What active volcanoes are erupting right now?` + arrow → one `html_widget` at tip listing recent open volcano events, dates, coordinates, NASA EONET attribution.
"Wildfires near this region" → filter by supported category/bbox; no results means none in that response, not proof the region is safe.
