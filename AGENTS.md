<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Commands

Use **pnpm** (pinned to `pnpm@10.33.3` in `package.json`) — not npm/yarn, despite what README says.

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm lint` — ESLint 9 flat config (`eslint.config.mjs`)
- `npx tsc --noEmit` — typecheck (no npm script exists for this)
- **No test framework is installed.** Verify changes with `pnpm lint` + `npx tsc --noEmit` + `pnpm build`.

Add shadcn components with `pnpm dlx shadcn add <component>` — never hand-write files into `components/ui/`.

## Non-obvious stack facts (verify before assuming defaults)

- **This shadcn setup uses Base UI, not Radix.** Style is `"base-sera"` (see `components.json`); UI primitives import from `@base-ui/react/` (e.g. `components/ui/button.tsx` uses `@base-ui/react/button`). Do not write Radix API code (`asChild`, `Slot`, etc.) against these components — check the existing component's API first.
- **Icon library is HugeIcons** (`@hugeicons/react`), not lucide-react.
- **Tailwind CSS v4**, CSS-first config — there is no `tailwind.config.*`. Theme lives in `app/globals.css` via `@theme inline` + shadcn CSS variables. Keep the `@import "shadcn/tailwind.css"` import at the top of `globals.css`; it comes from the `shadcn` npm package.
- Path alias is `@/*` → `./*` (repo root, not `./src`). Aliases in `components.json`: `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`. Note `@/hooks` directory does not exist yet — `shadcn add` creates it when a component needs hooks.
- Dark mode uses the `.dark` class variant (`@custom-variant dark (&:is(.dark *))` in `globals.css`), not the `dark:` media default.

## Repo shape

Early-stage single Next.js App Router app with a **framework-agnostic canvas engine** in `canvas/` (spec: `PLAN.md`).

- React owns only the shell: `app/CanvasApp.tsx` (toolbars, stacked canvases, editor lifecycle) and `app/page.tsx`. UI communicates with the engine **exclusively** through the `Editor` API (`canvas/core/Editor.ts`, factory `createCanvasEditor`) — never reach into `Scene`/`History`/`renderer` internals from React.
- Engine modules (browser-only, no React imports): `canvas/core` (Editor, Scene, History, events, CanvasEngine), `canvas/*model|geometry|viewport|rendering|tools|interaction|persistence|constants|utils`. Path alias `@canvas/* → ./canvas/*`.
- **Two-canvas rendering** (§21): `CanvasEngine` owns static + overlay canvases, DPR, rAF loop, and dirty flags. Static = scene/grid; overlay = selection handles, marquee, ghosts. Never redraw static for handle moves.
- **Transactions, not per-move history** (§54): geometry gestures `beginTransaction → mutate live → commitHistory` so one drag = one undo entry. Soft-delete (`isDeleted`) keeps undo cheap. `normalizeElementGeometry` runs on resize-up for negative dims.
- **Deterministic sketch rendering** (§12): element `seed` + seeded PRNG (`sketch.ts`) key sketch jitter + hachure fill; same seed ⇒ same output across refresh/save/load.
- **Single geometry source of truth** (§74): `canvas/geometry` (elementAABB, hitTest, rotatedRectCorners, resizeRectFromPointer) feeds renderer, hit-test, selection, handles — don't re-implement shape math elsewhere.
- Tools follow a lifecycle interface (`canvas/tools/Tool.ts`): `onEnter/onPointerDown/onPointerMove/onPointerUp/onExit`; all receive **scene-space** points (screen→scene conversion lives in `PointerManager`). Handles-on-selection take priority over element hits.
- Only `rectangle`/`ellipse`/`diamond`/`line`/`arrow`/`freedraw`/`text` element types exist so far; `createElement` throws for unregistered types. Add new types in `canvas/model/elementFactory.ts` + type union before wiring a tool.
- Persistence is versioned (`{type:"drawva", version:1}`), safely deserialized via `persistence/deserializer` (never trusts imported JSON), autosaved debounced to `localStorage`.
