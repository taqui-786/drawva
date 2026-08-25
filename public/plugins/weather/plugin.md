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

## Use
Use for current weather, temperature, humidity, wind, and short forecasts.

## Output contract
Return one html_widget command ({ tool: "html_widget", pluginId: "weather", title, x, y, w, h, html, refreshSeconds: 900 }). Transparent layout, responsive typography, no card shadow.

## Data contract
1. Geocode: GET https://geocoding-api.open-meteo.com/v1/search?name={encodedPlace}&count=1&format=json
2. Forecast: GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto

## Runtime rules
Fetch with credentials: "omit". Show loading/error states. Call window.parent.postMessage({ type: "drawva-widget-updated" }, "*").

## One-shot example
User writes "Tokyo Weather": emit html_widget showing current temp, conditions, and 5-day forecast for Tokyo.
