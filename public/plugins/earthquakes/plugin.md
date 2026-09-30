---
drawva-plugin: 1
id: earthquakes
name: Global Earthquakes
version: 1
description: Recent earthquake activity, magnitude ranking, and location distribution.
category: Earth
source: USGS
connect:
  - https://earthquake.usgs.gov
recommended-refresh-seconds: 60
---

# Global Earthquakes
Use for recent/strongest earthquakes or regional seismic activity; no predictions or emergency guidance.

## Output contract
One `html_widget` in `canvas_apply`, `pluginId:"earthquakes", refreshSeconds:60`; default 720×480, target/maxWidgetSize wins. At indicated destination or below ink, prioritize strongest/requested event, compact list/coordinate plot, large dark text. "Recent strongest earthquakes" supplies the heading: start with events/coordinates. Transparent, no outer card/background/border/shadow.

## Data contract
GET https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{feed}.geojson
Choose `all_hour`, `all_day` (default), `2.5_day`, or `4.5_week` for requested period/magnitude. Read `metadata.generated`; feature `properties.mag`, `place`, `time`, `updated`, `tsunami`, `felt`, `type`; `geometry.coordinates` = longitude, latitude, depth-km. Filter/sort in browser; rank numeric magnitudes, not strings. Attribute USGS, label preliminary data and chosen feed coverage; missing magnitude is unknown.

## Runtime rules
HTML owns fetch/60-second timer; declared origin only, `credentials:"omit"`, `response.ok`, loading/empty/error, last successful update. No external assets, navigation, forms, cookies, storage, secrets. After render: `window.parent.postMessage({type:"drawva-widget-updated"},"*")`.

## One-shot example
`Recent strongest earthquakes` + right arrow → one `html_widget` there: strongest event, runners-up, time/depth/location, USGS attribution.
"Earthquakes in the last hour" → `all_hour`; if no events, show an empty result for that period, not invented events or silently broader coverage.
