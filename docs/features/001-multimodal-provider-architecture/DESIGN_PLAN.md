# Approved Design Plan — Feature 001 全栈多模态 Provider Platform

- Status: Implemented local candidate; contract/mocks, Web integration, Electron packaging and security gates complete; paid live/product acceptance remains gated
- Backend/client repository: `reedchan7/NarraStage`
- Web source baseline: `HBAI-Ltd/Toonflow-web@9c4cb0ec7d4f6b4067c7768e2df8cdc7f8587214`
- Architecture source of truth: [SPEC.md](./SPEC.md)

## Delivery strategy

采用可独立验收的 vertical slices。每个 slice 先写公开 contract/失败测试，再实现；不直接编辑 `data/web/index.html`。创建或维护 `reedchan7/NarraStage-web` fork 后，在 Web 源码完成变更，app 仅接收由锁定 revision 构建的产物。

实现最终采用本地 content-addressed candidate：Web 源码仍在独立仓库，`scripts/package-web.ts` 校验 OpenAPI 与 generated client 后，以 backend/Web content revision、锁文件和 bundle SHA-256 生成清单，再原子替换 Electron 内嵌 Web。连续两次打包已得到相同清单与 bundle；未创建远端 fork、提交或发布。

建议按单工程师 5–8 周估算；provider API 漂移、跨平台 Electron CI 和 live media 排队是主要波动项。任何 slice 未通过退出门禁时，不提前开启对应 offering。

## Slice 0 — Baseline, repositories, and release contract

### Work

- 冻结当前 backend revision、SQLite fixture 和 Web baseline；记录 backend/Web commit 与现有 bundle hash。
- 建立 `reedchan7/NarraStage-web` 的可维护 fork/branch、双 remote 与干净构建说明。
- 为当前 text/image/video/model selection/vendor settings 写 characterization tests；锁定旧 `${vendorId}:${modelName}`、任务状态和资产返回行为。
- 在 app CI 中加入 Web revision + API contract version manifest；构建时从固定 Web revision 产出单文件 bundle并执行 hash/provenance 检查。
- 定义 handshake：服务端 `/api/meta` 返回 SemVer `contractVersion`、`openapiSha256`、backend/Web revision；Web 构建内含 `supportedContractRange` 与 generated-client source hash。major 表示 breaking，minor 只允许 additive；CI/固定 Electron bundle 要求目标 artifact exact hash，standalone runtime 只按 range fail closed，hash 差异用于诊断。
- 建立 paid-live test runner：串行、显式 `NARRASTAGE_LIVE_TEST_MAX_USD`、凭据 presence check、请求次数/预计最高成本预览、脱敏录制器。

### Exit gate

- 两仓库能从干净 checkout 构建；旧行为 characterization 绿；任何 live test 在无预算或缺 Key 时安全 skip/fail closed；构建产物可追溯。

## Slice 1 — Versioned contracts, catalog, and capability kernel

### Backend

- 新建 `src/providers/domain`：structured IDs、CanonicalModel、Provider、Offering、Operation、CapabilitySchema、GenerationResult/artifacts、ProviderError、support evidence levels。
- Provider ID 使用稳定厂商名，AccessChannel 使用 `official | aggregator | compatibility`；加入带来源/时间/原币的 PriceSnapshot 与按请求计算的 CostEstimate。
- 新建 `src/providers/registry` 与 compile-time modality ports；adapter 只实现真实支持的 operation。
- 新建 `src/contracts/v2`，以 Zod 为源生成带 SHA-256 的 OpenAPI artifact；提供 catalog、preflight、support status 与 `/api/meta` handshake，并用 breaking-change diff 固定 major/minor 规则。
- 实现 OfferingPolicy：显式 pin、auto eligibility/filter/sort、no-silent-fallback 与 `submission_unknown` 决策规则。
- auto policy 不隐式偏好 official 或 aggregator；使用完整请求报价、健康、延迟和数据政策排序，报价 stale/unknown 时不做价格声称。
- 实现 `LegacyVendorAdapter` 和 legacy ID codec；在 architecture test 中禁止新业务代码 import 旧 VM/vendor internals。

### Web

