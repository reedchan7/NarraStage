# Plan — Feature 002 Multi-client React monorepo modernization

- SPEC: ./SPEC.md · version: 1 · normative digest: a575655241d1c870260dbb3ac44a930ae28fb41a8dcf71d4045700f00c7f384b
- Assurance: deep
- Base revision: e2a2547028dc6eaf70cb70e714368df48f06d617 · Branch/worktree: `main` at repository root
- Candidate mode: commits
- Authority: edit yes · commit yes · branch yes · push yes · PR no · merge no · deploy no
- Created: 2026-08-24 · Current phase: 5

## Workflow gates

- [x] P1 Baseline and blast radius established
- [x] P2 PLAN validated and required gate approved/inherited
- [x] P3 All slices checkpointed
- [x] P4 Integration/requirement/sensitivity evidence closed
- [x] P5 Review closed with no real Critical/Important open
- [x] P6 Applicable exploratory charters closed
- [x] P7 Readiness report validated

## Candidate and unrelated-work inventory

| Path/state | SHA-256 / identity | Owner | Must remain unchanged? |
|---|---|---|---|
| Git HEAD | `e2a2547028dc6eaf70cb70e714368df48f06d617` | task baseline | no |
| `HANDOFF.md` untracked | `0e9a4135bff575e4072e1f2f2e405921b259c7918853e69794798bfb978aa725` | prior task/user | yes |
| `docs/features/002-multi-client-monorepo/SPEC.md` untracked | `e9a69d0af8eb35255647b4441abd2bd73984695d45683098f54c7c45acef4c6e` | task | no |
| `docs/features/002-multi-client-monorepo/RESEARCH.md` untracked | `bb6bdc9375e48dacd5dfa2cde1f80c9c4e37db76f8a4dd71b0a5cb5e1615b108` | task | no |
| `../NarraStage-web` branch `master` | `00aa348` and clean against `fork/master` | sibling source | yes; import reads only |
| `data/db2.sqlite` ignored runtime data | current byte digest recorded before each runtime probe | user data | yes; tests use isolated copies |

## Global constraints (verbatim from SPEC)

- Root package manager is Bun 1.4.1 with minimum Bun 1.4.0; one root `bun.lock` is authoritative.
- All workspace TypeScript compilation uses exactly TypeScript 7.0.2 or a later explicitly approved 7.x patch; no workspace may pin TypeScript below 7.0.
- Web runtime uses React/React DOM 19.2.8 and Vite 8.2.2 as the implementation baseline; refresh only patch versions if registry evidence and the full gate remain green.
- Server HTTP composition uses Hono 4.13.3; `express`, `express-ws`, Express type packages, Vue, Pinia, Vue Router, Vue Test Utils, and Vue build plugins are forbidden in the delivered dependency graph and source imports.
- Public API paths, response bodies/statuses, Socket.IO namespaces, SQLite data, provider offering identities, job idempotency, credential redaction, and local-origin policy remain compatible unless this SPEC explicitly says otherwise.
- Existing provider release evidence remains fail-closed. No missing credential, signature, or paid live result may be presented as release-ready support.
- No production deployment or production data write is in scope. The user authorizes local edits, local runtime data needed for isolated tests, commits, and push to the current branch.
- Every migration slice must end with a runnable command and a content-identified rollback point.

## Conventions inventory

- Affected tests: `bun test apps/server packages/contracts apps/web` · Full tests/CI: `bun run check && bun run build`
- Lint: `bun run lint` · Typecheck: `bun run typecheck` · Build: `bun run build` · Run: `bun run dev` and `bun run dev:desktop`
- Structure/naming/idioms: file-system API routes currently generate deterministically from route paths; generated artifacts carry source digests; server domain tests colocate with source and integration/fault tests sit under the server app.
- Governing instructions/owners: user-supplied root `AGENTS.md` instructions in the active prompt; `docs/features/002-multi-client-monorepo/SPEC.md`; `docs/features/001-multimodal-provider-architecture/SPEC.md` for provider release truth.

## Baseline failure ledger

