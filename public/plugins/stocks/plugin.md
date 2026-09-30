---
drawva-plugin: 1
id: stocks
name: Stocks
version: 1
description: Stock quote summary, daily candles, volume, and basic valuation fields.
category: Finance
source: Tencent public quote endpoint
connect:
  - https://web.ifzq.gtimg.cn
recommended-refresh-seconds: 60
---

# Stocks
Use for named/coded tickers, quotes, daily charts (e.g. Shanghai/Shenzhen A-shares, Hong Kong, global). The mapping below verifies A-shares only: unsupported markets need a tool-verified source, never an invented Tencent code. Public webpage API, not a contracted investment service; disclose delays/errors, no investment advice.

## Output contract
One `html_widget` in `canvas_apply`, `pluginId:"stocks", refreshSeconds:60`; default 720×480 unless target/maxWidgetSize dictates otherwise. Use arrow/box destination or below ink. Latest price/change, readable daily close/candlestick trend/axes, volume, concise fundamentals dominate. "NVDA daily chart" already supplies a heading. Transparent outer layout, no card background/border/shadow; dark, canvas-scale text.

## Data contract
Shanghai `.SH`, `.SS`, leading 6 → `sh{code}`; Shenzhen `.SZ`, leading 0/3 → `sz{code}`. Famous unambiguous name → known code; ambiguous → request six-digit code, do not guess.
GET https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={marketCode},day,,,60,qfq
Read `data[marketCode]`: `qfqday` (fallback `day`) rows `[date,open,close,high,low,volume]`.
`qt[marketCode]` indices: 1 name, 2 code, 3 latest, 4 previous close, 5 open, 6 volume, 30 quote time, 31 change, 32 change-percent, 33 high, 34 low, 37 amount, 38 turnover-percent, 39 PE, 44 total market value, 45 float market value, 46 PB. Parse numeric strings; missing data is unavailable, never zero by assumption.

## Runtime rules
HTML owns initial fetch/60-second timer. Declared origin only, `credentials:"omit"`, check `response.ok`; source, market-data caveat, loading/empty/error, last successful update. No external assets, navigation, forms, cookies, storage, secrets. After render: `window.parent.postMessage({type:"drawva-widget-updated"},"*")`.

## One-shot example
`sh600519 daily chart` + right arrow → one `html_widget` there: quote/change, 60 daily periods, volume, valuation, source/update time.
`NVDA daily chart` → do not map NVDA to an A-share code; use available stock tools for verified data or clearly report unsupported coverage.
