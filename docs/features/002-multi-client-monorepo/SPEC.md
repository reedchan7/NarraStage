# Feature 002 — Multi-client React monorepo modernization

- Status: Implemented and locally verified
- Assurance: deep
- Spec version: 1 · Created: 2026-08-24 · Owner: reedchan7
- Base revision: e2a2547028dc6eaf70cb70e714368df48f06d617
- Raw ask: “这一次我们的目标是项目支持前后端客户端等多端。当前项目的目录结构并不是天生考虑过多端的场景的，前端代码甚至不在当前目录下而在另一个项目里。我们把项目按软件开发的最佳实践把目录结构重新规划一下，划分好各端，并且要把前端也加进来这次，而不是分开的项目。所以，前端的编译构建打包方式等等也都要适配下。另外，我不喜欢 Vue。我们需要全面的换成最新的React 生态最新版，TypeScript 统一用 7.0+。后端的话，我也不喜欢 Express 这个老框架，我喜欢现在前端最快的那个流行框架，你也要换下。记得做好计划，时刻测试验证，阶段性运行验收，确保代码质量与最终交付的可正常运行工作和生图生视频。对话正常。”
- Research: ./RESEARCH.md

## Problem and evidence

NarraStage's backend, provider platform, Electron main process, generated Web bundle, and release evidence live in this repository, while the editable Vue Web client and its Yarn toolchain live in `../NarraStage-web`. Every release job reconstructs that two-repository relationship, and the latest backend HEAD already fails the embedded Web provenance gate when the sibling-derived bundle is stale. The target is a single workspace whose server, Web, desktop, and typed-client boundaries can evolve together while the user-visible conversation, image, and video workflows remain usable.

| Evidence | Class | Source | Limitation |
|---|---|---|---|
| Release CI separately checks out and builds `HBAI-Ltd/Toonflow-web`. | observed | `.github/workflows/release.yml:28` | Does not by itself prove a monorepo is the only solution. |
| The root package hard-codes `../NarraStage-web`; current `bun run build` fails `embedded Web backend source revision mismatch`. | measured | `package.json:39`; baseline run 2026-08-24 | The immediate manifest can be refreshed without restructuring. |
| The migration exposure is 96 Vue SFCs / 35,548 lines and 192 server files importing Express. | measured | `RESEARCH.md` | Counts do not prove equal effort per file. |
| Server 208/208 tests and Web 40/40 tests, type-check, and production build pass independently. | measured | baseline runs 2026-08-24 | Paid provider and packaged desktop live paths were not exercised. |

**Case against, and why proceed:** A framework and directory rewrite does not directly create customer value, and a single cutover could regress a working production editor. A smaller repository-only change would repair provenance faster. The user has explicitly rejected Vue/Express and authorized the complete migration; the chosen expand-and-contract sequence therefore preserves working behavior at each boundary and uses existing OpenAPI, provider, job, and packaging tests as stop conditions.

## Outcome hypothesis

- Baseline: Two repositories, two package-manager flows, a 26,953.39 kB single-file Web output, green independent checks, and a red combined App build caused by stale cross-repository provenance.
- Target: One clone and one Bun install can develop, test, build, run, and package the server, React Web client, Electron desktop client, and shared API contracts while preserving the named product workflows.
- Measurement: Workspace quality/build/package commands, API integration tests, browser probes, and an Electron launch probe on the frozen candidate.
- Decision rule: Complete only if Vue and Express are absent from source/dependencies, all deterministic gates pass, and the migrated runtime demonstrates login/project access, conversation, image generation, and video generation at the highest locally available seam; otherwise retain the last green migration slice and revise.

## Goals

- Establish one Bun workspace with explicit `apps/server`, `apps/web`, `apps/desktop`, and `packages/contracts` ownership.
- Import the maintained Web source into this repository and replace all Vue runtime/source dependencies with React 19.2.
- Replace the Express server runtime with Hono while preserving HTTP, auth, static media, Socket.IO, and durable generation contracts.
- Standardize TypeScript 7.0.2 and current build/test tooling across every TypeScript workspace.
- Preserve standalone Web, embedded Electron, conversation, image generation, video generation, provider settings, and release-evidence behavior.
- Make future clients consume generated/versioned contracts without importing server internals.

## Non-goals