| Command | Exit | Test/check | Normalized fingerprint | Status/note |
|---|---:|---|---|---|
| `bun run check` | 0 | server full quality gate | 208 pass, 0 fail, 1145 expectations across 74 files | clean |
| `bun run build` | 1 | embedded Web provenance | `embedded Web backend source revision mismatch: expected 6f147c5...+tree.ac9da..., received e2a2547...+tree.26c161...` | known-red before product edits |
| `corepack yarn type-check && corepack yarn test:run && corepack yarn build-only` in `../NarraStage-web` | 0 | sibling Web full local gate | 40 pass, 0 fail; 11,302 modules; 26,953.39 kB `index.html` | clean |
| `bun start` plus Browser open `http://localhost:10588` | 0 | packaged runtime baseline | URL `/#/project`, title `NarraStage`, heading `欢迎使用 NarraStage`, project shell visible | clean; read-only UI probe |

## Blast-radius coverage ledger

| Surface / consumer class | Causal path | Requirement/check | State | Limitation |
|---|---|---|---|---|
| Root install and release operators | workspace manifests → lockfile → scripts/CI | AC-001/002/004, NFR-010 | covered | non-mac GUI CI remains remote |
| HTTP clients | Hono adapter → route handlers → status/body | AC-005/013, RC-002 | covered | legacy undocumented endpoints sampled by route-wide contract smoke |
| Socket clients | Node HTTP server → Socket.IO namespaces → agent state | AC-010, RC-005 | covered | provider quality is deterministic-test only |
| Existing SQLite users | server path/data-root resolution → Knex migrations | RC-001/004, NFR-007 | covered | fixture cannot prove every historical third-party DB |
| Credential/security consumers | Hono middleware/static files → vault/policy | AC-013, RC-003, NFR-003/004 | covered | Linux OS vault still requires platform CI/runtime |
| Web users | React router/store/hooks → API/socket/contracts | AC-003/006/009-012, NFR-005/006/008/009 | covered | no native mobile UI in this SPEC |
| Desktop users | Electron main/preload → server bundle/renderer/IPC | AC-007/008, RC-006 | covered | unsigned/unnotarized local package only |
| Release truth | source digests → embedded renderer → evidence/secret gates | AC-006/007, RC-006 | covered | paid signed live evidence remains Feature 001 |
| Runtime performance | Hono request path and React bundle | NFR-001/002 | covered | local benchmark is comparative evidence, not production SLO |

## Approved test migrations

| Existing test | Active requirement superseding old assertion | Narrow change |
|---|---|---|
| `src/release/packageGate.test.ts` sibling checkout assertions | AC-001, AC-007, NFR-010 | assert repository-local Web source and one install/lockfile; retain release-evidence ordering checks |
| `src/contracts/packaging.test.ts` legacy path assertions | AC-002, AC-007, RC-006 | update app paths and retain one-renderer/fail-closed semantics |
| `src/providers/legacy/modelListApi.test.ts` Express factory setup | AC-005, RC-002 | invoke the Hono testable API factory; retain status/body assertion |
| `src/core.test.ts` route-source paths | AC-002, AC-005 | update server-root paths; retain exclusion and deterministic hash meaning |
| `../NarraStage-web/src/**/*.test.ts` Vue component/store harnesses | AC-003, AC-009-012, NFR-005/006/008 | replace with React/portable-store tests for the same product contracts; retain provider/job/idempotency assertions |

## Slices

