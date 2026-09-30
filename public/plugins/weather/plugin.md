---
drawva-plugin: 1
id: weather
name: Weather
version: 1
description: Current conditions and five-day forecast for named locations.
category: Environment
source: Open-Meteo
connect:
  - https://geocoding-api.open-meteo.com
  - https://api.open-meteo.com
recommended-refresh-seconds: 900
---

# Weather
Use for current weather, temperature, humidity, wind, short forecasts.

## Output contract
One `html_widget` command inside `canvas_apply`: `pluginId:"weather", title, x,y,w,h,html, refreshSeconds:900`. Start with temperature/conditions and 5-day forecast; no duplicate "Ranchi" banner for "Todays weather of Ranchi". Secondary metadata example: "Jharkhand · Updated 12:00 PM" (use actual region/time).
Transparent containers/cards/forecast columns (`background:transparent !important`), dark readable type, clean borders, no shadows or #fff/#ffffff/#f1f5f9 fills.
Preserve partitioned ink: top = temperature/icon/condition/local time; bottom-left = Humidity/Feels Like/Wind; bottom-right = forecast/outlook. Match compartments, no outer borders, 20-unit inset, `placement:"inside_target"`; leave 35–40 units below handwritten title. Stack portrait content vertically. Show Feels Like only if returned; never substitute temperature silently.

## Data contract
1. GET https://geocoding-api.open-meteo.com/v1/search?name={encodedPlace}&count=1&format=json → `results[0]` latitude/longitude/name/timezone. Empty results → location not found, no invented coordinates.
2. GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto
Read `current`, `current_units`, `daily.time` and matching daily arrays; take five days. Use returned units/timezone and weather-code conditions, not guessed units/local device time.

## Runtime rules
HTML owns initial fetch/900-second refresh. Declared origins only, `credentials:"omit"`; check `response.ok`, loading/empty/error states, source/data time. After render: `window.parent.postMessage({type:"drawva-widget-updated"},"*")`.

## One-shot example
"Tokyo Weather" → `html_widget` with Tokyo current temp, conditions, 5-day forecast below ink.
"Weather" in a top-header/two-column sketch → same data in matching transparent compartments; preserve every divider, no duplicate heading or erase.
