# Plan — Feature 001 全栈多模态 Provider Platform

- SPEC: ./SPEC.md · version: 4 · normative digest: eaaf9fca4e4d8e23895dd3d9a88cdbb5a2fbe4229d45d41b503c8187bc99f9fa
- Approved design: ./DESIGN_PLAN.md
- Assurance: deep
- Base revisions: Toonflow-app `56f88fb6034cea88266f3cd324a8a176a77ea5a9`; Toonflow-web `9c4cb0ec7d4f6b4067c7768e2df8cdc7f8587214`
- Worktrees: `main@/Users/reedchan/Workspaces/github/reedchan7/Toonflow-app`; detached baseline at `/Users/reedchan/Workspaces/github/reedchan7/Toonflow-web`
- Candidate mode: local-content-manifest
- Authority: edit yes · commit no · branch no · push no · PR no · merge no · deploy no · paid live API no until its slice budget gate
- Created: 2026-08-23 · Current phase: 7

## Workflow gates

- [x] P1 Baseline and blast radius established
- [x] P2 PLAN validated and required gate approved
- [ ] P3 All slices checkpointed
- [ ] P4 Integration/requirement/sensitivity evidence closed
- [x] P5 Review closed with no real Critical/Important code finding open
- [ ] P6 Applicable exploratory charters closed
- [ ] P7 Readiness report validated

The owner's in-thread “可以开始实现了，批准” pre-authorizes the approved SPEC v4 and this exact implementation sequence. It does not authorize Git publication, deployment, external account mutation, or unbudgeted paid generation.

## Candidate and unrelated-work inventory

| Path/state | SHA-256 / identity | Owner | Must remain unchanged? |
|---|---|---|---|
| Toonflow-app HEAD/index | `56f88fb6034cea88266f3cd324a8a176a77ea5a9`; tracked tree clean at pickup | repository baseline | unrelated paths yes |
| `docs/features/001-multimodal-provider-architecture/SPEC.md` | `e38b2c579a7354c09ad10cc929c17aee1c813a6b40b35e332390fd60270dd00e`; normative digest above | task | yes except implementation status/amendment |
| `docs/features/001-multimodal-provider-architecture/RESEARCH.md` | `50605aca66a76c211174ed2ca8804723c4f060ac163bb374397ea08c10827443` | task | append-only evidence allowed |
| `docs/features/001-multimodal-provider-architecture/DESIGN_PLAN.md` | `8d17eecdae4d0dc5a730b6c2834389c6d378251d9b4d7918bec4792979ac5de0` | task | yes |
| Toonflow-web HEAD | `9c4cb0ec7d4f6b4067c7768e2df8cdc7f8587214`, detached local clone | repository baseline | unrelated paths yes |
| Toonflow-web `vite.config.js`, `vite.config.d.ts` | baseline `vue-tsc --build --force` emissions, SHA-256 `36eed22a…` / `4b96dd19…` | task-generated artifact | remove before first checkpoint |
| unrelated tracked/staged/unstaged files | none in either repository at pickup | user | yes |

This PLAN is self-referential and is checkpointed by each slice manifest rather than a pre-edit hash.

## Global constraints (verbatim from SPEC)

- 产品同时运行于 Bun/Express 服务端、独立 Vue Web 和 Electron 桌面端；默认没有公网 webhook。
- renderer、REST 响应、日志、job payload、OpenAPI 与 Socket 事件均不得包含 secret。
- provider operation 必须带 schema version 且可 JSON 序列化；大媒体不得嵌入 job JSON。
- provider 返回的 URL 与 redirect 均按不可信输入处理；最终结果必须进入 Toonflow-owned storage。
- unsupported 与 unavailable 是不同状态；未知参数、隐式降级和静默 provider fallback 均被禁止。
- 现有 `${vendorId}:${modelName}` 可继续读取；新 API 使用结构化 ID，不再依赖字符串 split。
- 构建产物必须能追溯 backend revision、Web revision 和 API contract version。
- Desktop/local API 必须显式绑定 loopback、限制 CORS 到内置/开发 Web origin 并拒绝跨站 credentialed requests；standalone remote deployment 必须配置 TLS reverse proxy、allowed origins 与现有 auth，但本期仍不提供 REST secret write。

## Conventions inventory

- Backend runtime/build: Bun `1.4.1`; `bun run check` = runtime/module-boundary/format/lint/typecheck/test; `bun run build` emits `data/serve/app.js` and `build/main.js`.
- Backend structure: Express route files under `src/routes/**` are generated into `src/router.ts`; handlers use Zod `validateFields` and `{code,data,message}` envelopes. SQLite/Knex is the current durable store.
- Existing AI seam: `src/utils/ai.ts` and trusted-local VM vendor scripts; new kernel may adapt this seam but new business code must not import VM internals.
- Web runtime/build: Vue 3 + Pinia + TDesign + Axios; Yarn lockfile; `yarn build-only`, `yarn type-check`, `yarn i18n:check`; no existing test script.
- Contract direction: backend Zod/OpenAPI artifact → generated Web client. Generated files are checked by source hash and never hand-edited.
- Full affected checks: backend `bun run check && bun run build`; Web `yarn type-check && yarn test:run && yarn i18n:check && yarn build-only`; contract/provenance and secret scans added by slices.
- Governing instructions: root session `AGENTS.md`; no repository-local `AGENTS.md` found.

## Baseline failure ledger

