// ============================================================
// Drawva AI System — Next.js API Route Handler (PenEcho Spec)
// POST /api/canvas/ai
// LangChain chain execution + command validation + retry logic
// Handles diagram_source, html_widget, PlantUML, SMILES, and AI Refine
// ============================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAiModel } from "@/lib/ai/model";
import {
  SYSTEM_PROMPT,
  FLOWCHART_RULES,
  MANDATORY_VISIBLE,
  JSON_CONTRACT,
  RETRY_INSTRUCTION,
  buildHumanMessage,
} from "@/lib/ai/prompts";
import type { AiRequest, AiReply } from "@/lib/ai/types";
import { validateCommand } from "@/lib/canvas/commands";

const toolSchema = z.object({ tool: z.string() }).passthrough();

const replySchema = z.object({
  intent: z.enum([
    "none",
    "answer",
    "explain",
    "hint",
    "plot",
    "continue",
    "flowchart",
    "refine",
    "plantuml",
    "smiles",
    "vegalite",
    "circuit",
  ]),
  message: z.string().optional(),
  commands: z.array(toolSchema).min(1).max(16),
});

function getMockReply(req: AiRequest): AiReply {
  const prompt = (req.userPrompt || "").toLowerCase();
  const action = req.userAction;

  const vX = req.atlasRect?.x ?? 0;
  const vY = req.atlasRect?.y ?? 0;
  const vW = req.atlasRect?.w ?? req.canvasSize.w;
  const vH = req.atlasRect?.h ?? req.canvasSize.h;

  const defaultW = Math.max(480, Math.round(vW * 0.65));
  const defaultH = Math.max(300, Math.round(vH * 0.55));
  const defaultX = Math.round(vX + (vW - defaultW) / 2);
  const defaultY = Math.round(vY + (vH - defaultH) / 2);

  // In-place refinement mode
  if (action === "refine" || req.widgetEditContext) {
    const ctx = req.widgetEditContext;
    const format = ctx?.sourceFormat || "mermaid";
    const prevSource = ctx?.source || "flowchart LR\n  A[Start] --> B[Process]";
    const updatedSource = prevSource.includes("Refined")
      ? prevSource
      : `${prevSource}\n  B --> C[Refined Step via Handwritten Mark]`;

    return {
      intent: "refine",
      message: "Refined diagram in-place",
      commands: [
        {
          tool: "diagram_source",
          pluginId: "flowchart",
          x: ctx?.box?.x || defaultX,
          y: ctx?.box?.y || defaultY,
          w: ctx?.box?.w || defaultW,
          h: ctx?.box?.h || defaultH,
          title: ctx?.title || "Refined Diagram",
          diagramKind: ctx?.diagramKind || "flowchart",
          sourceFormat: format,
          source: updatedSource,
          copyText: updatedSource,
          copyLabel: `Copy ${format.toUpperCase()}`,
        },
      ],
      attempts: 1,
    };
  }

  // Playable Tic-Tac-Toe Mini Game widget
  if (
    prompt.includes("tic") ||
    prompt.includes("tac") ||
    prompt.includes("toe") ||
    prompt.includes("game")
  ) {
    const ticTacToeHtml = `
<style>
  .game-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-family: system-ui, -apple-system, sans-serif;
    background: transparent;
    padding: 16px;
  }
  .game-card {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(12px);
    border-radius: 24px;
    padding: 24px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.08);
    border: 1px solid rgba(0,0,0,0.08);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .title {
    font-size: 20px;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 8px;
  }
  .status {
    font-size: 14px;
    font-weight: 600;
    color: #475569;
    margin-bottom: 16px;
  }
  .board {
    display: grid;
    grid-template-columns: repeat(3, 70px);
    grid-template-rows: repeat(3, 70px);
    gap: 8px;
  }
  .cell {
    width: 70px;
    height: 70px;
    background: #f8fafc;
    border: 2px solid #e2e8f0;
    border-radius: 14px;
    font-size: 32px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .cell:hover {
    background: #f1f5f9;
    border-color: #cbd5e1;
    transform: scale(1.03);
  }
  .cell.x { color: #3b82f6; }
  .cell.o { color: #ef4444; }
  .restart-btn {
    margin-top: 16px;
    padding: 8px 20px;
    border-radius: 12px;
    background: #0f172a;
    color: #ffffff;
    font-weight: 700;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .restart-btn:hover {
    background: #1e293b;
    transform: scale(1.05);
  }
</style>
<div class="game-container">
  <div class="game-card">
    <div class="title">🎮 Tic-Tac-Toe</div>
    <div class="status" id="status">Turn: Player X</div>
    <div class="board" id="board">
      <button class="cell" onclick="makeMove(0)"></button>
      <button class="cell" onclick="makeMove(1)"></button>
      <button class="cell" onclick="makeMove(2)"></button>
      <button class="cell" onclick="makeMove(3)"></button>
      <button class="cell" onclick="makeMove(4)"></button>
      <button class="cell" onclick="makeMove(5)"></button>
      <button class="cell" onclick="makeMove(6)"></button>
      <button class="cell" onclick="makeMove(7)"></button>
      <button class="cell" onclick="makeMove(8)"></button>
    </div>
    <button class="restart-btn" onclick="resetGame()">Reset Game</button>
  </div>
</div>
<script>
  let board = ["", "", "", "", "", "", "", "", ""];
  let currentPlayer = "X";
  let active = true;

  const winPatterns = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  function makeMove(i) {
    if (!active || board[i] !== "") return;
    board[i] = currentPlayer;
    const btn = document.querySelectorAll('.cell')[i];
    btn.textContent = currentPlayer;
    btn.classList.add(currentPlayer.toLowerCase());

    if (checkWin()) {
      document.getElementById('status').textContent = '🎉 Player ' + currentPlayer + ' Wins!';
      active = false;
      return;
    }

    if (board.every(c => c !== "")) {
      document.getElementById('status').textContent = "🤝 It's a Draw!";
      active = false;
      return;
    }

    currentPlayer = currentPlayer === "X" ? "O" : "X";
    document.getElementById('status').textContent = 'Turn: Player ' + currentPlayer;
  }

  function checkWin() {
    return winPatterns.some(([a,b,c]) => board[a] && board[a] === board[b] && board[a] === board[c]);
  }

  function resetGame() {
    board = ["", "", "", "", "", "", "", "", ""];
    currentPlayer = "X";
    active = true;
    document.getElementById('status').textContent = 'Turn: Player X';
    document.querySelectorAll('.cell').forEach(btn => {
      btn.textContent = "";
      btn.classList.remove('x', 'o');
    });
  }
</script>`;

    return {
      intent: "widget",
      message: "Generated Tic-Tac-Toe Mini Game Widget",
      commands: [
        {
          tool: "html_widget",
          pluginId: "flowchart",
          x: defaultX,
          y: defaultY,
          w: 420,
          h: 460,
          title: "Playable Tic-Tac-Toe Game",
          html: ticTacToeHtml,
          copyText: ticTacToeHtml,
          copyLabel: "Copy HTML Code",
          frameworkVersion: "penecho-widget-v1",
        },
      ],
      attempts: 1,
    };
  }

  // Animated Clocks widget (Beijing, London, New York)
  if (
    prompt.includes("clock") ||
    prompt.includes("time") ||
    prompt.includes("beijing") ||
    prompt.includes("london") ||
    prompt.includes("york")
  ) {
    const clocksHtml = `
<style>
  .clock-container {
    display: flex;
    justify-content: space-around;
    align-items: center;
    width: 100%;
    height: 100%;
    padding: 16px;
    background: transparent;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .clock-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 20px;
    padding: 16px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    border: 1px solid rgba(0,0,0,0.08);
  }
  .clock-title {
    font-size: 14px;
    font-weight: 700;
    color: #475569;
    margin-bottom: 12px;
  }
  .clock-face {
    width: 110px;
    height: 110px;
    border-radius: 50%;
    border: 3px solid #64748b;
    position: relative;
    background: #ffffff;
  }
  .hand {
    position: absolute;
    bottom: 50%;
    left: 50%;
    transform-origin: bottom center;
    border-radius: 4px;
  }
  .hour-hand { width: 4px; height: 30px; background: #1e293b; margin-left: -2px; }
  .minute-hand { width: 3px; height: 42px; background: #3b82f6; margin-left: -1.5px; }
  .second-hand { width: 1.5px; height: 48px; background: #ef4444; margin-left: -0.75px; }
  .center-dot {
    width: 8px;
    height: 8px;
    background: #1e293b;
    border-radius: 50%;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  .digital-time {
    margin-top: 10px;
    font-size: 15px;
    font-weight: 700;
    font-mono: true;
    color: #0f172a;
  }
</style>
<div class="clock-container">
  <div class="clock-card">
    <div class="clock-title">Beijing</div>
    <div class="clock-face">
      <div class="hand hour-hand" id="bj-h"></div>
      <div class="hand minute-hand" id="bj-m"></div>
      <div class="hand second-hand" id="bj-s"></div>
      <div class="center-dot"></div>
    </div>
    <div class="digital-time" id="bj-digital">--:--:--</div>
  </div>
  <div class="clock-card">
    <div class="clock-title">London</div>
    <div class="clock-face">
      <div class="hand hour-hand" id="ld-h"></div>
      <div class="hand minute-hand" id="ld-m"></div>
      <div class="hand second-hand" id="ld-s"></div>
      <div class="center-dot"></div>
    </div>
    <div class="digital-time" id="ld-digital">--:--:--</div>
  </div>
  <div class="clock-card">
    <div class="clock-title">New York</div>
    <div class="clock-face">
      <div class="hand hour-hand" id="ny-h"></div>
      <div class="hand minute-hand" id="ny-m"></div>
      <div class="hand second-hand" id="ny-s"></div>
      <div class="center-dot"></div>
    </div>
    <div class="digital-time" id="ny-digital">--:--:--</div>
  </div>
</div>
<script>
  function updateClocks() {
    const now = new Date();
    
    function setClock(prefix, offsetHours) {
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const targetTime = new Date(utc + (3600000 * offsetHours));
      
      const hours = targetTime.getHours();
      const minutes = targetTime.getMinutes();
      const seconds = targetTime.getSeconds();
      
      const hDeg = (hours % 12 + minutes / 60) * 30;
      const mDeg = (minutes + seconds / 60) * 6;
      const sDeg = seconds * 6;
      
      const hElem = document.getElementById(prefix + '-h');
      const mElem = document.getElementById(prefix + '-m');
      const sElem = document.getElementById(prefix + '-s');
      const dElem = document.getElementById(prefix + '-digital');
      
      if (hElem) hElem.style.transform = 'rotate(' + hDeg + 'deg)';
      if (mElem) mElem.style.transform = 'rotate(' + mDeg + 'deg)';
      if (sElem) sElem.style.transform = 'rotate(' + sDeg + 'deg)';
      if (dElem) dElem.textContent = String(hours).padStart(2,'0') + ':' + String(minutes).padStart(2,'0') + ':' + String(seconds).padStart(2,'0');
    }
    
    setClock('bj', 8);
    setClock('ld', 1);
    setClock('ny', -4);
  }
  
  setInterval(updateClocks, 1000);
  updateClocks();
</script>
`;
    return {
      intent: "answer",
      message: "Generated World Clocks Widget",
      commands: [
        {
          tool: "html_widget",
          pluginId: "flowchart",
          x: defaultX,
          y: defaultY,
          w: defaultW,
          h: 280,
          title: "World Clocks (Beijing, London, New York)",
          diagramKind: "widget",
          sourceFormat: "html",
          html: clocksHtml,
          copyText: clocksHtml,
          copyLabel: "Copy HTML Widget",
        },
      ],
      attempts: 1,
    };
  }

  // SaaS Analytics Dashboard widget
  if (
    prompt.includes("saas") ||
    prompt.includes("analytics") ||
    prompt.includes("revenue") ||
    prompt.includes("dashboard") ||
    prompt.includes("metric")
  ) {
    const analyticsHtml = `
<div class="w-[520px] bg-white rounded-2xl p-6 border border-slate-200 shadow-xl font-sans">
  <div class="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
    <div>
      <h3 class="text-base font-bold text-slate-800">SaaS Revenue Analytics</h3>
      <p class="text-xs text-slate-500">Monthly recurring revenue performance</p>
    </div>
    <span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">+18.4% MRR</span>
  </div>
  <div class="grid grid-cols-3 gap-3 mb-5">
    <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
      <div class="text-xs text-slate-500 mb-1">Total MRR</div>
      <div class="text-lg font-black text-slate-800">$48,250</div>
      <div class="text-[11px] text-emerald-600 mt-0.5">▲ +$4,200 this mo</div>
    </div>
    <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
      <div class="text-xs text-slate-500 mb-1">Active Customers</div>
      <div class="text-lg font-black text-slate-800">1,420</div>
      <div class="text-[11px] text-emerald-600 mt-0.5">▲ 82 new users</div>
    </div>
    <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
      <div class="text-xs text-slate-500 mb-1">Churn Rate</div>
      <div class="text-lg font-black text-slate-800">1.2%</div>
      <div class="text-[11px] text-emerald-600 mt-0.5">▼ -0.4% lower</div>
    </div>
  </div>
  <div class="space-y-2">
    <div class="flex justify-between text-xs text-slate-600 font-medium">
      <span>Quarterly Target ($60,000)</span>
      <span>80% Completed</span>
    </div>
    <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
      <div class="bg-blue-600 h-full rounded-full" style="width: 80%"></div>
    </div>
  </div>
</div>`;

    return {
      intent: "answer",
      message: "Generated SaaS Revenue Analytics Widget",
      commands: [
        {
          tool: "html_widget",
          pluginId: "flowchart",
          x: defaultX,
          y: defaultY,
          w: 540,
          h: 300,
          title: "SaaS Revenue Analytics Widget",
          diagramKind: "widget",
          sourceFormat: "html",
          html: analyticsHtml,
          copyText: analyticsHtml,
          copyLabel: "Copy HTML Widget",
        },
      ],
      attempts: 1,
    };
  }

  // PlantUML class diagram
  if (
    prompt.includes("plantuml") ||
    prompt.includes("class model") ||
    prompt.includes("cardinalities")
  ) {
    const plantUmlCode = `@startuml
class Customer {
  +customerId: UUID
  +name: String
  +email: String
  +status: CustomerStatus
}
class Subscription {
  +subscriptionId: UUID
  +status: SubscriptionStatus
  +startDate: Date
}
class Invoice {
  +invoiceId: UUID
  +issuedAt: DateTime
  +totalAmount: Decimal
}
Customer "1" -- "0..*" Subscription : owns
Subscription "1" -- "0..*" Invoice : generates
@enduml`;

    return {
      intent: "plantuml",
      message: "Generated PlantUML Class Model",
      commands: [
        {
          tool: "html_widget",
          pluginId: "flowchart",
          x: defaultX,
          y: defaultY,
          w: defaultW,
          h: defaultH,
          title: "Customer Billing Class Model",
          diagramKind: "class-diagram",
          sourceFormat: "plantuml",
          html: `<div class="p-4 font-mono text-xs text-foreground bg-muted/30 rounded-xl overflow-auto border border-border"><div class="font-bold text-primary mb-2">PlantUML Class Diagram</div><pre class="whitespace-pre">${plantUmlCode}</pre></div>`,
          copyText: plantUmlCode,
          copyLabel: "Copy PlantUML",
          frameworkVersion: "penecho-professional-diagrams-v1",
        },
      ],
      attempts: 1,
    };
  }

  // SMILES Chemistry Molecular Structure
  if (
    prompt.includes("smiles") ||
    prompt.includes("aspirin") ||
    prompt.includes("molecule")
  ) {
    return {
      intent: "smiles",
      message: "Generated SMILES Molecular Structure",
      commands: [
        {
          tool: "diagram_source",
          pluginId: "flowchart",
          x: defaultX,
          y: defaultY,
          w: defaultW,
          h: defaultH,
          title: "Aspirin (Acetylsalicylic Acid)",
          diagramKind: "molecular-structure",
          sourceFormat: "smiles",
          source: "CC(=O)OC1=CC=CC=C1C(=O)O",
          copyText: "CC(=O)OC1=CC=CC=C1C(=O)O",
          copyLabel: "Copy SMILES",
        },
      ],
      attempts: 1,
    };
  }

  // Flowchart & Diagram matching (Check BEFORE generic "chart" since "flowchart" ends in "chart")
  if (
    action === "flowchart" ||
    prompt.includes("flowchart") ||
    prompt.includes("auth") ||
    prompt.includes("diagram") ||
    prompt.includes("process")
  ) {
    const title = req.userPrompt
      ? req.userPrompt.slice(0, 35)
      : "Authentication Flowchart";

    const isAuth = prompt.includes("auth") || prompt.includes("login") || prompt.includes("token");
    const mermaidSource = isAuth
      ? `flowchart LR\n  A[User Login Input] --> B{Validate Credentials}\n  B -- Valid --> C[Issue Access Token]\n  B -- Invalid --> D[Show Login Error]\n  C --> E{Token Active?}\n  E -- Valid --> F[Granted Protected Resource]\n  E -- Expired --> G[Refresh Token / Re-Auth]`
      : `flowchart LR\n  %% penecho:responsive\n  A[Start / User Input] --> B{Valid Request?}\n  B -- Yes --> C[Process Logic]\n  B -- No --> D[Show Error]\n  C --> E[Render Canvas Output]\n  D --> E`;

    return {
      intent: "flowchart",
      message: "Generated flowchart diagram",
      commands: [
        {
          tool: "diagram_source",
          pluginId: "flowchart",
          x: defaultX,
          y: defaultY,
          w: defaultW,
          h: defaultH,
          sourceFormat: "mermaid",
          source: mermaidSource,
          title,
          copyText: mermaidSource,
          copyLabel: "Copy Mermaid",
        },
      ],
      attempts: 1,
    };
  }

  // Vega-Lite Chart (Explicit data chart requests)
  if (
    prompt.includes("sales") ||
    prompt.includes("vega") ||
    prompt.includes("bar chart") ||
    prompt.includes("line chart") ||
    prompt.includes("data plot")
  ) {
    const vegaSpec = JSON.stringify(
      {
        $schema: "https://vega.github.io/schema/vega-lite/v5.json",
        description: "Monthly Sales Line Chart",
        data: {
          values: [
            { month: "Jan", sales: 120 },
            { month: "Feb", sales: 145 },
            { month: "Mar", sales: 132 },
            { month: "Apr", sales: 190 },
            { month: "May", sales: 210 },
            { month: "Jun", sales: 250 },
          ],
        },
        mark: { type: "line", point: true },
        encoding: {
          x: { field: "month", type: "nominal", title: "Month" },
          y: { field: "sales", type: "quantitative", title: "Sales ($k)" },
        },
      },
      null,
      2,
    );

    return {
      intent: "vegalite",
      message: "Generated Vega-Lite Line Chart",
      commands: [
        {
          tool: "diagram_source",
          pluginId: "flowchart",
          x: defaultX,
          y: defaultY,
          w: defaultW,
          h: defaultH,
          title: "Monthly Sales Line Chart",
          diagramKind: "chart",
          sourceFormat: "vega-lite",
          source: vegaSpec,
          copyText: vegaSpec,
          copyLabel: "Copy Vega-Lite JSON",
        },
      ],
      attempts: 1,
    };
  }

  // Interactive HTML Card fallback for component / app / widget prompts
  if (
    prompt.includes("widget") ||
    prompt.includes("app") ||
    prompt.includes("card") ||
    prompt.includes("ui") ||
    prompt.includes("component")
  ) {
    const genericWidgetHtml = `
<style>
  .card-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 16px;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .card {
    background: rgba(255, 255, 255, 0.95);
    border-radius: 20px;
    padding: 24px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.08);
    border: 1px solid rgba(0,0,0,0.08);
    text-align: center;
    max-width: 380px;
  }
  .badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 999px;
    background: #e0f2fe;
    color: #0369a1;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 12px;
  }
  .h1 { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
  .p { font-size: 13px; color: #64748b; line-height: 1.5; margin-bottom: 16px; }
  .btn {
    padding: 10px 24px;
    border-radius: 12px;
    background: #2563eb;
    color: #ffffff;
    font-weight: 700;
    border: none;
    cursor: pointer;
    transition: transform 0.15s ease;
  }
  .btn:hover { transform: scale(1.05); }
</style>
<div class="card-wrap">
  <div class="card">
    <div class="badge">Interactive Widget</div>
    <div class="h1">${req.userPrompt ? req.userPrompt.slice(0, 30) : "Interactive App"}</div>
    <div class="p">Multimodal dynamic HTML component generated for Drawva Whiteboard.</div>
    <button class="btn" onclick="alert('Interactive widget ready!')">Launch Feature</button>
  </div>
</div>`;

    return {
      intent: "widget",
      message: "Generated Interactive HTML Widget",
      commands: [
        {
          tool: "html_widget",
          pluginId: "flowchart",
          x: defaultX,
          y: defaultY,
          w: 420,
          h: 320,
          title: req.userPrompt ? req.userPrompt.slice(0, 30) : "Interactive Widget",
          html: genericWidgetHtml,
          copyText: genericWidgetHtml,
          copyLabel: "Copy HTML Code",
          frameworkVersion: "penecho-widget-v1",
        },
      ],
      attempts: 1,
    };
  }

  return {
    intent: "answer",
    message: "Generated text response",
    commands: [
      {
        tool: "write_text",
        x: defaultX,
        y: defaultY,
        text: req.userPrompt
          ? `AI Response for: "${req.userPrompt}"\n\n• Canvas vision active\n• Multimodal diagrams ready (Mermaid, PlantUML, Vega-Lite, SMILES)`
          : "How can I assist with your whiteboard diagram?",
        fontSize: 20,
        maxWidth: defaultW,
      },
    ],
    attempts: 1,
  };
}

