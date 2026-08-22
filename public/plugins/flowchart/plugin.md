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

Use whenever the user requests flowcharts, sequence diagrams, network topologies, architecture diagrams, charts, chemical molecular structures, BPMN business workflows, or geographic maps.

## Output contract

Prefer returning `diagram_source` with `pluginId:"flowchart"` when one of the 7 built-in formats fits:
- `mermaid`: flowcharts, sequence, class, state, ER, mind maps, Gantt.
- `dot`: Graphviz DOT architecture and dependency networks.
- `vega-lite`: statistical, comparative, and time-series charts.
- `smiles`: 2D chemical molecular structures (raw SMILES string).
- `bpmn-xml`: business process workflows (BPMN 2.0 XML).
- `cytoscape-json`: pathways and node-link networks.
- `geojson`: geographical map features.

For formats not directly rendered locally (PlantUML, DBML, D2, SPICE, KiCad), return `html_widget` with `pluginId:"flowchart"`, complete HTML rendering, and full reusable source in `copyText` with `copyLabel:"Copy <format>"`.

## Runtime rules

Diagram source must be complete and valid. Keep layouts transparent. For in-place editing (`placement:"in_place"`), return one complete replacement preserving the format and pluginId.

## One-shot example

User writes `Draw user authentication flow` with an arrow. Return one `diagram_source` command with `sourceFormat:"mermaid"` containing the complete flowchart.