| Command | Exit | Test/check | Normalized fingerprint | Status/note |
|---|---:|---|---|---|
| `bun run check` | 0 | backend full check | 221 module-boundary files; format/lint/tsc; Bun tests 2 pass | clean baseline |
| `bun run build` | 0 | backend/Electron build | emits server and main bundles | clean baseline; tracked tree unchanged |
| `corepack yarn install --frozen-lockfile` | 0 | Web dependency install | invalid SPDX, omi destination conflict, three unmet peers | known warnings; lock unchanged |
| `corepack yarn type-check` | 2 | Web TypeScript | `generate copy.vue(1063,1): TS1109 Expression expected` | known-red pre-existing syntax defect; repair is required before Web gate and must be isolated |
| `corepack yarn type-check` after D-002/D-006 | 2 | Web semantic types | 21 pre-existing errors: MdPreview `auto` theme family, Electron/Vite globals, TDesign handlers, two copy/workbench typings and existing model shapes | known-red; affected-source tests/build must not add errors, global cleanup deferred to S7 |
| `corepack yarn i18n:check` | 0 | Web localization audit | 283 unused, 3 missing, 374 hard-coded strings | known debt; new keys may add zero missing keys and Slice 7 makes the affected surface strict |
| `corepack yarn build-only` | 0 | Web Vite build | 11,096 modules; 26.6 MB single HTML | clean baseline |
| Web tests | — | automated suite | no test runner/script exists | Slice S0 adds Vitest/component harness |
| bundle provenance | mismatch | app `data/web/index.html` vs fresh upstream Web build | app SHA `28d92b…`; fresh Web dist SHA `3c9291…` | current bundle is not reproducible from declared Web baseline; do not overwrite until provenance gate exists |

## Blast-radius coverage ledger

| Surface / consumer class | Causal path | Requirement/check | State | Limitation |
|---|---|---|---|---|
| legacy model selection | `modelSelect.vue` → `/modelSelect/*` → `src/utils/vendor.ts` | RC-001/RC-004 characterization | traced | string ID remains dual-read only |
| agents/text | agents → `src/utils/ai.ts::textRequest` → VM vendor | RC-002 fixtures | traced | live behavior depends on provider credential |
| image/video generation | Workbench/assets routes → `src/utils/ai.ts` → provider URL → local save | RC-003 + job/asset tests | traced | current polling is in-process and non-durable |
| provider settings/secrets | Web vendor config → REST `inputValues` → SQLite/VM | AC-010/NFR-003 | traced high risk | current ordinary JSON may contain secret |
| Electron boundary | renderer → local API / `toonflow://` → main | AC-010/AC-012/AC-013 | traced high risk | no narrow credential preload yet |
| local/remote HTTP | `src/app.ts` CORS/listen/auth | AC-009/AC-010 | traced high risk | current listen/CORS are broader than target |
| cross-repo contract | app REST → handwritten Web mappings → embedded bundle | AC-003/AC-013/NFR-007/NFR-009 | traced | provenance mismatch above |
| provider outputs | adapters/VM → remote URLs → route downloads | AC-009/RC-003 | traced high risk | shared outbound policy absent |
| task persistence | `o_tasks`, media tables, coarse polling | AC-006–AC-008/AC-012/AC-015/AC-016 | traced high risk | no attempt/handle/lease ledger |

## Approved test migrations

| Existing test | Active requirement superseding old assertion | Narrow change |
|---|---|---|
| none | N/A | existing two VM tests remain unchanged |

## Slices

