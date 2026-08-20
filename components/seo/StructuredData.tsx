export function StructuredData() {
  const appSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Drawva",
    "alternateName": "Drawva AI Infinite Canvas",
    "url": "https://drawva.com",
    "description": "An open-source tile-based infinite whiteboard canvas engine powered by a multimodal AI perception agent. Real-time visual ink perception, 7 diagram formats, LaTeX typesetting, and interactive applets.",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "All",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock"
    },
    "author": {
      "@type": "Person",
      "name": "Md Taqui Imam",
      "url": "https://taqui.in"
    },
    "codeRepository": "https://github.com/taqui-786/drawva",
    "license": "https://opensource.org/licenses/MIT",
    "softwareVersion": "3.7.0",
    "featureList": [
      "Infinite 2D Whiteboard Canvas Engine",
      "Multimodal AI Visual Perception Agent",
      "7 Diagram Formats (Mermaid, Graphviz DOT, Vega-Lite, SMILES, BPMN, Cytoscape, GeoJSON)",
      "MathJax LaTeX Formula Rendering",
      "2D Function Plotter",
      "Real-time Local P2P Sync"
    ]
  };

  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "Md Taqui Imam",
    "jobTitle": "Fullstack GenAI Developer",
    "url": "https://taqui.in",
    "sameAs": [
      "https://github.com/taqui-786",
      "https://twitter.com/taqui_imam"
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />
    </>
  );
}
