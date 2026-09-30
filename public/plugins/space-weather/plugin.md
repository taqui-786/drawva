---
drawva-plugin: 1
id: space-weather
name: Space Weather
version: 1
description: Planetary Kp index, geomagnetic activity, and a concise aurora signal.
category: Space
source: NOAA SWPC
connect:
  - https://services.swpc.noaa.gov
recommended-refresh-seconds: 300
---

# Space Weather
Use for current geomagnetic conditions, Kp history, broad aurora signal. Never promise visibility or replace local forecasts.

## Output contract
One `html_widget` in `canvas_apply`, `pluginId:"space-weather", refreshSeconds:300`; default 720×480, target/maxWidgetSize wins. Indicated destination or below ink; latest Kp/activity level and large 24-hour trend, not a duplicate question/title banner. Large readable text, transparent outer layout, no card background/border/shadow.

## Data contract
GET https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json
First row = headers; later rows `time_tag`, `Kp`, `a_running`, `station_count`. Parse numeric strings, reject invalid rows, sort chronologically, select latest. Kp below 4 = quiet/unsettled; 4 = active; 5 = G1; 6 = G2; 7 = G3; 8 = G4; 9 = G5. Fractional Kp: use lower threshold reached, not rounding up. Planetary-scale signal: visibility also depends on location, darkness, clouds. NOAA SWPC attribution.

## Runtime rules
HTML owns initial fetch/300-second timer. Declared origin, `credentials:"omit"`, `response.ok`; loading/empty/error, last successful update. No external assets, navigation, forms, cookies, storage, secrets. After render: `window.parent.postMessage({type:"drawva-widget-updated"},"*")`.

## One-shot example
`Is there aurora activity right now?` + downward arrow → one `html_widget` below: latest Kp/activity/trend/caveat, NOAA attribution.
Kp 4.67 → active, not G1; missing data → unavailable, not a synthetic zero/quiet reading.