- [x] **S1 — Repository-local workspace and contract source**
  - Covers: AC-001, AC-002, AC-004, AC-006, NFR-010
  - Blocked by: none · Risk: medium; history import and lockfile convergence can hide sibling-path coupling
  - Files: import sibling repository at `apps/web`; create app/package manifests and `packages/contracts`; modify root `package.json`, `bun.lock`, `tsconfig.json`, `Makefile`, architecture checks, OpenAPI generation, and release workflow
  - Interfaces: produces root workspace commands and `@narrastage/contracts`; consumes existing OpenAPI artifact and sibling commit `00aa348`
  - Oracle order: workspace policy rejects sibling path; generated contract imports without server source; frozen install/check resolves one lockfile
  - Approved test migrations: package gate, packaging path, route path tests
  - Affected verify: `bun install && bun run workspace:check && bun run contracts:check` → exit 0
  - Manual/scripted probe: `make help` lists server, Web, desktop, aggregate build/test commands
  - Rollback: revert S1 commit if any source or package command still requires `../NarraStage-web`
  - Checkpoint: `0ea559af07f5ad8c4d0f477681cc6a44b0b71780`
  - Evidence: frozen root install, workspace policy, contract generation/typecheck, repository-local Web package, and provenance check passed; server 212/212 and imported Web 40/40 tests passed; Vite built 11,300 modules into a deterministic single-file renderer; `make help` exposes all app commands.

- [x] **S2 — Explicit server and desktop application ownership**
  - Covers: AC-002, AC-004, AC-008, RC-001, RC-006, NFR-004/010
  - Blocked by: S1 · Risk: high; path movement affects aliases, runtime data roots, bundling, Electron IPC, and native dependencies
  - Files: move `src` and `tests` into `apps/server`; move Electron main/preload/dev sources into `apps/desktop`; update TypeScript configs, build scripts, Electron builder, module checks, imports, and tests
  - Interfaces: `apps/server/src/app.ts` exports start/close; `apps/desktop/src/main.ts` consumes built server; both resolve repository `data` and packaged user data identically
  - Oracle order: source move type-check; server tests; build bundles; Electron credential probe; copied SQLite fixture opens
  - Approved test migrations: packaging and route paths
  - Affected verify: `bun run server:check && bun run desktop:check && bun run build:runtime` → exit 0
  - Manual/scripted probe: start moved server on an isolated data copy and request `/api/meta`
  - Rollback: revert S2 commit on data-root, alias, Electron IPC, or native-load mismatch
  - Checkpoint: `d0a27c73092ab6f4b99de43a81b1426ef99d1a54`
  - Evidence: server and desktop TypeScript 7 checks, module/architecture/route/OpenAPI checks, 212/212 server tests, three Bun runtime bundles, repository-local Web packaging/provenance, isolated SQLite `/api/meta` start/close, and Electron `safeStorage` round-trip/delete probes passed. User `data/db2.sqlite` and `HANDOFF.md` digests remained unchanged.

- [x] **S3 — Hono HTTP runtime with preserved API and Socket.IO**
  - Covers: AC-005, AC-010, AC-013, RC-002-005, NFR-002-004, NFR-007-009
  - Blocked by: S2 · Risk: high; request/response, body/upload, static-file, auth/error, and socket semantics can drift
  - Files: create `apps/server/src/http` Hono server/compatibility modules and tests; mechanically migrate route imports; modify route generator, middleware, server entry, package dependencies, and security/integration tests
  - Interfaces: `createApiServer(runtime)` returns Hono handler plus Node HTTP listener; compatibility router maps existing handler contract; Socket.IO attaches to the same listener
  - Oracle order: metadata route RED/GREEN; auth and error RED/GREEN; body/query/params; uploads/static/path traversal; generated route matrix; Socket.IO namespaces; remove Express dependency/imports
  - Approved test migrations: model-list API factory and route generator
  - Affected verify: `bun run server:check && bun run benchmark:http && bun run forbidden:check` → 208+ tests pass, benchmark has zero failures, no Express result
  - Manual/scripted probe: isolated server start, API/login/static/socket smoke, clean close
  - Rollback: revert S3 commit if any public route characterization, security test, or socket probe changes meaning
  - Checkpoint: `d06473b172ff60d4f9997c5e9eac0e4fd8dba9d7`
  - Evidence: Hono compatibility characterization and the complete 213/213 server suite passed; 100 local requests completed with zero failures; the isolated runtime served metadata and the embedded renderer, enforced the origin policy, kept the Script Agent Socket.IO namespace connected on the same listener, and closed cleanly. Express packages/imports were absent, the Electron vault probe passed, and all runtime bundles plus Web provenance regenerated successfully.

