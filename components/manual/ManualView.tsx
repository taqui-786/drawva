"use client";

import Image from "next/image";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  GithubIcon,
  SparklesIcon,
  EyeIcon,
  Shield02Icon,
  PeerToPeer01Icon,
  Analytics01Icon,
  Link01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const NAV_GROUPS: { group: string; items: { id: string; label: string }[] }[] = [
  {
    group: "Overview",
    items: [
      { id: "introduction", label: "Introduction" },
      { id: "quick-start", label: "Quick Start" },
    ],
  },
  {
    group: "Canvas",
    items: [
      { id: "tools", label: "Tools & Shortcuts" },
      { id: "saving", label: "Saving & Export" },
    ],
  },
  {
    group: "AI",
    items: [
      { id: "providers", label: "Provider Setup" },
      { id: "local-models", label: "Local Models (Ollama)" },
      { id: "modes", label: "Generation Modes" },
      { id: "plugins", label: "Capability Plugins" },
      { id: "usage", label: "Token Usage" },
    ],
  },
  {
    group: "Collaboration",
    items: [{ id: "p2p", label: "Live P2P Sync" }],
  },
  {
    group: "Reference",
    items: [
      { id: "formats", label: "Diagram Formats" },
      { id: "faq", label: "FAQ" },
    ],
  },
];

const TOOLS = [
  { name: "Select", key: "V", desc: "Click to select an ink cluster, drag a marquee on empty canvas, then move, lift, or erase the selection." },
  { name: "Hand", key: "H", desc: "Pan around the infinite canvas. Middle-mouse drag pans from any tool." },
  { name: "Pen", key: "P", desc: "Draw smooth vector ink strokes. The primary way to sketch ideas for the AI to perceive." },
  { name: "Highlighter", key: "Shift+H", desc: "Semi-transparent marker strokes for emphasizing existing ink." },
  { name: "Eraser", key: "E", desc: "Precision stroke eraser — removes whole intersecting strokes." },
  { name: "Text", key: "T", desc: "Insert an editable text box. Double-click existing text to edit." },
  { name: "Rectangle", key: "R", desc: "Draw a vector rectangle shape." },
  { name: "Ellipse", key: "O", desc: "Draw a vector ellipse shape." },
  { name: "Arrow", key: "A", desc: "Draw a directed arrow — great for pointing at things you want the AI to act on." },
];

const SHORTCUTS = [
  { keys: ["Ctrl", "Z"], desc: "Undo" },
  { keys: ["Ctrl", "Shift", "Z"], desc: "Redo (also Ctrl+Y)" },
  { keys: ["Delete"], desc: "Delete active marquee selection or selected object/widget" },
  { keys: ["Esc"], desc: "Clear selection / close text editor" },
  { keys: ["Scroll"], desc: "Pan the canvas" },
  { keys: ["Ctrl", "Scroll"], desc: "Zoom (also trackpad pinch)" },
  { keys: ["Middle-drag"], desc: "Pan from any tool" },
  { keys: ["Pinch"], desc: "Touch: two-finger pinch to zoom & pan" },
];

