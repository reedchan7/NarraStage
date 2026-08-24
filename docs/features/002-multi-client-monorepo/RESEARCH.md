# Research — Feature 002 Multi-client React monorepo modernization

- Date: 2026-08-24 · Mode: deep · Spec: ./SPEC.md

## Questions

1. Which repository and package topology removes the current cross-repository build dependency without adding unnecessary orchestration?
2. Which current React and TypeScript versions are actually available and suitable for a pinned migration baseline?
3. Does Hono or Elysia better satisfy the user's preference for a fast, popular Express replacement under NarraStage's Bun, Electron, Node HTTP, and Socket.IO constraints?
4. Which migration sequence can eliminate Vue and Express while keeping a runnable product at each stage?

## Problem evidence

| Finding | Class | Source | Limitation |
|---|---|---|---|
| The App release workflow checks out a second Web repository in every quality and platform-build job. | observed | `.github/workflows/release.yml:28`, accessed 2026-08-24 | Shows coupling and operational cost, not user-facing demand. |
| The App package command hard-codes the sibling path `../NarraStage-web`; the current HEAD fails its embedded-source provenance build gate because the bundled manifest names an older backend revision. | measured | `package.json:39`; `bun run build`, 2026-08-24 | The stale manifest is repairable without a monorepo; it is evidence of a fragile boundary, not proof that only one topology works. |
| The Web source contains 96 Vue SFCs / 35,548 lines and 75 TS/JS files / 11,743 lines; the server has 192 files directly importing Express. | measured | `fd` + `wc` + `rg`, 2026-08-24 | Line/file counts estimate migration exposure, not behavioral complexity. |
| Current independent baselines are green: server 208/208 tests and Web 40/40 tests plus type-check and build; Web output is a 26,953.39 kB single HTML file plus workers. | measured | `bun run check`; `corepack yarn type-check && corepack yarn test:run && corepack yarn build-only`, 2026-08-24 | No paid live-provider call or packaged desktop launch was part of this baseline. |

## OSS prior art

- Hono — zero-dependency Web Standards framework with first-party Bun guidance and multi-runtime support; its router can be embedded behind a compatibility boundary while routes migrate — https://hono.dev/docs/ and https://hono.dev/docs/getting-started/bun, accessed 2026-08-24; class: documented; limitation: vendor benchmarks do not prove this application's end-to-end throughput.
- Elysia — Bun-optimized, type-safe server framework whose published benchmark reports higher raw request rates than Hono and Express — https://elysiajs.com/at-glance.html, accessed 2026-08-24; class: documented; limitation: the displayed benchmark uses Bun 0.7.2 from 2023 and does not cover NarraStage's database, media, Socket.IO, or Electron topology.
- Bun workspaces — native workspace filtering and one lockfile are sufficient for a small `apps/*` + `packages/*` repository, avoiding another task-runner dependency — https://bun.sh/docs/install/workspaces, accessed 2026-08-24; class: documented; limitation: cross-platform Electron packaging still requires explicit CI jobs.

## Engineering practice

- React `19.2.8` and React DOM `19.2.8` were the npm `latest` versions observed; React's official 19.2 announcement establishes the supported release line — https://registry.npmjs.org/react/latest and https://react.dev/blog/2025/10/01/react-19-2, accessed 2026-08-24; applies to the Web client; limitation: a later patch may exist when implementation is refreshed.
- TypeScript `7.0.2` was both the npm `latest` version and the compiler already passing the App baseline — https://registry.npmjs.org/typescript/latest, accessed 2026-08-24; applies across all workspaces; limitation: dependencies still need compilation checks under TypeScript 7.
- Vite `8.2.2` was npm `latest`; Vite 8 uses Rolldown as its unified Rust-based bundler and documents a 10–30x build improvement on its selected corpus — https://registry.npmjs.org/vite/latest and https://vite.dev/blog/announcing-vite8, accessed 2026-08-24; applies to the React Web build; limitation: this is not a measured NarraStage speedup.
- The npm download service reported 230,431,395 Hono downloads and 3,536,803 Elysia downloads for 2026-07-24 through 2026-08-22 — https://api.npmjs.org/downloads/point/last-month/hono and https://api.npmjs.org/downloads/point/last-month/elysia, accessed 2026-08-24; applies only as an adoption/maintenance proxy, not a quality score.
- A strangler migration with stable public contracts contains risk better than a simultaneous data/API/UI rewrite; NarraStage already has generated OpenAPI identity and provenance gates that can act as the compatibility seam — observed in `scripts/package-web.ts:72` and `src/contracts/buildManifest.ts:1`; limitation: the legacy untyped API surface still needs characterization tests.

## Buy vs build

- Candidates: Bun workspaces versus Turborepo/Nx; Hono versus Elysia; React Router/TanStack Query/Zustand versus a custom router/cache/store; full automatic Vue conversion versus a controlled React rebuild of product surfaces.
- Verdict: adopt Bun workspaces, Hono, React Router, TanStack Query, Zustand, Testing Library, and the existing OpenAPI generator. Do not add a monorepo task runner until measured build-graph needs justify it. Build the product-specific React UI and a thin Hono compatibility adapter because automatic SFC translation cannot preserve 35k lines of template semantics with auditable behavior.

## What this recommends

1. Use one repository with `apps/server`, `apps/web`, `apps/desktop`, and `packages/contracts`, a root Bun lockfile, and root discoverable commands (Q1; problem evidence; Bun workspace prior art).
2. Pin React/React DOM 19.2.8, Vite 8.2.2, and TypeScript 7.0.2 at migration time; use one TypeScript version for all packages (Q2; engineering-practice findings).
3. Select Hono 4.13.3. Elysia's raw benchmark is stronger, while Hono's much broader adoption, Web Standards portability, Bun support, and lower-risk Node HTTP integration better match this multi-client migration (Q3; OSS and adoption findings).
4. Migrate in expand-and-contract slices: unite repositories and build graph; move server/desktop paths; introduce Hono behind behavior tests; rebuild the Web shell and each required product surface in React; then delete Vue/Express and repackage (Q4; measured blast radius and existing contract/provenance seams).

## Answered / unanswered

- Answered: Q1, Q2, Q3, Q4.
- Unanswered after 2 rounds: exact paid-provider live acceptance availability depends on secrets, budgets, and signed release evidence. It remains a release limitation; mock/contract/local runtime acceptance must still prove conversation, image, and video workflows without claiming paid-provider release readiness.

