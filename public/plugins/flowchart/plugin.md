---
drawva-plugin: 1
id: flowchart
name: Professional Diagrams
version: 1
description: Local standalone rendering for Mermaid, Graphviz DOT, Vega-Lite, SMILES chemistry, BPMN XML, Cytoscape, and GeoJSON.
category: Diagram
source: Local SVG & WebAssembly renderers
connect:
recommended-refresh-seconds: 60
---

# Professional Diagrams
Use for flowcharts, sequence/network/architecture diagrams, charts, chemical molecules, BPMN workflows, geographic maps. A request like "Draw user authentication flow" is professional notation, not a freehand doodle.

## Output contract
Prefer `diagram_source` inside `canvas_apply`, `pluginId:"flowchart"`:
| sourceFormat | Use |
|---|---|
| mermaid | flowchart, sequence, class, state, ER, mind maps, Gantt |
| dot | Graphviz architecture/dependency networks |
| vega-lite | statistical/comparative/time-series charts |
| smiles | 2D chemical structures, raw SMILES |
| bpmn-xml | BPMN 2.0 XML workflows |
| cytoscape-json | pathways/node-link networks |
| geojson | geographic features |
Unsupported local formats (PlantUML, DBML, D2, SPICE, KiCad): `html_widget`, same pluginId, complete HTML rendering plus full reusable source in `copyText`, `copyLabel:"Copy <format>"`. Do not claim raw source alone is a rendered diagram.
Ink supplies title: no duplicate title card/node.

## Runtime rules
Complete valid source, transparent layout. Prefer read→patch for surgical edits; full in-place replacement of an EXISTING widget uses targetId, preserves sourceFormat/pluginId. Do not use in_place on new overlays of user ink: executor may erase it.

## One-shot example
`Draw user authentication flow` + arrow → one `diagram_source` at destination with `sourceFormat:"mermaid"`, complete flowchart.
`Export this architecture as D2` → `html_widget` rendering and full D2 copyText, not an unsupported sourceFormat:"d2" command.