- 从 OpenAPI 生成 typed client，禁止新增手写 `any` response mapping。
- 增加 canonical model/offering picker、official/aggregator/experimental/deprecated/live status badge。
- 增加 semantic form renderer；公共字段稳定，advanced provider options 按 namespace 渐进展开。

### Tests

- manifest/property/mutation tests、router eligibility/fallback matrix、PriceSnapshot/CostEstimate/汇率时效矩阵、OpenAPI breaking-change gate、backend/Web shared fixtures、legacy ID round-trip。

### Exit gate

- fixture video-only provider 可注册并通过 API/UI，无核心 provider-name branch；前后端对非法 H3 role 组合给出同一 violation code。

## Slice 2 — CredentialVault and database migration foundation

### Backend/Electron

- 用 Knex 建立带 ledger 的 versioned migrations，停止继续把架构级迁移堆进无版本 `fixDB`。
- 新建 ProviderCredential metadata 表，只存 ref、source、created/updated/lastChecked 和 health；不存明文或可逆密文到普通 JSON。
- 实现 `CredentialVault` ports：Electron async `safeStorage` + `userData` versioned ciphertext vault file、headless env refs、in-memory test vault；vault file 使用 owner-only 权限、atomic replace、tombstone 与 re-encrypt/rotation metadata。
- 新增 sandboxed/context-isolated preload，逐方法暴露 credential set/delete/status；校验 sender、payload、provider allowlist，拒绝通用 IPC passthrough。REST schema 明确拒绝 secret，desktop/local API 绑定 loopback并收紧 CORS。
- 编写旧 `o_vendorConfig.inputValues` secret 迁移：内置 schema 与 legacy `inputs[].type=password` → vault write/read-back → atomic ref replacement → canary scan；LegacyVendorAdapter 执行前只在内存副本解析 ref。Linux `basic_text` fail closed。

### Web

- Provider Settings 分离“API 服务商”和“模型”；Electron 通过 preload 可写且 secret 永不回填，standalone Web 只读 env/ref 状态。同步修改旧 settings contract，避免空 password 字段覆盖已有 ref；旧 Web contract 由 version handshake 拒绝混用。
- connection test 只返回统一 health/error，不回显 provider 原始 credential diagnostics。

### Tests

- copied legacy DB、migration interruption/retry、key rotation、temporary vault unavailable、basic_text、vault atomic-write failure/permissions、IPC sender spoof、REST secret rejection、canary secret database/log/renderer/artifact scan、managed updater downgrade refusal。

### Exit gate

- 新 provider 执行只能解析 CredentialRef；旧配置迁移可中断恢复；全链路 canary secret 无泄漏。

## Slice 3 — Durable jobs, assets, and notifications

### Backend

- 新建 `generation_jobs`、`generation_attempts`、`provider_operations`、`provider_assets` 与 event/version 字段；保留旧 `o_tasks` 为展示兼容层。
- 实现 REST client idempotency：UUIDv7 key、`(principal, operation, key)` 唯一约束、canonical request hash、same-hash 返回原 job、hash mismatch 409；覆盖双击/代理重放/断连重试。
- 实现 lease/heartbeat runner、attempt `prepared/send_started` boundary、at-most-once automatic submit、provider idempotency key support、bounded backoff+jitter、deadline 和 recovery。
- 实现 `submission_unknown` 与 reconcile：provider lookup、audited `adopt_handle / confirm_not_submitted + new attempt / abandon`；禁止不确定提交后的跨 offering fallback。
- 按 SPEC transition table 实现主状态与正交 `cancelRequestedAt/cancelReason`；`abandoned` 为未知提交的显式终态。将 `cancel_queued`、`request_cancel_running`、`delete_remote_record` 拆开；覆盖 preparing/submitting/unknown/importing、handle-late、cancel-success race，用户 cancel 永不删除 terminal MiniMax record。
- 实现 AssetGateway：metadata probe、streaming upload/download、hash、expiry cache、cleanup、统一 outbound URL policy、NarraStage-owned import。所有输入/输出 fetch 覆盖 redirect revalidation、DNS pinning/rebinding、IPv4-mapped IPv6、proxy disable、auth stripping、双重 size/timeout 和 temp cleanup。
- 提供 job submit/get/list/cancel/retry-safe API；Socket namespace 只发布 `{jobId, version}` 变更通知。