- Shipping a native iOS, Android, or React Native application in this migration.
- Changing provider pricing, model offering policy, stored project schema, authentication model, credential ownership, or release-evidence truth requirements.
- Redesigning provider protocols or performing an unbounded paid live-acceptance campaign.
- Preserving obsolete duplicate/copy files, undocumented test-only screens, or exact Vue component implementation details when the same required workflow is preserved.

## Global constraints

- Root package manager is Bun 1.4.1 with minimum Bun 1.4.0; one root `bun.lock` is authoritative.
- All workspace TypeScript compilation uses exactly TypeScript 7.0.2 or a later explicitly approved 7.x patch; no workspace may pin TypeScript below 7.0.
- Web runtime uses React/React DOM 19.2.8 and Vite 8.2.2 as the implementation baseline; refresh only patch versions if registry evidence and the full gate remain green.
- Server HTTP composition uses Hono 4.13.3; `express`, `express-ws`, Express type packages, Vue, Pinia, Vue Router, Vue Test Utils, and Vue build plugins are forbidden in the delivered dependency graph and source imports.
- Public API paths, response bodies/statuses, Socket.IO namespaces, SQLite data, provider offering identities, job idempotency, credential redaction, and local-origin policy remain compatible unless this SPEC explicitly says otherwise.
- Existing provider release evidence remains fail-closed. No missing credential, signature, or paid live result may be presented as release-ready support.
- No production deployment or production data write is in scope. The user authorizes local edits, local runtime data needed for isolated tests, commits, and push to the current branch.
- Every migration slice must end with a runnable command and a content-identified rollback point.

## User stories

1. **[P1]** As a maintainer, I want every executable surface in one workspace, so that shared contracts and releases are changed and verified atomically.
   Independent demonstration: a clean checkout installs once and root help exposes per-app and aggregate commands.
2. **[P1]** As a Web or desktop user, I want the React client to preserve the NarraStage creation journey, so that modernization does not remove conversation or media production.
   Independent demonstration: the same React build runs standalone and inside Electron and completes the named local acceptance script.
3. **[P1]** As a future client developer, I want a versioned generated API client boundary, so that a new client does not import server implementation files.
   Independent demonstration: a package-level contract test consumes the generated client with no server-source import.

## Acceptance criteria

- **AC-001** WHEN a clean checkout runs `bun install --frozen-lockfile` THE SYSTEM SHALL resolve every app and shared package from one root lockfile without a sibling repository.
  Verify: command — `bun install --frozen-lockfile && bun run workspace:check` exits 0 with no path outside the repository.
- **AC-002** THE SYSTEM SHALL organize executable ownership under `apps/server`, `apps/web`, and `apps/desktop`, with generated client contracts owned by `packages/contracts`.
  Verify: test — architecture check rejects executable source at legacy root paths and rejects cross-app implementation imports.
- **AC-003** WHEN the Web client builds THE SYSTEM SHALL produce a React 19.2/Vite 8 application with no Vue source, plugin, runtime, or dependency.
  Verify: command — Web type/test/build passes and the forbidden-dependency/import scan returns no Vue-family result.
- **AC-004** WHEN any workspace type-check runs THE SYSTEM SHALL use TypeScript 7.x and reject a package manifest that selects an older compiler.
  Verify: test — workspace policy test checks the resolved compiler and every manifest; aggregate type-check exits 0.
- **AC-005** WHEN the API server starts THE SYSTEM SHALL serve existing HTTP routes through Hono with no Express runtime or dependency.
  Verify: test — API characterization/integration suite exercises login, auth errors, JSON/forms, params/query, uploads, static assets, 404, and error mapping; forbidden-dependency/import scan returns no Express result.
- **AC-006** WHEN public OpenAPI changes THE SYSTEM SHALL regenerate a versioned contract package and make stale Web/client bindings fail the quality gate.
  Verify: test — mutate a scratch OpenAPI digest and assert contract/provenance checks fail, then restore bytes and pass the aggregate gate.
- **AC-007** WHEN the Web build is packaged THE SYSTEM SHALL derive its provenance from the same repository revision and embed the verified bundle without a sibling checkout.
  Verify: command — `bun run web:package && bun run provenance:source:check && git diff --exit-code -- data/web data/contracts/web-build.json` exits 0 on the frozen candidate.
- **AC-008** WHEN desktop development and packaging run THE SYSTEM SHALL load the React renderer, start the Hono server on an allowed loopback port, and retain the credential IPC boundary.
  Verify: probe — launch the development desktop app and the unpacked macOS candidate; observe the project screen, successful `/api/meta`, trusted credential status, and clean shutdown without uncaught errors.
