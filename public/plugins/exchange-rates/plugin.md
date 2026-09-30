---
drawva-plugin: 1
id: exchange-rates
name: Exchange Rates
version: 1
description: Current reference exchange rates, conversion, and a recent historical trend.
category: Finance
source: Frankfurter
connect:
  - https://api.frankfurter.dev
recommended-refresh-seconds: 86400
---

# Exchange Rates
Use for fiat conversion, reference rates, daily trends—not executable bank quotes.

## Output contract
One `html_widget` in `canvas_apply`, `pluginId:"exchange-rates", refreshSeconds:86400`; default 720×480, target/maxWidgetSize wins. Requested destination or below ink; dominant converted amount/rate, explicit units, large trend if requested. "Convert 100 USD to EUR" needs no repeated banner. Transparent outer layout, no card background/border/shadow.

## Data contract
| Purpose | GET |
|---|---|
| Latest | https://api.frankfurter.dev/v1/latest?base={BASE}&symbols={QUOTE1,QUOTE2} |
| History | https://api.frankfurter.dev/v1/{start}..{end}?base={BASE}&symbols={QUOTE} |
Latest fields: `amount`, `base`, `date`, `rates`; history `rates` keyed by ISO date. Uppercase ISO 4217 codes; compute conversion in browser from returned rate/amount. Rates update on business days: weekends/holidays may retain a prior date. Display data date and Frankfurter attribution, distinct from fetch time.

## Runtime rules
HTML owns fetch/daily timer. Declared origin, `credentials:"omit"`, `response.ok`; loading/empty/error, last successful update. No external assets, navigation, forms, cookies, storage, secrets. After render: `window.parent.postMessage({type:"drawva-widget-updated"},"*")`.

## One-shot example
`Convert 100 USD to EUR` + downward arrow → one `html_widget` below with USD/EUR rate, converted amount, data date, Frankfurter attribution.
"USD to EUR this weekend" → show returned business-day date, never relabel the rate as today's live bank quote.