### Web/Electron

- Job store 以 REST snapshot 为真相，Socket 通知后 refetch；保留 migration 期的低频 polling fallback。
- 统一 job card 与恢复 UX；Electron 启动 runner，退出释放 lease，打包后重启恢复。

### Tests

- model-based state machine、每个网络/事务边界 crash、REST duplicate submit、lease competition、reconcile audit、duplicate notification、全阶段 cancel race、expired URL、large media streaming、输入/输出 SSRF/rebinding/redirect、Socket reconnect、packaged restart。

### Exit gate

- 外部 submit 后在每个状态 kill/restart 都不会自动重复 create；已完成输出必为本地资产；UI 刷新/重启状态一致。

## Slice 4 — DeepSeek V4 including Vision

### Adapter/catalog

- 用 `@ai-sdk/deepseek` 适配 Pro、Flash、Flash Vision Experimental；NarraStage manifest 明确 lifecycle 和 supported operations。
- 覆盖 thinking enabled/disabled/adaptive、reasoning effort、stream/tool continuity、Responses/Files 所需语义。
- Vision input normalizer 支持 JPEG/PNG/GIF/WebP、inline/HTTPS/Files、detail 和 user-message-only；按官方限制 preflight 并通过 AssetGateway 选择传输方式。

### Web

- 对话/Agent attachment 支持 image chips、预览、detail、限制反馈、Files reuse 状态和 experimental badge。

### Tests/live

- Wire fixtures、reasoning/tool multi-turn、400/429/5xx、图片内容与 MIME 欺骗、边界大小/数量、inline-vs-Files。
- 使用现有 `DEEPSEEK_API_KEY` 跑最小 text + OCR + chart + multi-image + Files live suite；记录 request id/usage，不保存素材或 key。

### Exit gate

- DeepSeek Pro、Flash、Vision 三个 Enabled targets 各自达到 release matrix 的 product_accepted；任一模型不能借用同 family 的证据。

## Slice 5 — fal aggregator and MiniMax H3

### fal channel

- 增加 `@fal-ai/client` 与共享 fal adapter：storage、queue submit/status/result/cancel、webhook capability flag、统一错误与 usage。
- 为 canonical `minimax:h3` 建立 fal offering，operation 映射三个 endpoint；保留 endpoint 独立 schema，不通过改字符串假装兼容。
- OfferingPolicy 允许 H3 选择 `fal`，并为未来其他 fal-hosted canonical model 复用同一 transport，不复制 queue 代码。

### MiniMax Official

- 实现 `/v2/video_generation` create/query/list/cancel-delete，严格 `content[]` roles、keyframe/reference 互斥、媒体限制、768P/2K 与 4–15 秒。
- `providerId=minimax` + `channel=official` offering 在缺 credential 时保持 disabled/live-unverified，但完整进入 catalog/support status。

### Web

- H3 表单覆盖 text、first/last frame、reference image/video/audio；素材按 role 排序，可切换/pin “Official / via fal.ai”，展示差异参数和验证状态。

### Tests/live

- fal queue/storage/cancel fixture、三 endpoint schema、running cancel best-effort、expired result URL、usage/error mapping。
- MiniMax official 使用官方 OpenAPI-derived fixtures + local mock server 覆盖 create/query/list/cancel 与所有边界。
- 从 KnipCut 受保护配置向 live child process 临时注入 fal credential，串行跑 H3 text/image/reference 与 cancel；不复制 credential 到 NarraStage。用第二个 fal fixture manifest 证明 transport 可复用。`MINIMAX_API_KEY` 未提供时 official live case 明确 skip。

### Exit gate

- H3 canonical model 的 fal offering 达到 product_accepted；MiniMax official 达到 contract_verified 且 UI 明确 live-unverified。提供 Key 后只需启用 official live suite，不改 domain/UI。

## Slice 6 — Google Gemini full provider

### Adapter/catalog

