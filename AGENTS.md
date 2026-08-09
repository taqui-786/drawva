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

Next.js App Router app with a tile-based infinite canvas engine in `lib/canvas/`.

- React owns only the UI shell: `app/canvas/CanvasApp.tsx` (toolbars, viewport), `app/canvas/CanvasShell.tsx`, `app/canvas/page.tsx`, and `app/page.tsx`. UI communicates with the engine via `CanvasProvider` (`components/canvas/CanvasProvider.tsx`) delegating to `CanvasEngine` (`lib/canvas/engine.ts`).
- Engine modules (browser-only, standard canvas API): `lib/canvas/` (`engine.ts`, `camera.ts`, `tiles.ts`, `layers.ts`, `strokes.ts`, `eraser.ts`, `shapes.ts`, `selection.ts`, `textTool.ts`, `images.ts`, `undo.ts`, `persistence.ts`, `exportPng.ts`, `commands.ts`, `types.ts`). Path aliases `@/* → ./*` and `@canvas/* → ./canvas/*`.
- **Tile-based rendering**: `CanvasEngine` owns multi-layer stacked canvases (grid, tiles, objects, overlay/marquee), DPR scaling, rAF rendering loop, and dirty state flags.
- **Camera coordinate transforms**: `Camera` (`lib/canvas/camera.ts`) owns all screen-to-world and world-to-screen coordinate math with scale bounds (0.03x..4.0x) and pan offsets.
- **Undo / Redo snapshot stack**: `UndoStack` (`lib/canvas/undo.ts`) manages dual past/future stacks of item and tile state snapshots with a 50-record and 64MB memory cap.
- **Supported tools**: `pen`, `highlighter`, `eraser`, `hand`, `select`, `text`, `rect`, `ellipse`, `arrow`, `line`, `image`.
- **Persistence**: IndexedDB database (`canvas-db` v1) storing `documents`, `tiles`, and `items` object stores with debounced autosave.