- [x] **S4 — React shell, routing, localization, projects, and provider settings**
  - Covers: AC-003, AC-008/009/013, RC-002/003/006, NFR-001/005/006/008/009
  - Blocked by: S3 · Risk: high; auth navigation, Electron bridge, locale state, and provider secrets cross trust boundaries
  - Files: replace `apps/web/src` Vue shell with React entry/router/layout/styles; preserve assets/locales/generated API; create API/query/store/i18n/provider/project components and tests; replace Web manifest/Vite/tsconfig/test setup
  - Interfaces: React hash router; typed API client; Zustand persisted preferences excluding secrets; TanStack Query server state; Electron credential bridge declarations
  - Oracle order: React runner RED/GREEN; login guard; project list/create form contract; seven locales; provider status and IPC; keyboard/a11y; bundle ceiling
  - Approved test migrations: Vue provider/model/compatibility/component tests to React/portable tests
  - Affected verify: `bun run web:check && bun run web:build && bun run forbidden:check` → exit 0, no Vue result, bundle under ceiling
  - Manual/scripted probe: Browser login/project/provider/navigation at `http://localhost:50188`
  - Rollback: revert S4 commit if React shell cannot independently build/run or leaks credential values
  - Checkpoint: `913a991193ae4036637978a50d880bff32c89acc`
  - Evidence: React 19.2.8, React Router 7.18.2, TanStack Query 5.102.2, Zustand 5.0.15, Vite 8.2.2, and TypeScript 7.0.2 run from one frozen lock. Native TypeScript checking, five Web tests, Oxfmt, Oxlint, the full Vue/Pinia forbidden scan, and production packaging passed. The single-file renderer is 311.63 kB (98.33 kB gzip), down from the 26,953.39 kB Vue baseline. Browser acceptance at `http://localhost:50188` completed login, empty state, project creation, project card rendering, seven-locale selection, and redacted provider-status navigation against an isolated Hono runtime; secrets remained unavailable to the browser surface.

- [x] **S5 — React conversation, image, and video production tracer bullets**
  - Covers: AC-009-013, RC-004/005, NFR-005-009
  - Blocked by: S4 · Risk: high; streaming/reconnect and paid-job idempotency are user-critical
  - Files: create React conversation/socket, generation form/job/result, asset, and production surfaces and tests; port framework-neutral request builders/job stores/hooks; add deterministic end-to-end fixture server and browser acceptance
  - Interfaces: `useAgentConversation`, `useGenerationJobs`, typed image/video capability forms, durable job cards, owned media viewer
  - Oracle order: conversation stream terminal/error/reconnect; image idempotent success/error; video poll success/error/cancel; provider unavailable; keyboard and visible status
  - Approved test migrations: Vue chat/generation/job/idempotency tests to React/portable tests
  - Affected verify: `bun run web:check && bun run acceptance:deterministic` → all named P1 flows pass without external spend
  - Manual/scripted probe: Browser executes conversation, image, and video workflow against deterministic adapters and inspects console errors
  - Rollback: revert S5 commit on duplicate submission, lost terminal state, inaccessible control, or unusable media result
  - Checkpoint: `741d52ec0ae9387ef09a08249450155955657f42`
  - Evidence: TypeScript 7 compilation, Oxlint/Oxfmt, eight Web tests, and the deterministic product acceptance passed. The acceptance covers login/catalog, Socket.IO streamed conversation terminal state, image/video idempotent submission, polling, owned media authorization, and non-empty media bytes. Browser acceptance at `http://localhost:50188` exercised the same three-stage UI: the conversation streamed to complete, the image decoded and rendered, and the video resolved to an authenticated Blob URL in the playable media element. A first browser pass exposed an invalid fixture-relative preview path; the fixture was corrected to exercise the production-owned media endpoint and the same browser path then passed.