export async function POST(request: Request) {
  try {
    const body: AiRequest = await request.json();

    if (!body.canvasSize || typeof body.canvasSize.w !== "number") {
      return NextResponse.json(
        { error: "Invalid canvasSize in request body" },
        { status: 400 },
      );
    }

    const hasImage = Boolean(
      body.atlasImage && body.atlasImage.startsWith("data:image/"),
    );

    // Code generation model (deepseek-v4-flash-free for OpenCode)
    const codeModel = getAiModel({ task: "code", hasImage: false });

    // Snapshot image recognition model (mimo-v2.5-free for OpenCode) when image is present
    const visionModel = hasImage
      ? getAiModel({ task: "vision", hasImage: true })
      : null;

    if (!codeModel && !visionModel) {
      // Fallback to dry-run mode when no API key is set
      const reply = getMockReply(body);
      return NextResponse.json(reply);
    }

    console.log(
      `[AI Route] 🚀 Processing request | userAction: "${body.userAction}" | hasImage: ${hasImage}`,
    );

    // Stage 1: Vision recognition with mimo-v2.5-free if snapshot image is present
    let visualNotes = "";
    if (hasImage && visionModel) {
      try {
        console.log(
          `[AI Route] 👁️ Stage 1: Running snapshot image recognition with mimo-v2.5-free...`,
        );
        const visionRes = await visionModel.invoke([
          {
            role: "system",
            content:
              "You are a visual recognition model for an interactive canvas. Describe all handwritten text, drawings, shapes, and visual annotations present in the image snapshot concisely.",
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: body.atlasImage } },
              {
                type: "text",
                text: "Identify all text, diagram nodes, and visual marks in this canvas snapshot.",
              },
            ],
          },
        ]);
        visualNotes =
          typeof visionRes.content === "string"
            ? visionRes.content
            : JSON.stringify(visionRes.content);
        console.log(
          `[AI Route] 👁️ Vision recognition result: "${visualNotes.slice(0, 150)}..."`,
        );
      } catch (vErr) {
        const errMsg = vErr instanceof Error ? vErr.message : String(vErr);
        console.warn(
          `[AI Route] ⚠️ Vision recognition with mimo-v2.5-free skipped/failed (${errMsg}). Proceeding with scene JSON.`,
        );
      }
    }

    // Stage 2: Code generation with deepseek-v4-flash-free
    console.log(
      `[AI Route] ⚡ Stage 2: Running code generation model with deepseek-v4-flash-free...`,
    );
    const activeCodeModel = codeModel || visionModel!;
    const structuredModel = activeCodeModel.withStructuredOutput(replySchema, {
      name: "emit_canvas_commands",
    });

    let humanText = `${FLOWCHART_RULES}\n${MANDATORY_VISIBLE}\n${JSON_CONTRACT}\n\n${buildHumanMessage(body)}`;
    if (visualNotes) {
      humanText = `Visual Snapshot Recognition (from mimo-v2.5-free):\n${visualNotes}\n\n${humanText}`;
    }

    let attempts = 0;
    let lastErrorReason = "";

    while (attempts < 2) {
      attempts++;
      try {
        const messages: unknown[] = [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: humanText },
        ];

        if (attempts > 1 && lastErrorReason) {
          messages.push({
            role: "user",
            content: RETRY_INSTRUCTION(lastErrorReason),
          });
        }

        const rawResult = (await structuredModel.invoke(
          messages as unknown as Parameters<typeof structuredModel.invoke>[0],
        )) as {
          intent: AiReply["intent"];
          message?: string;
          commands: Array<Record<string, unknown>>;
        };

        // Validate returned commands
        let valid = true;
        for (const cmd of rawResult.commands || []) {
          const v = validateCommand(cmd);
          if (!v.ok) {
            valid = false;
            lastErrorReason = v.reason || "invalid command structure";
            break;
          }
        }

        if (valid && rawResult.commands && rawResult.commands.length > 0) {
          console.log(
            `[AI Route] ✅ Code generation succeeded with deepseek-v4-flash-free! Emitting ${rawResult.commands.length} command(s).`,
          );
          const reply: AiReply = {
            intent: rawResult.intent,
            message: rawResult.message,
            commands: rawResult.commands as unknown as AiReply["commands"],
            attempts,
          };
          return NextResponse.json(reply);
        } else {
          lastErrorReason = "Model returned an empty commands array";
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[AI Route] Attempt ${attempts} code generation failed:`,
          errMsg,
        );
        lastErrorReason = errMsg || "Failed to parse structured JSON output";
      }
    }

    // Fallback if model fails after retries
    console.log(`[AI Route] ⚠️ Returning fallback commands`);
    const fallback = getMockReply(body);
    fallback.message = fallback.message + " (fallback)";
    return NextResponse.json(fallback);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[AI Route Error]", err);
    return NextResponse.json(
      { error: errMsg || "Internal server error in AI route" },
      { status: 500 },
    );
  }
}
