---
drawva-plugin: 1
id: general
name: General HTML
version: 1
description: Self-contained HTML for SVG drawing, transparent overlays, live visuals, and interactive browser-native experiences.
category: Creative
source: Public HTTPS web
connect:
recommended-refresh-seconds: 60
---

# General HTML

Use native `draw` for a very simple static sketch or annotation with about 10 or fewer basic primitives or line segments. Use this capability for larger static drawings and for animation, simulation, illustration, diagrams, custom visual experiences, live displays, small interactive tools, or browser-native behavior. Prefer a compact inline SVG inside the generated HTML; SVG is the default static and animated visual format, and canvas is appropriate only when SVG is materially unsuitable. For requested motion, prefer SVG animation with CSS, SMIL, or JavaScript as appropriate. Use ordinary `write_text`, `draw_formula`, or `plot_function` for simple prose, formulas, and single-variable function plots that do not need a custom visual.

## Output contract

Return exactly one `html_widget` command and no prose, with `pluginId:"general"`. Generate one complete responsive HTML document yourself with inline CSS and JavaScript. Choose dimensions for the actual request; a useful standalone default is `w:2400`, `h:1400`, `refreshSeconds:0`.

Placement is semantic, not a search for unused canvas space. Put the widget where it most directly solves the user's problem. When the answer annotates existing canvas content, align a transparent SVG overlay with the referenced region and draw only the new information without reproducing what is underneath. If existing figures or objects are the actors or targets of a requested animation (e.g. two people throwing a ball), measure their exact anchor/hand positions from the image, position the transparent widget bounds {x, y, w, h} spanning over those actors, and align the internal SVG viewBox ("0 0 w h") so that paths, trajectories, and animations start and end directly at the relative coordinates of those anchors; never redraw the figures or build a duplicate standalone scene. Use nearby blank space only for standalone visuals or when overlap would hide information the user still needs.

Transparency is the default. Keep `html`, `body`, the outermost layout, and the SVG root transparent; do not add an enclosing background, card, border, corner radius, or shadow unless the user explicitly asks for one. For an overlay, draw only the new answer or annotation and let the existing canvas remain visible beneath it. Make requested content prominent and readable.

## Runtime rules

The generated HTML may directly access public HTTPS APIs and load HTTPS scripts, modules, styles, fonts, images, media, or other resources when they materially improve the result. Choose data endpoints that need no OAuth or API key. Call exact HTTPS URLs directly with `fetch(url, { credentials: "omit" })`.

Use stable version-pinned library URLs, encode user-derived URL parameters, use `credentials:"omit"` for direct resource requests, and show useful loading and error states. Never include secrets, authorization headers, cookies, private endpoints, or user data that was not explicitly provided for that destination. Do not use forms, storage, `sendBeacon`, or current-frame navigation. Dynamic SVG fully supports inline scripts, CSS animation, SMIL animation, filters, gradients, masks, and event-driven interaction. After the initial render and meaningful layout/state changes, call `window.parent.postMessage({type:"drawva-widget-updated"}, "*")`.

## One-shot example

User writes `Create a colorful live timezone clock` and points right. Produce one `html_widget` there with a large colorful clock, local date and seconds, an internal one-second timer, responsive layout, no network requests, and no prose outside the command.