- [x] **S6 — Contracted legacy removal, embedded renderer, desktop package, and CI**
  - Covers: AC-001-013, RC-001-006, NFR-001-010
  - Blocked by: S5 · Risk: high; final deletion and packaging can strand runtime artifacts or platform releases
  - Files: delete all Vue/Express/legacy sibling artifacts; update provenance/package scripts, embedded `data/web`, build manifest, README, Makefile, Lefthook, Dockerfile, release workflow, and package tests; add final runtime/architecture gates
  - Interfaces: one root `bun run check/build/pack`; repository-local renderer manifest; unchanged API compatibility metadata and release evidence
  - Oracle order: forbidden scan; frozen install; aggregate check; deterministic acceptance; embedded standalone runtime; Electron dev; macOS unpacked package; secret/provenance/release gates; clean diff
  - Approved test migrations: package/release/provenance expected paths only
  - Affected verify: `make check && bun run pack:local` → exit 0; signed provider evidence remains a separately reported fail-closed Feature 001 release gate
  - Manual/scripted probe: Browser embedded runtime plus Electron unpacked runtime; verify project, conversation, image, video, provider settings, and clean shutdown
  - Rollback: revert S6 commit if any final gate or runtime probe fails; do not delete user runtime data
  - Checkpoint: `1f08684cfe7fe12228606a0b08203b7fd615d020`
  - Evidence: frozen workspace checks report 3 apps, 1 package, and no Vue/Express; Web 20/20 and Server 225/225 pass; the single-file React renderer is 406.44 kB (125.89 kB gzip). Deterministic acceptance proves exact project pins, scripts/assets/jobs, streamed conversation, idempotent owned image, and keyframe video. Browser acceptance selects the saved image/video offerings, renders both media results (`video.readyState=4`), and reports no console errors. The tracked Web and server bundles are regenerated and diff-checked by the aggregate gate. The macOS arm64 unpacked package starts successfully and its 2.0.0→2.1.0 probe proves `/api/meta`, thumbnail and owned-asset Node paths, React replacement, and preservation of custom vendor source/database row plus edited skill. The package is unsigned because no local Developer ID identity exists; secret scanning passes.

## Coverage matrix

| Active AC/RC/NFR | Slice(s) | Final Verify method |
|---|---|---|
| AC-001 | S1, S6 | command — workspace and frozen install |
| AC-002 | S1, S2, S6 | test — architecture ownership and import boundaries |
| AC-003 | S4, S6 | command — React Web check/build and forbidden scan |
| AC-004 | S1, S2, S6 | test — TypeScript workspace policy and aggregate type-check |
| AC-005 | S3, S6 | test — Hono route characterization/integration and forbidden scan |
| AC-006 | S1, S6 | test — generated contract identity and stale-client failure |
| AC-007 | S1, S6 | command — repository-local Web package and provenance diff |
| AC-008 | S2, S4, S6 | probe — desktop dev and unpacked package |
| AC-009 | S4, S5, S6 | browser probe — guarded P1 surface traversal |
| AC-010 | S3, S5, S6 | integration + browser — deterministic Socket.IO conversation |
| AC-011 | S3, S5, S6 | integration + browser — idempotent deterministic image job |
| AC-012 | S3, S5, S6 | integration + browser — idempotent deterministic video job |
| AC-013 | S3-S6 | test — fail-before-network security/preflight matrix |
| RC-001 | S2, S6 | test — copied pre-migration SQLite fixture |
| RC-002 | S3, S4, S6 | test — auth/origin/body gates |
| RC-003 | S3, S4, S6 | test — credential and secret gates |
| RC-004 | S3, S5, S6 | test — generation and fault suites |
| RC-005 | S3, S5, S6 | test — socket contract suite |
| RC-006 | S1, S2, S4, S6 | test + probe — provenance/package/release and desktop |
| NFR-001 | S4, S6 | command — bundle-size ceiling |
| NFR-002 | S3, S6 | command — 100-request Hono benchmark, zero failure |
| NFR-003 | S3, S4, S6 | test — security/static traversal suites |
| NFR-004 | S2, S3, S6 | test — storage and telemetry scans |
| NFR-005 | S4, S5, S6 | test + browser — accessibility and keyboard traversal |
| NFR-006 | S4, S6 | test — seven-locale completeness and persistence |
| NFR-007 | S3, S5, S6 | test — unchanged generation crash/retry matrix |
| NFR-008 | S3, S4, S5, S6 | integration — visible and redacted log errors |
| NFR-009 | S3, S4, S6 | test — client/server compatibility matrix |
| NFR-010 | S1, S2, S6 | workflow test + local macOS package |