- **AC-009** WHEN an authenticated user opens the creation workspace THE SYSTEM SHALL expose projects, scripts/story input, conversation, assets, production jobs, and provider settings as reachable React surfaces with guarded navigation.
  Verify: browser probe — traverse each named surface in standalone mode; direct unauthenticated access redirects to login and authenticated navigation preserves the selected project.
- **AC-010** WHEN a conversation is submitted through a configured or deterministic test provider THE SYSTEM SHALL stream assistant output, support stop/reconnect behavior, and leave the UI usable after completion or failure.
  Verify: integration + browser test — exercise the Socket.IO conversation namespace with a deterministic provider and assert progressive output, terminal state, and error recovery.
- **AC-011** WHEN a valid image request is submitted through the deterministic generation adapter THE SYSTEM SHALL create one durable job, render status changes, and expose the owned image result without duplicate provider submission.
  Verify: integration + browser test — submit with a stable idempotency key, observe queued-to-succeeded state and image rendering, retry, and assert the same job/result.
- **AC-012** WHEN a valid video request is submitted through the deterministic generation adapter THE SYSTEM SHALL create one durable job, render polling/status changes, and expose playable owned video without duplicate provider submission.
  Verify: integration + browser test — submit, observe queued-to-succeeded state and video metadata/playback, retry, and assert the same job/result.
- **AC-013** IF credentials, origin, media type, provider availability, or generation input are invalid THEN THE SYSTEM SHALL fail visibly using the preserved safe status/error contract and SHALL NOT submit a paid provider request.
  Verify: test — security, preflight, upload, and provider adapter suites assert fail-before-network behavior and redacted output.

## Regression contract

- **RC-001** THE SYSTEM SHALL CONTINUE TO open existing SQLite project data without a destructive migration WHEN the new server and React clients start.
  Consumer: existing desktop installations.
  Verify: test — integration test using a copied pre-migration fixture and schema/version assertions.
- **RC-002** THE SYSTEM SHALL CONTINUE TO enforce login JWT, public-route allowlist, 100 MB body ceiling, and active-loopback origin policy WHEN Hono handles requests.
  Consumer: Web/desktop API clients.
  Verify: test — API security characterization suite.
- **RC-003** THE SYSTEM SHALL CONTINUE TO keep provider credential values out of REST, logs, Web storage, and packaged artifacts WHEN provider settings are read or changed.
  Consumer: users and release operators.
  Verify: test — credential tests, secret scan, and Electron IPC probe.
- **RC-004** THE SYSTEM SHALL CONTINUE TO preserve exact offering pins, durable job transitions, idempotency, crash reconciliation, and principal-scoped owned media WHEN React initiates image/video generation.
  Consumer: generation workflows.
  Verify: test — existing generation/fault suites plus React job-store integration tests.
- **RC-005** THE SYSTEM SHALL CONTINUE TO expose `/api/socket/productionAgent` and `/api/socket/scriptAgent` with reconnectable Socket.IO semantics WHEN the HTTP framework changes.
  Consumer: conversation/agent clients.
  Verify: test — socket contract tests and deterministic browser conversation probe.
- **RC-006** THE SYSTEM SHALL CONTINUE TO package one trusted renderer and fail closed on stale contract, source, evidence, or secret artifacts WHEN release commands run.
  Consumer: desktop release pipeline.
  Verify: test — package/provenance/release-gate tests and macOS unpacked package smoke.

## Non-functional requirements

- **NFR-001** Under the production Web build command, THE SYSTEM SHALL emit an embedded renderer no larger than the measured 26,953.39 kB baseline and SHALL report bundle sizes in CI.
  Verify: command — build-size script compares output bytes with the recorded ceiling and exits nonzero above it.
- **NFR-002** Under 100 concurrent local metadata requests after warm-up, THE SYSTEM SHALL have zero non-2xx responses and record latency/throughput without asserting a vendor benchmark as product performance.
  Verify: command — repository benchmark script runs against the Hono server and stores a bounded console summary.
- **NFR-003** Under auth, credential, media import, and local-file access tests, THE SYSTEM SHALL preserve current deny-by-default authorization, redaction, SSRF, path, and MIME protections.
  Verify: test — existing security/asset suites plus Hono static-file traversal cases pass.
- **NFR-004** Under local/packaged operation, THE SYSTEM SHALL retain existing user project/media data locally and SHALL introduce no new telemetry, cloud retention, or credential persistence channel.
  Verify: test — dependency/config scan and fixture test assert unchanged storage owners and absence of telemetry endpoints.
