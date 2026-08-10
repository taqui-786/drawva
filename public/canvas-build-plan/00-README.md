# 🎨 PRODUCTION CANVAS APP — FULL BUILD PACKAGE

For: Next.js + TypeScript + shadcn/ui project
Reference: PenEcho (https://github.com/penecho/penecho) — analyzed in depth
Built by: you + your IDE agent (Claude Code / Cursor / Codex)

## 📂 What's in this package

- `01-IDE-PROMPT.md` — the MASTER PROMPT. Paste this into your IDE agent to build the canvas.
- `02-ARCHITECTURE.md` — canvas engine design (tiles, layers, camera, render loop)
- `03-USE-CASES.md` — every use case + how to handle it (so it never breaks)
- `04-FLOWCHART-RENDERING.md` — exactly how PenEcho renders AI-generated diagrams
- `05-AI-FUTURE.md` — how to plug a LangChain agent in LATER (design now, build later)
- `06-BUILD-PHASES.md` — step-by-step build order with acceptance tests
- `07-AI-LANGCHAIN-MIMO.md` — THE AI build plan: LangChain.js + Xiaomi MiMo-V2.5 (vision-capable), API route, atlas image, flowchart rendering, milestones
- `08-AI-PROMPTS-FLOWCHART.md` — ready-to-paste prompts (system, JSON contract, flowchart rules, retry) ported from PenEcho

> AI phase status: canvas engine done ✅ · AI plan written (files 07 + 08) — build starts when you're ready.

## 🚀 Quick start

1. Your stack is ready (Next.js + TS + shadcn).
2. Open `01-IDE-PROMPT.md`, copy everything inside the code fence.
3. Paste it into your IDE agent chat. Tell it your project path.
4. The agent builds Phase 1 (from `06-BUILD-PHASES.md`) first.
5. You review, then run the next phase.

The prompt is designed so the agent CANNOT build the AI part (it's out of scope for now),
but everything it builds is 100% AI-ready for the LangChain agent later.
