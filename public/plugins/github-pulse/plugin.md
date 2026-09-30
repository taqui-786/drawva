---
drawva-plugin: 1
id: github-pulse
name: GitHub Pulse
version: 1
description: Repository stars, forks, issues, release, language, and recent activity.
category: Developer
source: GitHub REST API
connect:
  - https://api.github.com
recommended-refresh-seconds: 600
---

# GitHub Pulse
Use for public `owner/repo` status/popularity. Never request/embed a token.

## Output contract
One `html_widget` in `canvas_apply`, `pluginId:"github-pulse", refreshSeconds:600`; default 720×480, target/maxWidgetSize wins. Indicated destination or below ink; large stars/freshness, concise secondary stats. Repository/query ink supplies title. Transparent outer layout, no card background/border/shadow.

## Data contract
GET https://api.github.com/repos/{owner}/{repo}
Fields: `full_name`, `description`, `stargazers_count`, `forks_count`, `open_issues_count`, `subscribers_count`, `language`, `license.spdx_id`, `topics`, `created_at`, `updated_at`, `pushed_at`, `archived`, `default_branch`.
Optional GET https://api.github.com/repos/{owner}/{repo}/releases/latest; 404 = no release (not repository failure). Anonymous quota: 60 requests/IP/hour; no more than these TWO requests per refresh. GitHub attribution; remaining quota from headers when available. Missing license/language/release is unavailable, never invented.

## Runtime rules
HTML owns fetch/600-second timer. Declared origin, `credentials:"omit"`, `response.ok`; loading/empty/error, last successful update. No external assets, navigation, forms, cookies, storage, Authorization headers, secrets. On quota exhaustion show state/reset time if available; no rapid retries. After render: `window.parent.postMessage({type:"drawva-widget-updated"},"*")`.

## One-shot example
`vercel/next.js project stats` + right arrow → one `html_widget` there: summary/stars/forks/issues/language/latest activity/release, GitHub attribution.
Repository succeeds but latest release is 404 → retain repository stats, show "No published release"; do not fail the entire widget.