- **NFR-005** WHEN the React shell and named P1 surfaces are inspected at keyboard and semantic seams THE SYSTEM SHALL expose one page heading, labeled controls, visible focus, keyboard navigation, and no automated serious accessibility violation.
  Verify: test + browser probe — component accessibility tests and keyboard traversal on login, project, conversation, generation, and provider settings.
- **NFR-006** WHEN any of the seven existing locale catalogs is selected THE SYSTEM SHALL render without missing-key crashes and preserve the locale choice across reload.
  Verify: test — locale completeness and persistence matrix across `zh-CN`, `zh-TW`, `en`, `ja-JP`, `ru-RU`, `th-TH`, and `vi-VN`.
- **NFR-007** WHEN one generation job is retried, cancelled, resumed, or recovered after a process restart THE SYSTEM SHALL issue no duplicate paid submission beyond the existing state-machine contract.
  Verify: test — existing fault matrix passes without assertion weakening.
- **NFR-008** WHEN server or client runtime errors occur THE SYSTEM SHALL emit a redacted diagnostic with route/job context and show an actionable user-visible error state.
  Verify: integration test — inject route, socket, and generation failures and assert both redacted log and visible state.
- **NFR-009** WHILE standalone Web and packaged desktop clients overlap during rollout THE SYSTEM SHALL negotiate the existing API contract range and reject incompatible builds before paid generation.
  Verify: test — compatibility matrix covers current and stale generated-client metadata.
- **NFR-010** Under Windows, macOS, and Linux CI packaging THE SYSTEM SHALL use repository-local Web source and the one frozen lockfile; platform-specific native dependencies remain explicit.
  Verify: command — workflow policy test plus platform build jobs; local completion requires macOS packaging, other platforms require syntactic/policy validation until CI runs.

## Design decisions

- Approach: compatibility-first Hono/React strangler in one Bun workspace. It wins over a minimal root-only reorganization because ownership remains ambiguous, and over a Bun-exclusive Elysia rewrite because Hono's Web Standards portability, adoption, and Node HTTP integration reduce migration risk while remaining fast.
- Repository interfaces: `apps/server` owns HTTP/domain/runtime code and server integration tests; `apps/web` owns the React renderer and browser tests; `apps/desktop` owns Electron main/preload/dev code; `packages/contracts` owns generated OpenAPI client types and compatibility metadata. Root tooling owns cross-package build, provenance, packaging, and release checks.
- Server transition: characterize legacy behavior, introduce a Hono-native server and a bounded compatibility adapter for mechanical route conversion, then prohibit Express imports/dependencies. New and security-sensitive routes use Hono context directly; compatibility behavior is tested and remains internal to the server app.
- Web transition: preserve API/i18n/assets that are framework-neutral, build a new React shell and P1 surfaces, port stores to Zustand/TanStack Query and sockets to React hooks, then remove every Vue SFC and Vue dependency. Duplicate `copy` files and test-only legacy screens are not migrated.
- Contract state: public APIs and SQLite schemas do not change solely for this migration; generated client identity moves into `packages/contracts` and remains digest-bound to the embedded renderer.
- Test seams: server API factory with injected runtime/data directory; deterministic Socket.IO agent; deterministic synchronous image and polled-video adapters; React Testing Library; browser standalone runtime; Electron unpacked runtime; existing release/provenance gates.

## Rollout and rollback

- Delivery mechanism / default: repository-local staged commits; no feature flag is needed because there is no production deployment in scope.
- Deployment order and mixed-version rule: import/build graph → server/desktop path move → Hono runtime behind unchanged API → React shell/P1 flows → remove Vue/Express → embedded bundle/provenance → desktop packaging. Existing API contract metadata rejects incompatible standalone clients.
- Observability / decision threshold: each slice must pass its affected checks and same-path runtime probe; any new test failure, uncaught runtime error, duplicate job submission, stale provenance, or credential exposure stops the next cutover.
- Rollback or forward-fix boundary: before a data/schema change, reset to the last green commit is sufficient; because stored-data changes are excluded, no irreversible backfill is allowed. After the final push, revert the failing slice commit if a platform CI job disproves it.
- Cleanup/contract trigger: delete sibling-path CI, Vue/Express dependencies, compatibility-only source, and stale generated artifacts only after React/Hono replacements pass the aggregate gate and runtime probes.

