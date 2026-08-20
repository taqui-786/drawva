import assert from "node:assert/strict";
import { diagramDocument } from "./diagram";

async function main() {
const aspirin = await diagramDocument(
  "smiles",
  "CC(=O)Oc1ccccc1C(=O)O",
  undefined,
  "Aspirin"
);

assert.equal(aspirin.width, 440);
assert.equal(aspirin.height, 320);
assert.match(aspirin.html, /smiles-drawer@2\.1\.7\/dist\/smiles-drawer\.min\.js/, "SMILES must load the UMD build, not the broken +esm module");
assert.doesNotMatch(aspirin.html, /smiles-drawer@2\.1\.7\/\+esm/);
assert.match(aspirin.html, /timed out/, "iframe runtime must fail closed instead of hanging on Rendering…");
assert.match(aspirin.html, /unpkg\.com/, "jsDelivr failures fall back to unpkg");
assert.match(aspirin.html, /CC\(=O\)Oc1ccccc1C\(=O\)O/);
assert.doesNotMatch(aspirin.html, /: any\[\]/, "generated iframe JS must be real JavaScript, not TypeScript");

const vega = await diagramDocument(
  "vega-lite",
  JSON.stringify({
    mark: "bar",
    data: { values: [{ a: "A", b: 1 }] },
    encoding: { x: { field: "a", type: "nominal" }, y: { field: "b", type: "quantitative" } },
  }),
  undefined,
  "Bars"
);
assert.match(vega.html, /vega-embed@6\.26\.0\/build\/vega-embed\.min\.js/);
assert.doesNotMatch(vega.html, /vega@5\.30\.0\/\+esm/);
assert.doesNotMatch(vega.html, /: any\[\]/);
assert.match(vega.html, /could not be rendered/);

const mermaid = await diagramDocument("mermaid", "flowchart LR\nA-->B", undefined, "Flow");
assert.ok(mermaid.html.includes("svg") || mermaid.html.includes("mermaid@10.9.1/dist/mermaid.min.js"));
assert.doesNotMatch(mermaid.html, /type="module"/, "iframe fallback must not depend on sandboxed ESM imports");

console.log("diagram.test.ts: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