- [x] **S0 — Freeze baseline, characterization, and reproducible contract harness**
  - Covers: RC-001, RC-002, RC-003, RC-004, AC-013, NFR-007, NFR-009
  - Blocked by: none · Risk: medium; cross-repository provenance is currently absent.
  - Files: app create/modify `package.json`, `scripts/check-web-provenance.ts`, `scripts/run-live-tests.ts`, `scripts/run-live-tests.test.ts`, `scripts/main.ts`, `src/contracts/buildManifest.ts`, `src/contracts/buildManifest.test.ts`, `src/contracts/packaging.test.ts`, `src/utils/legacyAi.characterization.test.ts`, `data/contracts/web-build.json`; Web create/modify `package.json`, `yarn.lock`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.node.json`, `tsconfig.app.json`, `src/test/setup.ts`, `src/components/modelSelect.test.ts`, `src/api/buildMeta.ts`, `scripts/writeBuildMeta.ts`, `src/views/production/components/workbench/generate copy.vue`; delete task-generated `vite.config.js`, `vite.config.d.ts`.
  - Interfaces: produces build manifest schema and fail-closed live-runner CLI; consumes Git revision, lockfile and bundle digests.
  - Oracle order: legacy ID fixture → AI return-shape fixture → live-runner budget refusal → provenance mismatch/pass → Web component harness.
  - Approved test migrations: none; TS1109 repair is mechanical and listed as D-002.
  - Affected verify: backend `bun run check && bun run build` → pass; Web `corepack yarn test:run && corepack yarn build-only` → pass and `corepack yarn type-check` → no error beyond the recorded 21-error fingerprint.
  - Manual/scripted probe: run provenance check once with recorded mismatch fixture and once with exact fixture; first must fail and second pass.
  - Rollback: if characterization changes existing runtime output, revert only S0 production edits and retain failing oracle/provenance evidence.
  - GREEN: frozen fixtures protect legacy selection and AI return shapes; live runner refuses absent budget/credential; manifest records both revisions, lock digest, contract range/hash and rejects a mismatched embedded bundle.
  - Checkpoint: local content manifest of all task paths and commands; no bundle replacement and no paid call.
  - Evidence: focused RED/GREEN exits, full-check exits, sorted path:digest manifest and timestamp recorded after implementation.

- [x] **S1 — Typed provider domain, catalog/preflight API, routing policy, and Web picker**
  - Covers: AC-001, AC-002, AC-003, AC-011, AC-013, AC-014, AC-021, RC-001, RC-004, NFR-004, NFR-005, NFR-006, NFR-007, NFR-008
  - Blocked by: S0 · Risk: high; this is the cross-stack contract and routing foundation.
  - Files: app create/modify `src/providers/domain/{ids,models,operations,capabilities,pricing,errors,results}.ts`, `src/providers/ports/index.ts`, `src/providers/registry/providerRegistry.ts`, `src/providers/policy/offeringPolicy.ts`, `src/providers/catalog/builtinCatalog.ts`, `src/providers/preflight/{preflightService,preflightService.test}.ts`, `src/providers/legacy/{legacyModelId,LegacyVendorAdapter}.ts`, matching tests, `src/contracts/v2/{schemas,openapi,meta,fixtures}.ts`, `src/routes/meta.ts`, `src/routes/v2/{catalog,preflight,support}.ts`, `src/security/{publicRoutes,publicRoutes.test}.ts`, `scripts/{generate-openapi,check-architecture}.ts`, `data/contracts/openapi.v2.json`, `src/core.ts`, `src/router.ts`, `src/app.ts`, `package.json`; Web create/modify `package.json`, `yarn.lock`, `scripts/writeApiSource.ts`, `src/api/generated/{v2.ts,source.json}`, `src/features/models/{catalog.ts,OfferingBadge.vue,ModelOfferingPicker.vue,ModelOfferingPicker.test.ts}`, `src/features/generation/{CapabilityForm.vue,CapabilityForm.test.ts}`, `src/components/modelSelect.vue`, affected `src/locales/language/*.json`.
  - Interfaces: produces versioned catalog/preflight/support/meta REST plus `ProviderRegistry.register(adapter)` and `OfferingPolicy.select(request,candidates)`; consumes only declared operation/capability manifests.
  - Oracle order: H3 identity/two offerings → video-only adapter → shared H3 violation → legacy ID → RMB/USD price matrix → policy pin/auto → OpenAPI/meta → Web keyboard/a11y.
  - Approved test migrations: none.
  - Affected verify: contract generation/diff and architecture scan, `bun run check && bun run build`, Web `yarn type-check && yarn test:run && yarn i18n:check && yarn build-only` → pass or baseline-identical i18n debt only.
  - Manual/scripted probe: start local API, query catalog/meta and post valid/invalid H3 preflight; compare returned code and CNY estimate to the deterministic fixture.
  - Rollback: disable/remove only v2 read-only routes and Web dual-read integration; legacy model route remains unchanged.
  - GREEN: core has no provider-name branch; `minimax`+`official` and `fal`+`aggregator` remain distinct; price snapshots retain CNY/USD source/as-of and estimates disclose FX/comparability; generated client renders the same violation codes.
  - Checkpoint: executable read-only catalog/preflight vertical slice across backend/Web/Electron bundle source; no paid call.
  - Evidence: per-oracle RED/GREEN, API probe, p95 result, full checks and sorted path:digest manifest.

- [x] **S2 — Credential vault, versioned migrations, local API hardening, and settings UX**
  - Covers: AC-010, AC-014, RC-004, NFR-003, NFR-007, NFR-008
  - Blocked by: S1 · Risk: critical; secret migration and desktop IPC are irreversible security boundaries.
  - Files: app create/modify `src/lib/migrations/{index,ledger,0001_provider_credentials}.ts`, `src/security/credentials/{types,redact,environmentVault,memoryVault,electronVault,legacyCredentialMigration,runtime,legacyInputPolicy}.ts`, `src/security/{localApiPolicy,credentialIpc}.ts`, `src/routes/v2/providers.ts`, `src/routes/setting/vendorConfig/{getVendorList,updateVendorInputs}.ts`, `src/utils/{db,ai}.ts`, `scripts/{build,preload,main}.ts`, `src/app.ts`, `src/contracts/v2/{schemas,openapi}.ts`, `src/router.ts`, matching tests; Web `src/features/providers/{providerStore.ts,ProviderSettings.vue,ProviderSettings.test.ts}`, `src/components/setting/components/vendorConfig.vue`, `src/types/global.d.ts`, affected locales and generated API artifacts.
  - Interfaces: produces `CredentialVault.get/set/delete/status` and credential-status REST; consumes CredentialRef only at adapter execution.
  - Oracle order: REST rejection → env status → memory vault → safeStorage fail-closed → IPC spoof/schema → atomic file/tombstone/rotation → copied DB interruption → canary scan.
  - Approved test migrations: none.
  - Affected verify: focused vault/migration/Electron tests plus full backend/Web and secret scan → no canary occurrence.
  - Manual/scripted probe: Electron save/status/delete using a canary key, reopen settings, inspect DB/log/artifacts for absence.
  - Rollback: stop new migration before cutover; after successful secret replacement, rollback is feature-disable in the new binary only and never recreates plaintext.
  - Checkpoint: sorted path:digest manifest plus copied-DB before/after hashes; no real key persisted.
  - Evidence: fault-test exits, vault permission metadata, canary scan and full-suite output.

- [x] **S3 — Durable generation jobs, at-most-once submit, secure assets, and recovery UX**
  - Covers: AC-006, AC-007, AC-008, AC-009, AC-012, AC-015, AC-016, RC-003, NFR-001, NFR-002, NFR-005, NFR-006, NFR-007
  - Blocked by: S2 · Risk: critical; paid-submit ambiguity and untrusted media URLs can cause duplicate billing or SSRF.
  - Files: app create/modify `src/lib/migrations/0002_generation_jobs.ts`, `src/generation/{domain,stateMachine,jobRepository,attemptRepository,generationService,runner,backoff,reconcile}.ts`, `src/assets/{outboundPolicy,metadata,providerAssetCache,assetGateway}.ts`, `src/routes/v2/jobs/{submit,get,list,cancel,reconcile}.ts`, `src/socket/jobNotifications.ts`, `scripts/main.ts`, matching tests, `tests/fault/jobCrashMatrix.test.ts`, `tests/integration/outboundPolicy.test.ts`; Web `src/features/generation/{jobStore.ts,JobCard.vue,JobCard.test.ts,JobRecovery.vue}` and exact Workbench/Socket imports discovered before edit.
  - Interfaces: produces idempotent job REST, durable runner lease API, typed state events and AssetGateway; consumes provider async ports and CredentialRef.
  - Oracle order: pure transitions → idempotency → prepared/send_started crash → lease/restart → cancel races → reconcile audit → asset import → SSRF/DNS/redirect/compression → REST/Socket UI recovery.
  - Approved test migrations: none.
  - Affected verify: focused transition/fault/security suites, 100% transitions, ≥90% new-module branches, local p95 probes, backend/Web full gates.
  - Manual/scripted probe: deterministic fake provider with process kill after each persisted boundary and packaged/local restart; assert one create at most.
  - Rollback: disable new submit while retaining status/cancel/import recovery readers and all persisted ledgers.
  - Checkpoint: database-schema hash, fault-matrix report and sorted path:digest manifest.
  - Evidence: per-boundary RED/GREEN, coverage, performance, restart and security results.

- [x] **S4 — DeepSeek V4 Pro/Flash/Vision first-class adapter and multimodal UX**
  - Covers: AC-004, AC-017, AC-020, NFR-002, NFR-003, NFR-006, NFR-008
  - Blocked by: S3 · Risk: high; fast-moving experimental model contracts and multimodal transport limits.
  - Files: app create `src/providers/adapters/deepseek/{manifest,transport,languageAdapter,visionAdapter,normalizer,errors}.ts`, matching fixtures/tests, `tests/live/deepseek.live.test.ts`, `src/release/{evidence,releaseGate}.ts`; Web create/modify `src/features/chat/attachments/{ImageAttachment.vue,AttachmentComposer.vue}`, matching tests, exact Agent/chat call sites and affected locales found before edit.
  - Interfaces: implements declared language.generate/stream and Files-backed vision operations; consumes registry, jobs, assets and vault ports only.
  - Oracle order: request fixtures → stream/tool/thinking multi-turn → vision role/detail/MIME/size/count → Files reuse → error mapping → evidence gate → live cases.
  - Approved test migrations: none.
  - Affected verify: adapter contracts, release gate, backend/Web full gates and budgeted serialized live matrix.
  - Manual/scripted probe: OCR/chart/multi-image UI path in Web and packaged Electron using minimum-cost inputs.
  - Rollback: disable affected offering submissions by evidence/feature flag while preserving active job recovery.
  - Checkpoint: adapter/manifest/evidence hashes and redacted live report; no media or key retained.
  - Evidence: contract/live/product matrix bound to exact resolved model, manifest and date.

- [x] **S5 — Reusable fal aggregator plus MiniMax H3 official/fal offerings and RMB-aware routing**
  - Covers: AC-005, AC-014, AC-019, AC-020, AC-021, NFR-002, NFR-003, NFR-006, NFR-008
  - Blocked by: S3 · Risk: critical; asynchronous paid jobs and non-equivalent price units.
  - Files: app create `src/providers/adapters/fal/{manifest,transport,storage,queue,errors}.ts`, `src/providers/adapters/minimax/{h3Manifest,h3Schema,officialTransport,officialAdapter}.ts`, `src/providers/pricing/{priceCatalog,fx}.ts`, matching fixtures/tests, `tests/live/{falH3,minimaxH3}.live.test.ts`; Web create/modify `src/features/generation/h3/{H3Form.vue,H3Form.test.ts,H3OfferingComparison.vue,H3OfferingComparison.test.ts}`, exact Workbench call site and affected locales.
  - Interfaces: fal transport exposes storage/submit/status/result/cancel independent of model schema; H3 manifests map canonical roles to fal endpoints or official v2 content.
  - Oracle order: generic fal transport with two manifests → H3 three modes → official content array → queue/cancel/result import → CNY/USD price and stale/incomparable FX → pin/auto → support evidence → live fal.
  - Approved test migrations: none.
  - Affected verify: fal/MiniMax contracts, price-policy matrix, full backend/Web, then paid runner preview and budgeted live suite.
  - Manual/scripted probe: compare the same 768P and 2K request in H3 UI, inspect original CNY/USD, converted CNY, source/as-of and route explanation.
  - Rollback: disable new H3 submits per offering; keep polling/cancel/import for acknowledged jobs and retain official live-unverified catalog state.
  - Checkpoint: manifests/fixtures/live-evidence sorted digests; exact paid request count and maximum cost recorded.
  - Evidence: mocks plus fal live product matrix; MiniMax official live is explicitly missing until user supplies key.

- [x] **S6 — Google Gemini language, multimodal, Nano Banana, Omni, and Veo offerings**
  - Covers: AC-018, AC-020, NFR-002, NFR-003, NFR-006, NFR-008
  - Blocked by: S3 · Risk: high; multiple preview operations and SDK experimental surfaces.
  - Files: app create `src/providers/adapters/google/{manifest,transport,languageAdapter,filesAdapter,imageAdapter,videoAdapter,grounding,errors}.ts`, matching fixtures/tests, `tests/live/google.live.test.ts`; Web create/modify `src/features/chat/attachments/GoogleFileAttachment.vue`, `src/features/generation/google/{GoogleImageForm.vue,GoogleVideoForm.vue,GroundingIndicator.vue}`, matching tests, exact Workbench/chat call sites and locales.
  - Interfaces: implements only manifest-declared Google language/Files/Search/image/video ports; disabled lifecycle capabilities stay catalog-visible.
  - Oracle order: offering matrix/lifecycle → language stream/tool/schema → Files/Search → image parts/edit → async video → error mapping → Web forms → per-offering evidence → live.
  - Approved test migrations: none.
  - Affected verify: Google adapter contracts, SDK compatibility, release gate, full backend/Web and budgeted live matrix.
  - Manual/scripted probe: language+file+grounding, each image offering, Omni/Veo minimal job through Web and packaged Electron.
  - Rollback: disable affected offering submit while preserving acknowledged job recovery; never enable undeclared Live/TTS.
  - Checkpoint: per-offering manifest/evidence digests with exact resolved alias and date.
  - Evidence: deterministic and live/product records per enabled offering, never family-level substitution.

- [ ] **S7 — Full-stack assurance, packaging, release evidence, and rollback controls**
  - Covers: AC-009, AC-010, AC-012, AC-013, AC-015, AC-016, AC-020, RC-001, RC-002, RC-003, RC-004, NFR-001, NFR-002, NFR-003, NFR-005, NFR-006, NFR-007, NFR-008, NFR-009
  - Blocked by: S4, S5, S6 · Risk: high; release claims must fail closed when evidence/provenance is incomplete.
  - Files: app create/modify `scripts/{check-release-evidence,check-secrets,benchmark-provider-kernel,package-web,check-web-provenance,main}.ts`, `src/security/{credentialIpc,credentials/electronVault}.ts`, `src/assets/languageAssetService.ts`, `src/providers/{availability/**,preflight/**,languageExecutionService.ts}`, `src/generation/**`, `src/contracts/v2/**`, `src/routes/v2/**`, `src/lib/migrations/**`, `src/app.ts`, `package.json`, `tests/e2e/providerPlatform.e2e.ts`, `tests/electron/restart.e2e.ts`, applicable existing `.github/workflows/*.yml`, `data/contracts/build-manifest.json`, and only after exact match `data/web/index.html`; Web create/modify `e2e/providerPlatform.spec.ts`, `playwright.config.ts`, `src/features/{chat/**,compatibility/**,generation/**,models/**}`, exact Workbench/project persistence call sites, affected a11y/i18n checks and final `src/api/generated/*`.
  - Interfaces: produces immutable release/build evidence and compatibility handshake; consumes all slice checkpoints and support records.
  - Oracle order: missing/stale evidence → exact-hash mismatch → SemVer range → secret/SSRF → idempotency/restart → keyboard/axe/i18n → mutation → clean checkout → packaged smoke.
  - Approved test migrations: none unless separately amended before this slice.
  - Affected verify: every repository full gate, coverage/mutation, contract/provenance, Playwright/Electron, clean-room manifest comparison.
  - Manual/scripted probe: packaged desktop and standalone Web charters across provider settings, model picker, attachments, H3 price comparison, job recovery and upgrade block.
  - Rollback: switch off new submissions in the same binary, preserve readers/recovery, and restore the previous embedded bundle only if its compatible manifest is also restored.
  - Checkpoint: frozen sorted path:digest manifest and reviewer-visible candidate digest; no commit/push/deploy.
  - Evidence: complete requirement matrix, review closure, exploratory records, package/clean-room results and remaining platform limits.

## Coverage matrix

| Slice | Active requirements | Principal evidence |
|---|---|---|
| S0 | AC-013; RC-001, RC-002, RC-003, RC-004; NFR-007, NFR-009 | characterization + provenance negative/positive fixtures |
| S1 | AC-001, AC-002, AC-003, AC-011, AC-013, AC-014, AC-021; RC-001, RC-004; NFR-004, NFR-005, NFR-006, NFR-007, NFR-008 | catalog/preflight/price/OpenAPI/API+component matrix |
| S2 | AC-010, AC-014; RC-004; NFR-003, NFR-007, NFR-008 | migration/vault/IPC/REST/canary tests |
| S3 | AC-006, AC-007, AC-008, AC-009, AC-012, AC-015, AC-016; RC-003; NFR-001, NFR-002, NFR-005, NFR-006, NFR-007 | fault-injected state/recovery/security suites |
| S4 | AC-004, AC-017, AC-020; NFR-002, NFR-003, NFR-006, NFR-008 | DeepSeek contract/live/product evidence |
| S5 | AC-005, AC-014, AC-019, AC-020, AC-021; NFR-002, NFR-003, NFR-006, NFR-008 | fal/H3 contracts, price matrix and live evidence |
| S6 | AC-018, AC-020; NFR-002, NFR-003, NFR-006, NFR-008 | Google per-offering contract/live/product matrix |
| S7 | AC-009, AC-010, AC-012, AC-013, AC-015, AC-016, AC-020; RC-001, RC-002, RC-003, RC-004; NFR-001, NFR-002, NFR-003, NFR-005, NFR-006, NFR-007, NFR-008, NFR-009 | full frozen candidate, packaging and clean-room gates |

Every AC-001–AC-021, RC-001–RC-004 and NFR-001–NFR-009 is mapped above; repeated mapping is intentional for cross-slice regression closure.

## Deviations and amendments

| ID/date | Level | Expected / found / impact | Resolution and approval |
|---|---|---|---|
| D-001 2026-08-23 | SPEC | v3 used `minimax-direct` and did not define domestic-price/FX routing | SPEC v4 approved in-thread; Provider `minimax`, AccessChannel `official`, AC-021 and pricing model added; normative digest unchanged after approval |
| D-002 2026-08-23 | Code | Web baseline typecheck fails on a malformed computed closure in `generate copy.vue`; blocks every Web type gate but is outside feature behavior | S0 names a mechanical one-token syntax repair; no assertion or product behavior migration |
| D-003 2026-08-23 | Code/build | embedded app Web bundle hash differs from a clean build of the only discoverable upstream Web baseline | Preserve current bundle through S0–S6; S0 establishes provenance failure, S7 replaces only from a fixed, passing Web candidate |
| D-004 2026-08-23 | PLAN | S0 listed the paid-live runner but omitted its deterministic test path | Add `scripts/run-live-tests.test.ts` before creating it; scope and behavior are unchanged |
| D-005 2026-08-23 | PLAN/code | baseline `vue-tsc --build` emits untracked config JavaScript because `tsconfig.node.json` sets `noEmit: false` | Add the exact config path to S0 and set `noEmit: true`; type analysis is unchanged and provenance noise is removed |
| D-006 2026-08-23 | PLAN/code | after the syntax blocker was removed, TS 5.6 rejected Web's `ignoreDeprecations: "6.0"` | Add `tsconfig.app.json` to S0 and align it to the existing Node config value `5.0`; compiler/runtime behavior is otherwise unchanged |
| D-007 2026-08-23 | PLAN/code | clearing the two parser/config blockers exposed 21 existing semantic Web type errors across unrelated screens | Keep them as a normalized known-red baseline through affected slices; no broad drive-by repair now, and S7 owns final repository-wide type closure |
| D-008 2026-08-23 | PLAN | S1 route list did not name the pure preflight orchestration seam needed to keep Express handlers thin and independently test price/capability policy | Add `src/providers/preflight/preflightService.ts` and its test before edit; public contract and scope are unchanged |
| D-009 2026-08-23 | PLAN/code | regenerating `src/router.ts` exposed that `src/core.ts` emits a value import for Express, incompatible with the repository's `verbatimModuleSyntax` gate | Add generator source to S1 and emit `import type`; generated runtime behavior is unchanged |
| D-010 2026-08-23 | PLAN | generated Web types also need a deterministic source/provenance writer and dependency lock update | Add Web `scripts/writeApiSource.ts`, package and lock paths before edit; use official openapi-typescript 7.x CLI output with an exact source hash |
| D-011 2026-08-23 | PLAN | S1 used the wrong locale extension pattern; the repository has seven JSON locale files | Correct the exact scope to `src/locales/language/*.json` before editing and add the same provider-platform keys in all seven |
| D-012 2026-08-23 | PLAN/security | the startup contract handshake at `/api/meta` was generated behind token middleware, so a Web/Electron client could not verify compatibility before authentication | Add a narrowly tested public-route predicate and expose only login plus read-only meta; catalog, support and preflight remain authenticated |
| D-013 2026-08-23 | Code/packaging | the packaged `data/contracts` source was excluded from Electron's first-install/upgrade copy allowlist, so `/api/meta` would fail in the user-data runtime | Add `contracts` to the immutable resource allowlist and a source-level packaging regression test; no user data is migrated or deleted |
| D-014 2026-08-23 | PLAN/code | database initialization ran in an unawaited module IIFE, allowing HTTP listen before schema/data readiness and hiding clean-start failures | Add the existing `src/utils/db.ts` to S2, export one readiness promise, and make server startup await it before migrations/listen |
| D-015 2026-08-23 | Security | securing only new built-in settings would leave legacy vendor password inputs exposed in ordinary REST payloads and writes | Add legacy response redaction, reject password values on REST, route all renderer-entered password slots through the narrow Electron IPC vault, and inject vault values only at trusted adapter execution |
| D-016 2026-08-23 | Build/Electron | the repository had no preload entry, while a safe credential bridge requires context isolation, sender validation and a separately built sandbox-compatible preload | Add a CJS preload target, explicit hardened `webPreferences`, validated IPC handlers and shared request schemas before wiring settings UI |
| D-017 2026-08-23 | Domain/migration | legacy custom vendor IDs include constrained mixed-case values such as `volcengineSd2`, which are valid plugin identities but intentionally invalid canonical catalog ProviderIds | Separate the credential-owner validation domain from canonical ProviderId: allow bounded alphanumeric mixed case plus safe separators for vault keys while keeping catalog IDs lowercase and stable |
| D-018 2026-08-23 | Build/generation | adding `/api/v2/providers` exposed that `src/core.ts` had no direct CLI entry or stale-router check, so full checks could pass with a route absent from the runtime router | Make the existing generator executable, add fail-closed `--check`, include it in `bun run check`, and regenerate `src/router.ts` before repeating the API probe |
| D-019 2026-08-23 | Build/generation | making router generation current exposed that its broad glob treated colocated `*.test.ts` files as production Express routers | Add and test an explicit route-entry predicate excluding test/spec files before regenerating; production route discovery remains convention-based |
| D-020 2026-08-23 | Architecture | provider output URLs sometimes require provider authorization, but downloading inside adapters materialized large video responses in RAM and risked leaking headers across redirects | Represent only a credential-header reference in transient adapter output; AssetGateway resolves it server-side, injects it on an exact allowlisted origin, revalidates every redirect, strips it cross-origin and streams into owned storage |
| D-021 2026-08-23 | Contract | flat provider env metadata could not express safe aliases such as `FAL_KEY`/`FAL_API_KEY` per credential slot | Make credential slots typed descriptors with ordered environment aliases; renderer receives names/status only and never values |
| D-022 2026-08-23 | Google API | current Omni continues an interaction through provider state rather than ordinary input media | Model continuation as an authorized completed parent job and resolve `previous_interaction_id` only inside the adapter; job JSON and renderer never receive raw provider state |
| D-023 2026-08-23 | Product | generic image/video catalog support required materialization into existing asset and Workbench histories, not a parallel demo screen | Add typed consumer references and idempotent materializers, then drive H3/Veo/Omni/Nano Banana from shared capability forms and durable job recovery |
| D-024 2026-08-23 | Build/runtime | build metadata existed but Web did not enforce it at startup, allowing a standalone or embedded client to use a mismatched backend | Add a public read-only `/api/meta` handshake and fail-closed Web compatibility gate for contract range, exact OpenAPI digest and pinned Web revision |
| D-025 2026-08-23 | Packaging | a Git revision alone could not identify approved dirty local candidates and Web build plugins emit non-runtime declaration files | Package from content revisions, exclude only generated/non-runtime surfaces, bind lock/OpenAPI/client/bundle hashes, write manifest last, and prove two consecutive builds are identical |
| D-026 2026-08-23 | Testing | full Web typecheck now reports 23 historical semantic errors after parser/config blockers were removed | New affected files add no type errors; preserve the normalized 23-error baseline and keep global type closure plus inherited dependency debt as S7 release blockers |
| D-027 2026-08-23 | Security review | Yarn audit reports inherited Web dependency debt while the backend lock audit is clean | Do not force broad transitive overrides inside the provider feature; record 39 high/74 moderate/14 low Web findings as an explicit release blocker requiring a separate dependency-upgrade slice and regression pass |
| D-028 2026-08-23 | Contract/research | MiniMax official creation directly supports 768P/2K and 4–15 seconds; regeneration is a separate optional 768P-to-2K flow. fal exposes 480P/768P/2K/4K and 5–15 seconds; its machine-readable endpoint schema explicitly defines 480P/768P as native and 2K/4K as upscaled from 768P | Correct official 2K to `native` and fal 2K/4K to `upscaled` from 768P. Give the offerings distinct comparison bases and fail closed instead of silently price-routing between unequal quality profiles; bind price evidence to the endpoint/date because fal marketing pages conflict |
| D-029 2026-08-23 | Review/security | Frozen-candidate review found sixteen independently reproducible gaps across desktop credential boundaries, durable-job recovery, runtime offering availability, compatibility mode, idempotency, generic multimodal chat, pagination and structured selection persistence | Treat all sixteen as true positives inside approved S7 assurance scope. Add focused RED tests before each fix, preserve static catalog purity, keep provider submission at-most-once, and regenerate/package only after backend and Web contracts are green |
| D-030 2026-08-23 | Release evidence | A catalog flag, mock suite or unsigned live response could still be mistaken for product acceptance | Add a fail-closed paid executor, exact case/manifest/model evidence, immutable artifacts, signed two-blind review with dispute-only adjudication, and a release gate that revalidates the entire chain |
| D-031 2026-08-23 | Deterministic acceptance | Frozen assertions were initially descriptive, request evidence was reconstructed from case input, and media/lineage/revision/Veo combinations had incomplete mechanical checks | Execute frozen JSON Schema with Ajv, persist exact port requests/context, inspect media bytes, bind Omni to `sourceCaseId`, fail closed on absent fal revision, and derive catalog/adapter Veo constraints from one schema |
| D-032 2026-08-23 | Review/security | Different reviewer IDs could share one Ed25519 key and simulate two blind reviewers plus an adjudicator | Canonicalize each public key to SPKI DER, require unique SHA-256 identities in trust configuration and release evaluation, and cover alternate PEM text encodings |
| D-033 2026-08-23 | SPEC/quality | DeepSeek Vision semantic facts cannot be safely automated with substring matching, while SPEC still described them as deterministic facts ≥90% | Keep 8/8 typed structural/request/schema checks deterministic; expose frozen `expectedFacts` to two independent signed reviewers and require at least 6/8 acceptable cases without hard failure |
| D-034 2026-08-23 | Testing | The historical Web parser/config/semantic baseline blocked repository-wide type assurance | Close the affected semantic issues during S7; final `yarn type-check` is green, while the separate inherited dependency audit remains open |

## Noticed, not touched

- Web i18n audit reports 309 unused keys, 3 pre-existing missing keys and 377 hard-coded strings after the provider-platform locale additions. The 3 missing keys remain the normalized pre-existing baseline and no new missing keys were introduced; global historical cleanup is outside this feature unless it blocks an affected locale gate.
- Web install reports existing package-license/peer warnings. They remain baseline fingerprints unless a slice changes the relevant dependency.
- No `reedchan7/Toonflow-web` remote fork existed when inspected. Creating a remote repository or pushing is outside current authority; implementation remains in the local fixed-revision clone.

## Review log

| Round | Candidate digest | Independent? | Findings C/I/M | Fixed / disproved / open | Verdict |
|---|---|---|---|---|---|
| local architecture/security review | initial local candidate | no | 4 confirmed | authenticated streaming output, credential aliases, continuation ownership and runtime compatibility fixed | continued to independent review |
| independent frozen-candidate review | App/Web local content revisions | yes; backend/spec/Web reviewers | 16 confirmed | 16 fixed with focused regressions across credential, job, availability, compatibility, idempotency, multimodal, pagination and selection boundaries | targeted re-review required |
| targeted backend/spec/Web re-review | manifest-bound local candidate | yes | 7 confirmed; Web no findings | reviewer workflow, deterministic evaluation, Omni lineage, fal revision and Veo constraints fixed; remote Environment remains external | one final trust-boundary check |
| reviewer trust-boundary re-review | manifest-bound local candidate | yes | 1 confirmed | same-key/multiple-ID bypass fixed with SPKI fingerprint uniqueness and regression coverage | no Critical/Important code finding open |

## Delivery report

### Requirement evidence

| AC/RC/NFR | Verify method | Command/probe + result | Candidate | Time |
|---|---|---|---|---|
| AC-001–AC-005, AC-011, AC-014, AC-017–AC-021 | contract/catalog/preflight/provider tests | backend full check: 206 tests; DeepSeek/fal/MiniMax/Google contracts, exact request evidence, frozen-schema and signed-review suites green | manifest-bound local candidate | 2026-08-23 |
| AC-006–AC-009, AC-012, AC-015–AC-016 | state/fault/integration/security tests | crash matrix, restart recovery, cancel race, idempotency, SSRF/DNS/redirect/compression and owned materialization green | manifest-bound local candidate | 2026-08-23 |
| AC-010, NFR-003 | vault/IPC/runtime probe | memory/env/Electron vault and legacy migration tests green; macOS safeStorage canary round-trip true, plaintext false, delete true | local runtime | 2026-08-23 |
| AC-013, NFR-007, NFR-009 | generated client/handshake/package | Web 40 tests and global typecheck green; consecutive package builds have identical manifest/bundle; provenance and production builds green | `data/contracts/web-build.json` | 2026-08-23 |

### CI / full-suite / coverage limits

- Local execution is authorized; commit/remote CI authority is absent. Backend check/build (206 tests), Web typecheck/Vitest (40 tests)/i18n/build-only, deterministic packaging, secret scan and provider-kernel benchmark are green. Bun coverage reports 76.54% functions / 78.83% lines across the whole mixed legacy repository; critical state-machine and migration units are 100%, but the NFR-002 scoped 90% branch report and 80% mutation score have not been produced. Hosted CI and cross-platform packages remain unverified.

### Mutation/sensitivity *(selected by risk)*

| Requirement/risk | Mutation | Caught by | Isolated restore digest |
|---|---|---|---|
| NFR-001 state boundary | drop provider acceptance before handle persistence | crash matrix forces `submission_unknown` and proves no second create | test fixture restored by process isolation |
| AC-021 routing | compare official native 2K with fal upscaled 2K as equal quality | price/policy/preflight tests reject automatic cross-quality routing | test fixture restored by process isolation |
| NFR-003 credential leak | expose seeded canary in REST/vault file | redaction, REST, migration and real safeStorage probes | temp probe deleted; test stores isolated |

### Exploration

| Charter/oracle | Probe | Observation/evidence | Verdict |
|---|---|---|---|
| API/Web/Electron/job/SDK/security/migration/config | deterministic local probes and independent source review | source-level and mock/fault paths closed; paid provider UX, packaged browser/a11y and cross-platform runtime remain unexecuted | partial; P6 open |

### Waivers, open work, and remaining risk

- No waiver. Paid live requests were not run because no explicit USD budget was approved; MiniMax official also lacks a credential. `bun run release:evidence` intentionally fails with `evidence_missing` for all 12 enabled targets, so catalog evidence remains `contract_verified`, never `product_accepted`.
- GitHub `provider-acceptance` Environment is not provisioned (`GET /repos/reedchan7/Toonflow-app/environments/provider-acceptance` returned 404). Required-reviewer policy and Environment-scoped provider/executor secrets remain an external release blocker.
- Web dependency audit is release-blocking: 39 high, 74 moderate and 14 low inherited findings. Backend audit found no vulnerabilities across 631 packages.
- Real visual/a11y/product acceptance, NFR coverage/mutation thresholds and cross-platform packaged smoke remain open. External model/pricing lifecycle must be refreshed immediately before those live gates.

### Clean-checkout demo

1. `bun run check && bun run provenance:check && bun run build` in Toonflow-app.
2. `corepack yarn type-check && corepack yarn test:run && corepack yarn i18n:check && corepack yarn build-only` in Toonflow-web.
3. `bun run web:package` twice; manifest and embedded bundle SHA-256 must remain identical.

### State evidence

- Locally verified: backend, Web type/component/build, contract, durable job/security, signed acceptance machinery, macOS safeStorage and deterministic embedded packaging candidate.
- Ready for integration: implementation candidate exists; release acceptance is blocked by paid live/product evidence, missing protected GitHub Environment, inherited Web dependency audit, coverage/mutation evidence and browser/cross-platform acceptance.
- Integrated: not reached.
- Released: not reached.