## Testing decisions

- Automated: per-package format/lint/type/test/build; server API/security/socket/generation/fault suites; contract/provenance/package/release checks; React component/store/router tests; architecture and forbidden-dependency scans.
- Scripted/manual probes: current Browser baseline, migrated standalone Browser navigation, deterministic conversation/image/video flows, provider settings, Electron dev launch, unpacked macOS launch, and clean shutdown.
- Deliberately not tested: real Windows/Linux GUI launch locally — owner: CI; risk is bounded by workflow validation and target-platform build jobs. Paid provider output quality and signed release evidence remain governed by Feature 001 and cannot be inferred from deterministic adapters.

## Implementation result

- The delivered workspace contains `apps/server`, `apps/web`, `apps/desktop`, and `packages/contracts` under one Bun lockfile. Vue and Express source/dependencies are prohibited by an automated gate; React 19.2.8, Hono 4.13.3, and TypeScript 7.0.2 are the frozen implementation versions. The aggregate gate also regenerates and diff-checks the tracked Web and production server artifacts.
- The React client exposes authenticated projects, scripts, assets, conversation, image/video generation, durable jobs, provider settings, and seven locales. Generation forms execute the server capability schema, retain exact project offering pins, upload principal-owned media, and reject an incompatible API contract before submission.
- The unpacked macOS Electron candidate starts the bundled Node/Hono server and React renderer on an isolated loopback port. Its 2.0.0-to-2.1.0 probe replaces immutable runtime code while retaining the SQLite database, custom vendor source and row, edited skills, and owned media.
- Local deterministic evidence proves conversation plus image/video workflow mechanics without external spend. It is not evidence of paid-provider output quality, signed release readiness, or Windows/Linux GUI execution.

## Assumptions

- Native mobile is a future client consuming `packages/contracts`, not an executable deliverable now — source: the ask names multi-end structure but only explicitly requires current frontend/backend/client behavior; reverse when a native mobile acceptance flow is requested.
- The current local SQLite file is user data and will not be deleted, moved, or used for destructive tests — source: repository ignore state and safety constraint; reverse only with explicit backup/migration authority.
- React rebuilding may simplify unrequired duplicate/test-only Vue screens while preserving the named P1 workflows — source: user acceptance wording and measured duplicate files; reverse if runtime evidence shows a removed screen is required for a P1 workflow.

## Deferrals

- Native iOS/Android implementation — owner: reedchan7; revisit after the shared contract package and Web/desktop rollout are stable.
- Signed paid-provider release evidence and MiniMax-official enablement — owner: protected release workflow; revisit when keys, approved budget, executor key, and two independent reviewer keys are provisioned under Feature 001.
- Windows/Linux interactive GUI smoke — owner: platform CI/release operator; revisit on the first candidate CI artifacts.

## Limitations

- No product analytics quantify maintenance savings or migration user value; completion is a behavior/operability result.
- Hono/Elysia published benchmarks do not model NarraStage's database, media, sockets, or Electron workload; selection uses compatibility and adoption evidence, not a claim of universal fastest throughput.
- The design review is a disclosed non-independent self-review because the user instructed the agent to make and approve decisions without pausing; implementation still requires a bounded code review and full evidence gates.

## Decision log (append-only)

| Date | Version | Entry | Approved by |
|---|---:|---|---|
| 2026-08-24 | 1 | Draft created (assurance: deep) | — |
| 2026-08-24 | 1 | Q: pause for framework/topology/scope approval? → A: user authorized autonomous decisions and instructed completion without further approval pauses. | reedchan7 |
| 2026-08-24 | 1 | Selected one Bun workspace, Hono, React 19.2/Vite 8, TypeScript 7.0.2, and staged compatibility-first migration. | reedchan7 via delegated decision authority |
| 2026-08-24 | 1 | Approved version 1 · normative digest a575655241d1c870260dbb3ac44a930ae28fb41a8dcf71d4045700f00c7f384b for implementation | reedchan7 via delegated decision authority |
| 2026-08-24 | 1 | Implementation completed locally with aggregate, Browser, deterministic product, and unpacked macOS package evidence; platform CI and paid-provider release evidence remain explicitly separate. | reedchan7 via delegated decision authority |
| 2026-08-24 | 1 | Four independent implementation reviews completed; all 11 blocking findings from the first three rounds were fixed and the final frozen-candidate review passed. | reedchan7 via delegated decision authority |