## Deviations and amendments

| ID/date | Level | Expected / found / impact | Resolution and approval |
|---|---|---|---|
| D-001 2026-08-24 | PLAN | Baseline handoff said `bun run build` passed; fresh HEAD fails embedded backend source revision. This affects S1/S6 baseline only and confirms sibling-provenance coupling. | Record exact known-red fingerprint; do not refresh legacy bundle before S1; approved scope already replaces the coupling. |
| D-002 2026-08-24 | Code | The imported Vue compiler (`vue-tsc` 3.3.11) requires the removed TypeScript `./lib/tsc` subpath and cannot run on the required TypeScript 7.0.2. Web Vitest remains 40/40 and Vite production build remains the interim behavior oracle. | Keep TypeScript 7.0.2, record the exact incompatibility, and replace the Vue compiler with native React TypeScript checking in S4; no requirement or final gate changes. |
| D-003 2026-08-24 | Code | Hono's generic CORS middleware finalizes headers through its Fetch response, while the compatibility boundary intentionally streams some existing route responses directly through Node. Applying both paths produced `ERR_HTTP_HEADERS_SENT` in the first runtime probe. | Keep the exact local-origin policy and write its validated CORS headers directly to the Node response before dispatch. The repeat runtime probe is clean and verifies accepted, absent, and rejected origins. |
| D-004 2026-08-24 | Code | Independent final-candidate review found that versioned desktop replacement included user-editable vendor/skill directories, two packaged asset paths still required Bun, React did not fully materialize capability constraints or project pins, and delayed history could overwrite new state. | Preserve mutable runtime directories by merge, make server bundles Node-only, execute sparse/conditional capability rules, persist exact image/video offerings, and epoch/merge conversation history. Focused tests, the aggregate gate, Browser, and the package upgrade probe all pass after the fixes. |
| D-005 2026-08-24 | Code | The expanded owned-media package probe returned HTTP 204 even though upload succeeded; the Hono compatibility `sendFile` stream had not committed headers before its empty-response guard ran. | Commit headers before piping the file, add a same-listener regression test, and rerun the packaged owned-media upload/read path successfully. |
| D-006 2026-08-24 | Code | The second independent review found stale Web provenance, exact image offerings overwriting the legacy image model, eager Node media reads, and incomplete Veo mode constraints. | Refresh provenance, add nullable exact image selection while preserving legacy consumers, use lazy Node blobs, intersect capability constraints, and prove the real Veo extend payload. All four findings were fixed in `1cfd1781`. |
| D-007 2026-08-24 | Code | The third independent review found that the tracked production server bundle had not been committed and that DeepSeek owned files were opened before its 64 MiB provider limit. | Regenerate and commit the server bundle, add an aggregate artifact freshness gate, reject oversized path/Blob sources before content access, and retain optional `imageOfferingId` for legacy project clients. The fourth review accounted for all 8 changed paths and passed. |

## Noticed, not touched

- Signed provider evidence and trust documents are empty by design — Feature 001 — no release claim or key mutation in this plan.
- `data/db2.sqlite` is ignored user runtime data — repository root — never delete or use directly in destructive tests.
- Sibling `../NarraStage-web` remains clean and unchanged — imported read-only; future archival is outside this repository task.

## Review log

| Round | Candidate digest | Independent? | Findings C/I/M | Fixed / disproved / open | Verdict |
|---|---|---|---|---|---|
| 1 | `abb9d02f` | yes — isolated read-only Codex review, 534/534 changed paths accounted | 1/3/1 | 5 fixed, 0 disproved, 0 open | block before fixes |
| 2 | `a4cfea2f` | yes — isolated read-only Codex follow-up | 0/3/1 | 4 fixed, 0 disproved, 0 open | block before fixes |
| 3 | `1cfd1781` | yes — isolated read-only Codex follow-up, 20/20 paths accounted | 0/2/0 | 2 fixed, 0 disproved, 0 open | block before fixes |
| 4 | `1f08684c` | yes — isolated read-only Codex follow-up, 8/8 paths accounted | 0/0/0 | 0 fixed, 0 disproved, 0 open | pass |