- 使用 `@ai-sdk/google` 注册 `gemini-3.7-flash` language/multimodal、Nano Banana 2/Lite/Pro image generate/edit、Gemini Omni Flash、Veo 3.1/3.1 Fast/3.1 Lite async video offerings。
- Files、Search/Grounding、Interactions、Live、speech 各自声明 capability 和 lifecycle；本期没有完整产品 UX 的 operation 保持 catalog-visible but disabled，不伪装支持。
- 对 SDK experimental surface 增加 adapter-local compatibility tests；只有明确缺口才引入 `@google/genai` 窄实现。

### Web

- language multimodal attachment、Files、Search/Grounding、Nano Banana generate/edit/ref image、Omni/Veo job 参数与 grounding/tool indicators 由 schema 驱动。
- lifecycle banner 提示 preview/deprecated/shutdown；不展示已过期 Imagen/Veo 2/3 为可选项。

### Tests/live

- stream/tool/structured output/multimodal、Files expiry、image output parts、video long-running operations、deprecated model fixture。
- 用现有 `GEMINI_API_KEY` 按 release matrix 分别跑 3.7 language/multimodal/Search/Files、三个 Nano Banana generate/edit、Omni 与选定 Veo operations；video 以最小允许输入在预算门禁内串行验证。

### Exit gate

- Release matrix 的 Gemini Enabled targets 全部达到 product_accepted；Live/TTS/specialized agents 保持明确 Disabled 且不计入“已支持”。UI/后端对 lifecycle 与 unsupported capability 一致 fail closed。

## Slice 7 — Full-stack hardening and release

### Gates

- Backend: format/lint/typecheck/unit/integration、new critical modules branch coverage ≥90%、transition coverage 100%、mutation ≥80%。
- Web: typecheck/Vitest/component/a11y/i18n、Playwright desktop/responsive、API compatibility。
- Electron: macOS/Windows/Linux packaged smoke、preload/IPC security、restart recovery、clean install/upgrade、同一新二进制 feature rollback、managed updater downgrade refusal。
- Security: dependency audit、secret scan、SSRF suite、CSP/navigation/window-open policy、legacy script trust labeling。
- Live/product matrix: 逐 offering 执行预注册样本与 rubric；证据绑定 resolved revision/manifest/SDK，30 天或 revision 变化后失效。DeepSeek、fal H3、Gemini Enabled targets 必须全绿；MiniMax official 的唯一允许空格是 credential-gated live，必须明确显示状态。

### Rollout

- Feature flags 顺序：read-only catalog → preflight → job runner → DeepSeek → fal H3 → Gemini → MiniMax official。
- 先内部/本地 acceptance，再默认新安装；升级用户双读两个发布周期。
- 发布说明列出每个 offering 的四级 evidence，不用“支持”一词掩盖 mock-only 或 missing credential。

## Planned repository boundaries

### NarraStage

- `src/providers/`: domain, registry, policy, ports, built-in adapters, legacy adapter。
- `src/generation/`: service, durable runner, state machine, reconciliation。
- `src/assets/`: media metadata, provider uploads, secure import。
- `src/security/credentials/`: vault ports and redaction。
- `src/contracts/v2/` and `src/routes/v2/`: Zod/OpenAPI and REST handlers。
- `src/lib/migrations/`: versioned migration ledger and migrations。
- `scripts/preload.ts`, Electron lifecycle/build provenance。
- `tests/contract`, `tests/integration`, `tests/fault`, `tests/live`, `tests/electron`。

### NarraStage-web

- `src/api/generated/`: generated v2 client; no hand editing。
- `src/features/providers/`: provider credentials/health/settings。
- `src/features/models/`: canonical catalog, offering picker, lifecycle badges。
- `src/features/generation/`: schema forms, assets, job store/cards/recovery。
- `src/features/chat/attachments/`: DeepSeek/Gemini multimodal input。
- `src/test`, `e2e/`: Vitest/MSW/Playwright/a11y/i18n。

## Immediate first implementation checkpoint

批准后第一轮只完成 Slice 0–1，不发起付费请求：两仓库 baseline、characterization、OpenAPI v2、catalog/offering domain、preflight、legacy adapter 和 Web generated client。该 checkpoint 会验证最关键的 fal/模型归属分离是否贯穿后端与前端，再继续凭据与 durable job 基础设施。