const PROVIDERS = [
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1", models: "gpt-4o, gpt-4o-mini, gpt-4-turbo", keyUrl: "platform.openai.com/api-keys" },
  { name: "Anthropic", baseUrl: "https://api.anthropic.com", models: "claude-3-7-sonnet, claude-3-5-sonnet, claude-3-opus", keyUrl: "console.anthropic.com/settings/keys" },
  { name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", models: "gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash", keyUrl: "aistudio.google.com/app/apikey" },
  { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", models: "llama-3.2-11b/90b-vision-preview, llama-3.3-70b-versatile", keyUrl: "console.groq.com/keys" },
  { name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", models: "meta/llama-3.2-vision-instruct, mistralai/pixtral-12b", keyUrl: "build.nvidia.com" },
  { name: "Custom Endpoint", baseUrl: "any OpenAI-compatible URL", models: "anything served at that endpoint", keyUrl: "openrouter.ai/keys (for OpenRouter)" },
];

const PRESETS = [
  { name: "Ollama Local", baseUrl: "http://localhost:11434/v1", note: "Local open-source models. Ships with LLaVA and Llama 3.2 Vision model IDs pre-registered." },
  { name: "LM Studio", baseUrl: "http://localhost:1234/v1", note: "Uses whatever model is currently loaded in LM Studio's local server." },
  { name: "OpenRouter Gateway", baseUrl: "https://openrouter.ai/api/v1", note: "One key, hundreds of models. Vision-capable models are auto-filtered when listed." },
  { name: "AgentRouter Gateway", baseUrl: "https://agentrouter.org/v1", note: "Gateway router with frontier model IDs pre-registered." },
];

const FORMATS = [
  { name: "Mermaid", source: "mermaid.mjs", use: "Flowcharts, sequence diagrams, gantt charts" },
  { name: "Graphviz DOT", source: "@viz-js (WASM)", use: "Dependency graphs, trees, network layouts" },
  { name: "Vega-Lite", source: "vega-embed", use: "Statistical charts, bar/line/area graphs" },
  { name: "SMILES", source: "openchemlib", use: "Chemical molecular structures" },
  { name: "BPMN XML", source: "bpmn-viewer", use: "Business process workflow diagrams" },
  { name: "Cytoscape JSON", source: "cytoscape", use: "Interactive network & relationship graphs" },
  { name: "GeoJSON", source: "leaflet", use: "Geographic and spatial maps" },
  { name: "LaTeX", source: "MathJax", use: "Typeset math formulas via draw_formula" },
  { name: "Function Plot", source: "built-in evaluator", use: "2D graphs of math expressions via plot_function" },
  { name: "HTML Applet", source: "sandboxed iframe", use: "Rich interactive widgets, live-data dashboards" },
];

const FAQS = [
  {
    q: "Where are my API keys stored?",
    a: "Only in your browser's localStorage. Keys are never logged, never persisted server-side, and never leave your machine except to call the provider you configured. Canvas AI requests go directly from your browser to your provider; the server only helps fetch the model list when you press Connect.",
  },
  {
    q: "Which model should I pick?",
    a: "Any vision-capable (multimodal) model. Drawva photographs your canvas and sends the image with every request, so text-only models cannot perceive your ink. If your provider declares vision capabilities (like OpenRouter), the Connect flow filters the model list automatically.",
  },
  {
    q: "The AI replied but nothing was drawn. Why?",
    a: "Every AI command passes strict validators: allowed-tools checks against your enabled plugins, coordinate clamping, size limits, and placement rules. Failed commands are dropped. Open Menu → AI Request Logs to see the exact rejection reason, then try sketching a clearer intent.",
  },
  {
    q: "Does P2P sync send my canvas through a server?",
    a: "No. PeerJS uses a public broker only for the initial handshake. All canvas traffic — strokes, tiles, widgets — flows peer-to-peer over WebRTC data channels. Nothing is stored in the cloud.",
  },
  {
    q: "What does disabling a plugin do?",
    a: "Disabled plugins are removed from the AI's prompt, so the model never sees them. Even if it tries, the validator drops commands using disabled plugins. Widgets already on your canvas stay untouched. Fewer plugins means a smaller, faster, cheaper prompt.",
  },
  {
    q: "Is Drawva free?",
    a: "The app is 100% free and open source (MIT). You only pay your own model provider for API usage — the built-in Usage tab shows exactly how many tokens each request consumed.",
  },
  {
    q: "How big is the canvas?",
    a: "Effectively infinite within a 20,000 x 20,000 world, with zoom from 0.03x to 4x. Rendering is tile-cached (512px tiles), so even dense boards stay smooth.",
  },
];

function Kbd({ children }: { children: string }) {
  return <span className="kbd">{children}</span>;
}

function InlineCode({ children }: { children: string }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8em] text-foreground">
      {children}
    </code>
  );
}

function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex flex-col gap-5 scroll-mt-24">
      <div className="flex flex-col gap-2">
        <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wider font-mono">
          {eyebrow}
        </Badge>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {lead && <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

function MenuPath({ path }: { path: string }) {
  return (
    <Badge variant="secondary" className="w-fit font-mono text-[11px] gap-1.5">
      {path}
    </Badge>
  );
}

export function ManualView() {
  return (
    <div className="min-h-dvh bg-background text-foreground font-body selection:bg-primary/20 selection:text-primary">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Drawva home">
              <span className="brand-wordmark text-xl font-bold tracking-wider text-primary">Drawva</span>
            </Link>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
              User Manual
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" render={<a href="https://github.com/taqui-786/drawva" target="_blank" rel="noopener noreferrer" />}>
              <HugeiconsIcon icon={GithubIcon} data-icon="true" />
              <span className="hidden sm:inline">GitHub</span>
            </Button>
            <Button size="sm" className="gap-1.5 text-xs rounded-full" render={<Link href="/canvas" />}>
              <HugeiconsIcon icon={SparklesIcon} data-icon="true" />
              <span>Launch Canvas</span>
            </Button>
          </div>
        </nav>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[210px_1fr] lg:px-8">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 flex flex-col gap-6 text-sm">
            {NAV_GROUPS.map((g) => (
              <div key={g.group} className="flex flex-col gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                  {g.group}
                </span>
                <div className="flex flex-col gap-1 border-l border-border pl-3">
                  {g.items.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className="rounded-sm py-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="flex min-w-0 max-w-3xl flex-col gap-16">
          {/* ── Introduction ─────────────────────────────────────────── */}
          <Section
            id="introduction"
            eyebrow="Overview"
            title="The AI infinite canvas"
            lead="Drawva is a tile-based infinite whiteboard engine powered by a multimodal AI perception agent. You sketch freely; Drawva photographs the canvas, understands your intent, and renders professional diagrams, formulas, charts, and interactive applets directly below your ink."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardContent className="flex flex-col gap-1">
                  <CardTitle className="text-sm">Draw anything</CardTitle>
                  <CardDescription className="text-xs">
                    Vector ink, text, shapes, and formulas on an infinite 2D space.
                  </CardDescription>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex flex-col gap-1">
                  <CardTitle className="text-sm">AI perceives it</CardTitle>
                  <CardDescription className="text-xs">
                    A multimodal agent reads a live snapshot plus scene context of your ink.
                  </CardDescription>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex flex-col gap-1">
                  <CardTitle className="text-sm">Pro visuals appear</CardTitle>
                  <CardDescription className="text-xs">
                    7 diagram formats, LaTeX math, function plots, and live-data applets.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">How the AI loop works</CardTitle>
                <CardDescription>
                  One pipeline, every request. The AI can only <em>request</em> changes — strict validators decide what actually draws.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  {["Draw", "Snapshot", "Prompt build", "Model picks tools", "Validators", "Render"].map((step, i, arr) => (
                    <span key={step} className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {i + 1}. {step}
                      </Badge>
                      {i < arr.length - 1 && <span aria-hidden>→</span>}
                    </span>
                  ))}
                </div>
                <p className="leading-relaxed">
                  Drawva captures a WebP photo of your viewport (max 2048px) plus a compact JSON scene — ink bounds, widgets, objects. The model receives both and replies with structured commands (<InlineCode>write_text</InlineCode>, <InlineCode>draw_formula</InlineCode>, <InlineCode>diagram_source</InlineCode>, <InlineCode>html_widget</InlineCode>…). Every command is validated — allowed tools, coordinate clamps, size caps — then rendered anchored below your newest ink.
                </p>
              </CardContent>
            </Card>
          </Section>

          {/* ── Quick Start ──────────────────────────────────────────── */}
          <Section
            id="quick-start"
            eyebrow="Overview"
            title="Quick start"
            lead="From blank board to your first AI-generated diagram in under a minute."
          >
            <ol className="flex flex-col gap-3">
              {[
                <>Open the <Link href="/canvas" className="font-medium text-foreground underline underline-offset-4">canvas</Link>. Your board autosaves locally — no account needed.</>,
                <>Press the <strong>Menu</strong> button → <strong>AI Settings &amp; Keys</strong>, pick a provider, paste your API key, and hit <strong>Connect</strong> (or apply a local preset — see <a href="#providers" className="font-medium text-foreground underline underline-offset-4">Provider Setup</a>).</>,
                <>Pick a vision model from the model selector in the header.</>,
                <>Sketch something with the <Kbd>P</Kbd> pen — a rough flowchart, a formula, or the words <em>&quot;plot sin(x)&quot;</em>.</>,
                <>Toggle <strong>Auto AI</strong> on, or press <strong>Ask AI</strong>. The result renders as a widget just below your ink.</>,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 rounded-lg border bg-card/60 p-3 text-sm">
                  <Badge variant="secondary" className="shrink-0 font-mono">
                    {i + 1}
                  </Badge>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </Section>

          <Separator />

          {/* ── Tools ────────────────────────────────────────────────── */}
          <Section
            id="tools"
            eyebrow="Canvas"
            title="Tools & shortcuts"
            lead="Nine tools live in the header toolbar. Every one has a single-key shortcut; the color palette and stroke-width picker sit right beside them."
          >
            <Card>
              <CardContent className="pt-0 pb-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Tool</TableHead>
                      <TableHead className="w-24">Key</TableHead>
                      <TableHead>What it does</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {TOOLS.map((t) => (
                      <TableRow key={t.name}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell><Kbd>{t.key}</Kbd></TableCell>
                        <TableCell className="text-muted-foreground">{t.desc}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">General shortcuts & gestures</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-48">Keys / Gesture</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {SHORTCUTS.map((s) => (
                      <TableRow key={s.desc}>
                        <TableCell>
                          <span className="flex flex-wrap items-center gap-1">
                            {s.keys.map((k) => (
                              <Kbd key={k}>{k}</Kbd>
                            ))}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{s.desc}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Section>

          {/* ── Saving ───────────────────────────────────────────────── */}
          <Section
            id="saving"
            eyebrow="Canvas"
            title="Saving & export"
            lead="Drawva is local-first. Everything you draw is autosaved to your browser; nothing ever touches a server."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Autosave</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground leading-relaxed">
                  Every edit is debounced into IndexedDB (<InlineCode>drawva-canvas-db</InlineCode>). Close the tab, come back tomorrow — your board is exactly where you left it.
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Export PNG</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground leading-relaxed">
                  Menu → <strong>Export PNG</strong>. Renders your board to a crisp image file, widgets included.
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">JSON Project</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground leading-relaxed">
                  Menu → <strong>Save JSON Project</strong> for a portable full backup, then <strong>Open JSON Project…</strong> on any device to restore it.
                </CardContent>
              </Card>
            </div>
          </Section>

          <Separator />

          {/* ── Provider Setup ───────────────────────────────────────── */}
          <Section
            id="providers"
            eyebrow="AI"
            title="AI provider setup"
            lead="Drawva is bring-your-own-key. Any OpenAI-compatible endpoint works — cloud APIs, gateways like OpenRouter, or fully local servers. Configure everything in the AI Settings dialog."
          >
            <MenuPath path="Menu → AI Settings & Keys → Provider tab" />

            <Alert>
              <HugeiconsIcon icon={EyeIcon} />
              <AlertTitle>A vision-capable model is required</AlertTitle>
              <AlertDescription>
                Drawva sends a photograph of your canvas with every request. Text-only models cannot perceive your ink. Pick a multimodal model (e.g. <InlineCode>gpt-4o</InlineCode>, <InlineCode>claude-3-5-sonnet</InlineCode>, <InlineCode>gemini-2.5-flash</InlineCode>, <InlineCode>llama3.2-vision</InlineCode>, <InlineCode>qwen2.5-vl</InlineCode>).
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Connect a cloud provider</CardTitle>
                <CardDescription>Three steps, then you are done.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
                  <li>In the <strong>Provider tab</strong>, choose a provider card — the correct Base URL is prefilled.</li>
                  <li>Paste your API key. The <em>Get API key</em> link jumps straight to the provider&apos;s key console.</li>
                  <li>Press <strong>Connect</strong>. Drawva verifies the key against the endpoint, lists the available vision models, and auto-selects the first one.</li>
                </ol>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Switch models anytime via <MenuPath path="Menu → Select AI Model" /> or the Settings → Models tab. Reasoning-capable models additionally expose a reasoning-effort control (Auto / Low / Medium / High / Max).
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Supported providers</CardTitle>
                <CardDescription>Built-in presets with prefilled endpoints and default vision models.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 pb-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead className="hidden md:table-cell">Default Base URL</TableHead>
                      <TableHead className="hidden sm:table-cell">Default models</TableHead>
                      <TableHead>Get a key</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PROVIDERS.map((p) => (
                      <TableRow key={p.name}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">{p.baseUrl}</TableCell>
                        <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">{p.models}</TableCell>
                        <TableCell className="font-mono text-xs">{p.keyUrl}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Alert>
              <HugeiconsIcon icon={Shield02Icon} />
              <AlertTitle>Your key never leaves your browser</AlertTitle>
              <AlertDescription>
                Credentials are stored only in this browser&apos;s localStorage. Canvas requests go directly from your browser to the provider. The server is involved only when you press <strong>Connect</strong>, to fetch the model list — keys are never logged or persisted there.
              </AlertDescription>
            </Alert>
          </Section>

          {/* ── Local Models ─────────────────────────────────────────── */}
          <Section
            id="local-models"
            eyebrow="AI"
            title="Local models: Ollama, LM Studio & gateways"
            lead="Run the AI entirely on your own hardware, or route through a model gateway. One-click presets live in the Models tab."
          >
            <MenuPath path="Menu → AI Settings & Keys → Models tab → Local & Gateway Presets" />

            <div className="grid gap-3 sm:grid-cols-2">
              {PRESETS.map((p) => (
                <Card key={p.name}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{p.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">{p.baseUrl}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground leading-relaxed">
                    {p.note}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ollama walkthrough</CardTitle>
                <CardDescription>Fully offline, fully private canvas AI.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 text-sm">
                  <p className="text-muted-foreground">Pull a vision model and keep the server running:</p>
                  <pre className="overflow-x-auto rounded-lg border bg-muted/60 p-3 font-mono text-xs leading-relaxed">
{`ollama pull llava          # or: llama3.2-vision, qwen2.5vl
ollama serve               # default port 11434`}
                  </pre>
                  <p className="text-muted-foreground">
                    Then in Drawva, either press the <strong>Ollama Local</strong> preset button, or pick <strong>Custom Endpoint</strong> in the Provider tab with Base URL <InlineCode>http://localhost:11434/v1</InlineCode>, any API key (e.g. <InlineCode>ollama</InlineCode>), and press <strong>Connect</strong>.
                  </p>
                </div>
                <Alert>
                  <AlertTitle>Serving from another machine?</AlertTitle>
                  <AlertDescription>
                    Set <InlineCode>OLLAMA_HOST=0.0.0.0</InlineCode> when starting Ollama, allow port 11434, and point Drawva at <InlineCode>http://&lt;machine-ip&gt;:11434/v1</InlineCode>. Note that your canvas snapshot is sent over your local network in that setup.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Custom model IDs</CardTitle>
                <CardDescription>
                  For self-hosted endpoints that don&apos;t implement the /models listing.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground leading-relaxed">
                In the <strong>Models tab → Custom Models</strong>, add any model ID manually (e.g. <InlineCode>qwen2.5-vl</InlineCode>) with a friendly label. It appears in the model selector immediately — no Connect step needed. Remove the ones you don&apos;t want with the trash button.
              </CardContent>
            </Card>
          </Section>

          {/* ── Generation Modes ─────────────────────────────────────── */}
          <Section
            id="modes"
            eyebrow="AI"
            title="Generation modes"
            lead="Two ways to invoke the perception agent: automatically while you sketch, or on demand."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Auto-Delay Mode</CardTitle>
                    <Badge variant="default" className="font-mono text-[10px]">Auto toggle ON</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-center justify-center rounded-lg border bg-background/80 p-2">
                    <Image src="/manual/auto-toggle.png" alt="Auto AI toggle" width={142} height={61} className="h-9 w-auto object-contain" />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    With <strong>Auto AI</strong> on, Drawva perceives your canvas automatically ~1.5s after you finish drawing. Ideal for continuous live sketching.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">On-Demand Mode</CardTitle>
                    <Badge variant="secondary" className="font-mono text-[10px]">Ask AI button</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-center justify-center rounded-lg border bg-background/80 p-2">
                    <Image src="/manual/ask-ai-button.png" alt="Ask AI button" width={225} height={92} className="h-9 w-auto object-contain" />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Auto is <strong>off by default</strong>, so you can sketch without interruptions. Whenever you want analysis, press <strong>Ask AI</strong>.
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Working with generated widgets</CardTitle>
                <CardDescription>AI output lands on the canvas as an interactive widget.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { title: "Accept or discard", desc: "New widgets start as drafts with an action bar. Keep them with the check, drop them with the cross." },
                    { title: "Fullscreen & resize", desc: "Expand to fullscreen or drag the corner to resize — content reflows automatically." },
                    { title: "Copy source", desc: "Grab the clean source (Mermaid code, Vega-Lite JSON, HTML…) with one click." },
                    { title: "Refine by drawing", desc: "Draw or write near a widget and hit Ask AI — the agent reads it and updates that widget in place." },
                  ].map((item) => (
                    <div key={item.title} className="flex flex-col gap-1 rounded-lg border bg-card/60 p-3">
                      <span className="text-xs font-semibold">{item.title}</span>
                      <span className="text-xs text-muted-foreground leading-relaxed">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Section>

          {/* ── Plugins ──────────────────────────────────────────────── */}
          <Section
            id="plugins"
            eyebrow="AI"
            title="Capability plugins"
            lead="Plugins are markdown capability cards that teach the AI new tricks — live weather, stock tickers, earthquake feeds, image search, and more. Eleven ship out of the box."
          >
            <MenuPath path="Menu → AI Settings & Keys → Plugins tab" />
            <Card>
              <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>
                  Each plugin card shows its category, version, source, and the live endpoints it may call. Toggle any card <strong>ON</strong> or <strong>OFF</strong> — changes apply to the very next generation.
                </p>
                <p>
                  Disabling a plugin removes it from the AI&apos;s prompt entirely, and the safety validator drops any command that still tries to use it. Widgets already on your canvas are unaffected. Fewer enabled plugins = a smaller, faster, cheaper prompt.
                </p>
                <p className="text-xs">
                  Bundled: general, flowchart, weather, stocks, earthquakes, exchange-rates, github-pulse, image-search, natural-events, space-weather, tech-news.
                </p>
              </CardContent>
            </Card>
          </Section>

          {/* ── Token Usage ──────────────────────────────────────────── */}
          <Section
            id="usage"
            eyebrow="AI"
            title="Token usage"
            lead="Every AI request reports its token consumption, and Drawva keeps a local audit trail so you always know what a session costs."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <HugeiconsIcon icon={Analytics01Icon} className="size-4 text-primary" />
                    Settings → Usage tab
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground leading-relaxed">
                  <p>
                    <MenuPath path="Menu → AI Settings & Keys → Usage" />
                  </p>
                  <p>
                    Four live counters — <strong>Requests</strong>, <strong>Prompt</strong>, <strong>Completion</strong>, and <strong>Total Tokens</strong> — plus a per-request history showing time, provider, model, and in/out/total tokens. A <strong>Clear</strong> button resets the trail.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">AI Request Logs</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground leading-relaxed">
                  <p>
                    <MenuPath path="Menu → AI Request Logs" />
                  </p>
                  <p>
                    The full debug view: every request with its prompt, the model&apos;s reply, and the token usage line (<InlineCode>in / out / total</InlineCode>). If something failed validation, the reason shows up here.
                  </p>
                </CardContent>
              </Card>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The last 200 requests are kept, stored only in your browser&apos;s localStorage (<InlineCode>drawva.tokenUsage</InlineCode>). Counts come from the provider&apos;s response metadata; local servers that don&apos;t report usage will show zeros.
            </p>
          </Section>

          <Separator />

          {/* ── P2P ──────────────────────────────────────────────────── */}
          <Section
            id="p2p"
            eyebrow="Collaboration"
            title="Live P2P sync"
            lead="Share your canvas with another phone, tablet, or laptop in real time. No account, no cloud storage, no database — just a 6-digit code."
          >
            <MenuPath path="Menu → Live P2P Sync" />

            <div className="grid gap-3 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Host a session</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground leading-relaxed">
                  <ol className="flex list-decimal flex-col gap-1.5 pl-4">
                    <li>Open <strong>Live P2P Sync</strong> and stay on the <strong>Generate Code (Host)</strong> tab.</li>
                    <li>Press <strong>Generate Connect Code</strong> — a 6-digit code appears.</li>
                    <li>Share it. The other device enters it under <strong>Enter Code (Join)</strong>.</li>
                  </ol>
                  <p>
                    The status banner shows <Badge variant="outline" className="mx-0.5 font-mono text-[10px]">Hosting</Badge> with a <strong>Copy Code</strong> button and the live peer count.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Join a session</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground leading-relaxed">
                  <ol className="flex list-decimal flex-col gap-1.5 pl-4">
                    <li>Open <strong>Live P2P Sync</strong> → <strong>Enter Code (Join)</strong>.</li>
                    <li>Type the host&apos;s 6-digit code.</li>
                    <li>Press <strong>Connect to Device</strong>. The host&apos;s board streams over and you go live.</li>
                  </ol>
                  <p>
                    While linked, the header shows a <Badge variant="secondary" className="mx-0.5 font-mono text-[10px]">Connected P2P</Badge> badge. Press <strong>Disconnect</strong> anytime.
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <HugeiconsIcon icon={PeerToPeer01Icon} className="size-4 text-primary" />
                  How it works under the hood
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                <ul className="flex flex-col gap-2">
                  <li className="flex gap-2">
                    <Badge variant="secondary" className="h-fit font-mono text-[10px]">Signaling</Badge>
                    <span className="leading-relaxed">PeerJS&apos;s public broker is used <em>only</em> for the initial handshake. After that, all traffic is direct.</span>
                  </li>
                  <li className="flex gap-2">
                    <Badge variant="secondary" className="h-fit font-mono text-[10px]">Transport</Badge>
                    <span className="leading-relaxed">Canvas data flows peer-to-peer over WebRTC data channels — strokes, erases, moves, widgets, even full tile images.</span>
                  </li>
                  <li className="flex gap-2">
                    <Badge variant="secondary" className="h-fit font-mono text-[10px]">Bootstrap</Badge>
                    <span className="leading-relaxed">When you join, the host streams its complete snapshot (scene objects, widgets, and ink tiles) first. Large payloads are chunked to ~12KB packets to stay under data-channel limits.</span>
                  </li>
                  <li className="flex gap-2">
                    <Badge variant="secondary" className="h-fit font-mono text-[10px]">Presence</Badge>
                    <span className="leading-relaxed">Remote cursors appear live with each peer&apos;s name, color, and active tool.</span>
                  </li>
                  <li className="flex gap-2">
                    <Badge variant="secondary" className="h-fit font-mono text-[10px]">Recovery</Badge>
                    <span className="leading-relaxed">Session roles persist locally, so a page reload automatically re-hosts or rejoins your last session.</span>
                  </li>
                </ul>
                <p className="text-xs leading-relaxed">
                  Tips: keep the host tab open — it is the source of truth for joiners. Same-network connections are fastest; across networks, standard WebRTC NAT traversal applies.
                </p>
              </CardContent>
            </Card>
          </Section>

          {/* ── Formats ──────────────────────────────────────────────── */}
          <Section
            id="formats"
            eyebrow="Reference"
            title="Diagram & widget formats"
            lead="The AI speaks ten visual languages, each rendered by a dedicated engine inside a sandboxed widget."
          >
            <Card>
              <CardContent className="pt-0 pb-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Format</TableHead>
                      <TableHead className="hidden sm:table-cell">Render engine</TableHead>
                      <TableHead>Best for</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {FORMATS.map((f) => (
                      <TableRow key={f.name}>
                        <TableCell className="font-medium">{f.name}</TableCell>
                        <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">{f.source}</TableCell>
                        <TableCell className="text-muted-foreground">{f.use}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground leading-relaxed">
              You can also insert any of these by hand: Menu → <strong>Insert</strong> offers Interactive Applet, Diagram, LaTeX Formula, Math Function Plot, and Image File.
            </p>
          </Section>

          {/* ── FAQ ──────────────────────────────────────────────────── */}
          <Section
            id="faq"
            eyebrow="Reference"
            title="Frequently asked questions"
          >
            <Accordion multiple className="rounded-lg border bg-card/60 px-4">
              {FAQS.map((f) => (
                <AccordionItem key={f.q} value={f.q}>
                  <AccordionTrigger>{f.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Section>

          <Separator />

          {/* ── Footer ───────────────────────────────────────────────── */}
          <footer className="flex flex-col gap-4 pb-10">
            <Card>
              <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">
                    Built by Md Taqui Imam — open source under MIT.
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Drawva is a side project for the developer community. Found a bug? PRs welcome.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" render={<a href="https://github.com/taqui-786/drawva" target="_blank" rel="noopener noreferrer" />}>
                    <HugeiconsIcon icon={GithubIcon} data-icon="true" />
                    <span>GitHub</span>
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" render={<a href="https://taqui.in" target="_blank" rel="noopener noreferrer" />}>
                    <HugeiconsIcon icon={Link01Icon} data-icon="true" />
                    <span>taqui.in</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-center">
              <Button className="gap-2 rounded-full px-6" render={<Link href="/canvas" />}>
                <HugeiconsIcon icon={SparklesIcon} data-icon="true" />
                <span>Open the canvas</span>
              </Button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