## Delivery report

### Requirement evidence

| AC/RC/NFR | Verify method | Command/probe + result | Candidate | Time |
|---|---|---|---|---|
| AC-001-007, AC-013, RC-002-006, NFR-001-004/006-009 | aggregate commands and unit/integration/fault/contract gates | frozen install plus `make check`: Web 20/20, Server 225/225 with 1205 expectations, deterministic acceptance and tracked-artifact checks pass | `1f08684c` | 2026-08-24 |
| AC-008-012, RC-001/004-006, NFR-004/005/010 | Browser plus unpacked macOS package probes | saved offering pins selected; image and video render; package upgrade, Node media paths, custom vendor/skill/database preservation and secret scan pass | `1f08684c` | 2026-08-24 |

### CI / full-suite / coverage limits

- Local macOS arm64 unpacked packaging and launch pass. The app is unsigned/unnotarized because the machine has no Developer ID identity. Windows/Linux interactive GUI acceptance remains remote CI; signed paid-provider evidence remains Feature 001 and no paid-provider quality claim is made here.

### Mutation/sensitivity

| Requirement/risk | Mutation | Caught by | Isolated restore digest |
|---|---|---|---|
| AC-006/007 stale contract/provenance | isolated generated-artifact/source mismatch | contract/provenance gate | detached scratch worktree restored cleanly |
| AC-011/012 duplicate submission | deterministic repeated request and crash matrix | job idempotency/fault suites | in-memory/temporary fixtures removed |
| RC-003 secret leakage | configured canary across packaged artifacts | secret scan | package artifacts contain no canary |
| RC-001/NFR-004 destructive upgrade | 2.0.0 user-data fixture with custom vendor row/source and edited skill | unpacked Electron package probe | isolated user-data directory removed |

### Exploration

| Charter/oracle | Probe | Observation/evidence | Verdict |
|---|---|---|---|
| API/runtime | standalone Hono route/origin/socket/media matrix | metadata, auth/origin, Socket.IO, upload and streamed `sendFile` paths pass | pass |
| Web/a11y | Browser P1 navigation and generation workflow | guarded login, projects/scripts/assets/jobs/providers, saved pins, seven locales, image/video rendering, no console error | pass |
| Desktop | unpacked macOS arm64 2.0.0→2.1.0 launch | React renderer, random-port API, Node media, mutable data preservation and clean shutdown pass | pass |
| Job reliability | deterministic image/video retry/cancel/restart | exact offerings, idempotency, ownership, polling and fault matrix pass | pass |

### Waivers, open work, and remaining risk

- Independent SPEC review was waived through the user's explicit autonomous-decision instruction. Four independent implementation review rounds were run; the first three blocked on 11 total findings, every finding was fixed, and the final frozen-candidate review passed with 8/8 paths accounted.
- Windows/Linux GUI launch and signed paid-provider evidence cannot be proven by local deterministic checks and do not raise local state above their actual evidence. macOS signing/notarization also remains a release-operator responsibility.

### Clean-checkout demo

1. `bun install --frozen-lockfile && make check` → one-workspace install, all checks pass, and tracked Web/server artifacts match repository source.
2. `bun run acceptance:deterministic` → login/project, conversation, image, and video acceptance pass without external spend.
3. `bun run dev` → standalone React UI opens against Hono at `http://localhost:10588`.
4. `bun run dev:desktop` → Electron loads the same renderer and closes cleanly.

### State evidence

- Locally verified: complete for the macOS/local deterministic boundary described above.
- Ready for integration: yes; the final independent review passed and the authorized push is the remaining delivery action. Target-platform CI remains required for Windows/Linux artifacts.
- Integrated: not in scope without merge evidence.
- Released: not in scope without deployment and signed provider evidence.
