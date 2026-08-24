# Feature 001 — 全栈多模态 Provider Platform

- Status: Local implementation candidate; release acceptance open
- Approval gate: Approved version 4 · normative digest eaaf9fca4e4d8e23895dd3d9a88cdbb5a2fbe4229d45d41b503c8187bc99f9fa for implementation
- Assurance: deep
- Spec version: 4 · Created: 2026-08-23 · Owner: reedchan
- Base revision: `56f88fb6034cea88266f3cd324a8a176a77ea5a9`
- Raw ask: 架构级支持 DeepSeek V4（含最新视觉模型）、MiniMax H3、fal.ai、Google Gemini；后端、Web、Electron 客户端全部支持；测试充分并可使用现有凭据做真实验收。
- Research: [RESEARCH.md](./RESEARCH.md)
- Delivery plan: [PLAN.md](./PLAN.md)

## Problem and evidence

NarraStage 当前的 vendor-script 机制适合快速接单个 endpoint，但它把模型身份、API 供应商、能力声明、异步轮询和用户配置混在一段可编辑脚本里。H3、fal queue、Veo 和视觉 Files 输入已经超出四个同步函数与字符串 mode DSL 能忠实表达的范围；Web 只能在请求时猜参数，Electron 退出后也不能恢复已付费任务。

| Evidence | Class | Consequence |
|---|---|---|
| provider contract 固定为 text/image/video/tts 四函数 | observed | video-only provider 也需适配错误抽象；provider 差异进入业务层 |
| H3 与 fal 使用异步 operation，现有轮询藏在函数内部 | observed | request id、取消、恢复、幂等与阶段延迟不可见 |
| model schema 在脚本与 Web 中重复且松散 | observed | 非法素材组合可能在付费提交后才失败 |
| `node:vm` 获得网络与宿主工具 | observed | 只能视为 trusted local，不是第三方插件安全边界 |
| Web 源码位于独立 NarraStage-web 仓库，app 只含 bundle | observed | 必须建立跨仓库 contract 与可复现前端构建 |
| Electron 当前没有凭据 vault/窄 preload bridge | observed | API Key 可能继续进入普通配置、renderer 或 SQLite |
| DeepSeek 视觉、Gemini 与 H3 模型生命周期快速变化 | observed | “静态模型名 + 永久支持”会持续过期 |

如果只增加四个脚本，短期 diff 较小，但会继续放大上述耦合。用户明确要求正式的全栈平台能力，因此采用增量替换架构：新 provider 进入 typed kernel，旧脚本留在兼容层，避免一次性重写全部历史供应商。

## Outcome hypothesis

- Baseline: 新 provider 复制完整 vendor 模板与轮询；UI、服务端各自解释能力；进程重启会丢失媒体任务；凭据与普通配置同存。
- Target: 新 provider 只实现所需 operation adapter、offering manifest 与 contract tests；Web 从同一 contract 渲染和 preflight；已提交任务可恢复；凭据只通过引用进入执行层。
- Measurement: provider contract suite、catalog/preflight matrix、跨仓库 OpenAPI compatibility、restart/crash probes、密钥泄漏扫描、Web/Electron E2E、真实 API acceptance matrix。
- Decision rule: 四家均通过统一契约；MiniMax H3 经 fal 完成 live acceptance，MiniMax official offering 在缺 Key 时明确标记为 live-unverified；核心业务层没有四家的 provider-name 分支。

## Goals

- 一等支持 DeepSeek V4 Pro/Flash/Flash Vision Experimental。
- 一等支持 MiniMax H3 canonical model；现在用 fal offering 实测，并实现 `providerId=minimax` 的 official offering 以便凭据到位后启用。
- 一等支持 fal.ai 作为聚合执行平台，允许同一 canonical model 有多个 provider offering。
- 一等支持 Google Gemini language/multimodal、Nano Banana image generation/editing 和异步 video；Files、Search/Grounding、Interactions/Live 独立声明能力。
- 建立按 operation 的 provider kernel、声明式 capability、可恢复 job、资产网关、统一错误和凭据 vault。
- 后端、Web、Electron 同时交付，并保留旧配置和可信本地脚本的渐进迁移路径。

## Non-goals

- 不建设公开第三方 provider marketplace、插件签名或不可信脚本沙箱。
- 不一次性重写所有历史 vendor，也不承诺跨 provider 的输出、参数、价格或 SLA 等价。
- 不把 live model discovery 当成生产 catalog 的自动真相。
- 不引入 Temporal 等外部 workflow 基础设施；本地 SQLite 仍是事实来源。
- 本设计阶段不执行付费生成、不写入生产服务、不提交或发布代码。

## Global constraints

- 产品同时运行于 Bun/Express 服务端、独立 Vue Web 和 Electron 桌面端；默认没有公网 webhook。
- renderer、REST 响应、日志、job payload、OpenAPI 与 Socket 事件均不得包含 secret。
- provider operation 必须带 schema version 且可 JSON 序列化；大媒体不得嵌入 job JSON。
- provider 返回的 URL 与 redirect 均按不可信输入处理；最终结果必须进入 NarraStage-owned storage。
- unsupported 与 unavailable 是不同状态；未知参数、隐式降级和静默 provider fallback 均被禁止。
- 现有 `${vendorId}:${modelName}` 可继续读取；新 API 使用结构化 ID，不再依赖字符串 split。
- 构建产物必须能追溯 backend revision、Web revision 和 API contract version。
- Desktop/local API 必须显式绑定 loopback、限制 CORS 到内置/开发 Web origin 并拒绝跨站 credentialed requests；standalone remote deployment 必须配置 TLS reverse proxy、allowed origins 与现有 auth，但本期仍不提供 REST secret write。

## Shared vocabulary and domain model

- **CanonicalModel:** 原始模型身份、owner、family、生命周期和产品展示信息。例如 `minimax:h3`，不绑定从哪家 API 购买。
- **Provider:** 认证、计费、地域、协议和健康边界。ID 使用稳定厂商名，例如 `minimax`、`fal`、`deepseek`、`google`，不把 `direct` 或 `official` 编入 Provider ID。
- **AccessChannel:** Offering 的访问关系，取值 `official | aggregator | compatibility`。MiniMax 原厂是 `official`，fal 代运行 H3 是 `aggregator`；该字段用于展示、政策和数据治理，不替代 Provider 身份。
- **Offering:** 某 Provider 对 CanonicalModel 的可执行暴露，包含 provider model id、access channel、operation 集合、capability overlay、区域、生命周期、验证状态和可时效化的计费描述。fal 的 H3 是 offering，不会把 H3 归属改成 fal。
- **PriceSnapshot / CostEstimate:** PriceSnapshot 保存 offering-operation 的原始币种、计费单位、输入/输出附加项、来源、账户范围和 `asOf`；CostEstimate 针对具体请求计算原币与展示币金额，并带汇率值/时间/来源。估算不是最终账单。
- **Operation:** language.generate/stream、image.generate/edit、video.generate/status/cancel、files.upload 等独立能力；每项有公共输入、严格约束和 namespaced provider options。
- **CapabilitySchema:** 服务端权威的输入/输出/限制 schema，并附语义化 UI schema、warning 和显式 coercion。Web 可复用生成表单，服务端必须重新验证。
- **OfferingPolicy:** 从符合 operation 与 capability 的 offering 中选择执行渠道。用户可 pin；auto 策略才可排序。
- **CredentialRef:** 指向 vault/env secret 的不透明引用；Provider adapter 只能在执行瞬间解析。
- **MediaAssetRef / ProviderAssetRef:** NarraStage 永久资产与短期 provider 上传物分离，后者记录过期时间和 cleanup 信息。
- **GenerationResult:** 统一承载零到多个 typed artifacts、可选文本、usage/cost、provider metadata 与 provenance；image/video adapter 不再退化成单个 URL 字符串。
- **GenerationJob:** 持久化 product request、chosen offering、operation、opaque provider handle、状态、lease、next poll、usage 与错误。
- **ProviderError:** `auth | invalid_input | billing | quota | rate_limit | moderation | unavailable | timeout | cancelled | invalid_response | submission_unknown`，含 retryability、request id 和脱敏 detail。

## Architecture

```text
Vue Web / Electron renderer
  │  generated typed client + semantic UI schema
  ▼
Versioned REST API ───────────── Socket notifications
  │                                  │
  ▼                                  └── refetch REST snapshot after reconnect
Catalog + Preflight ── OfferingPolicy
  │
  ▼
GenerationService
  ├── LanguagePort
  ├── ImagePort
  ├── AsyncVideoPort
  ├── FilesPort
  └── LegacyVendorAdapter (trusted local only)
             │
   DurableJobRunner + AssetGateway + CredentialVault
             │
  DeepSeek | Google | MiniMax Official | fal aggregator
```

### Catalog and routing rules

1. Catalog 先按 CanonicalModel 组织，再展示可用 offering。前端可显示 “MiniMax H3 · Official” 与 “MiniMax H3 · via fal.ai”，而项目保存结构化 canonical model 与 offering preference。
2. 选择时依次过滤 lifecycle、operation、capability、credential、region、health 和 support evidence。显式 pin 的 offering 不可被静默替换；auto 只在合格候选中按显式 policy profile 比较完整 CostEstimate、延迟、可用性和数据政策，不因 `official/aggregator` 标签隐式加权。
3. fal 可被设为某模型、某 operation 或某策略 profile 的首选渠道，但不是无条件全局入口。H3 在 MiniMax credential 缺失时默认经 fal；两边均可用后可按分辨率和完整素材计费选路。
4. 只有在外部 submit 尚未发生，或 provider 支持同一 idempotency key 时，才能自动换渠道/重试。进入 `submitting` 后发生不确定网络结果且无法对账时，job 进入 `submission_unknown`，禁止自动再次付费提交。
5. model discovery 只更新候选/健康信息；curated offering manifest 决定产品是否支持，且记录 `lastVerifiedAt`、`experimental/deprecated` 与 live acceptance 状态。
6. 价格不写入 CanonicalModel，也不将汇率换算结果当作永久真相。preflight 使用有时效的 PriceSnapshot 返回可解释的估算分项；快照过期、计费单位无法换算或账户折扣未知时显示 unknown/stale，不伪造精确报价。

### Durable job lifecycle

主状态为 `queued | preparing_assets | submitting | submitted | remote_queued | running | importing | submission_unknown | succeeded | failed | cancelled | abandoned`。`cancelRequestedAt`/`cancelReason` 是正交 intent 字段；UI 可显示“cancel requested”，但它不是主状态。`providerOutcome` 独立记录 unknown/queued/running/succeeded/failed/cancelled，使“provider 已成功但用户在导入时取消”仍可保留计费事实。

| Current | Event / guard | Next / effect |
|---|---|---|
| queued | runner claims / user cancels | preparing_assets / cancelled |
| preparing_assets | assets ready / definitive error / user cancels | submitting / failed / cancelled + cleanup |
| submitting | handle atomically persisted / definitive rejection / ambiguous after `send_started` | submitted / failed / submission_unknown |
| submitting | user cancels | state unchanged; set intent; cancel after handle arrives |
| submitted | first provider status queued/running/succeeded/failed/cancelled | remote_queued / running / importing / failed / cancelled |
| remote_queued | running/succeeded/failed/cancelled | running / importing / failed / cancelled |
| running | succeeded/failed/cancelled | importing / failed / cancelled |
| submitted/remote_queued/running | user cancels | state unchanged; set intent and invoke only declared cancel capability |
| importing | atomic asset commit / import error | succeeded / failed-with-resumable-import metadata |
| importing | user cancels before/after atomic commit | cancelled with `providerOutcome=succeeded` / succeeded |
| submission_unknown | provider lookup/adopt finds handle | submitted or observed remote state; preserve cancel intent |
| submission_unknown | audited `confirm_not_submitted` with evidence / `abandon` | queued with a new attempt and external idempotency key / abandoned |
| submission_unknown | user cancels without handle | state unchanged; set intent; reconcile still required |
| terminal | remote record cleanup | no job-state change; maintenance audit only |

- Job 与 submission attempt 在发起网络请求前落库。Provider 支持幂等键时复用同一键；不支持时采用 at-most-once automatic submit，并诚实暴露未知结果。
- Client 在每次用户动作生成 UUIDv7 idempotency key；服务端以 `(principal, operation, key)` 建唯一约束并保存 canonical request hash。相同 key/hash 返回原 job，不新建或重提；相同 key/不同 hash 返回 409。该记录至少随 job 保留。
- Attempt 分为 `prepared` 与 `send_started`：crash 在 `send_started` 前可安全恢复；写入 `send_started` 后，只要 provider 不支持幂等/按 client key 对账，任何断连或 handle 未落库都进入 `submission_unknown`。
- Runner 用 lease/heartbeat 认领工作；重启后只恢复已持久化 handle 的 status/import，不重复 create。Poll 使用 provider hint 或 bounded exponential backoff + jitter；retry budget、deadline 与 rate-limit reset 均持久化。
- Reconcile 先尝试 provider lookup；人工动作只允许 `adopt_handle`、有证据的 `confirm_not_submitted` 后新建 attempt、或 `abandon`，并记录 actor/time/reason。`abandoned` 是终态但不推断 provider 是否计费。
- Adapter 分别声明 `cancel_queued`、`request_cancel_running`、`delete_remote_record`；用户取消永不调用 terminal record deletion，只有 provider 确认 cancel 才进入 `cancelled`。
- Socket.IO 只发 job version/changed 通知。SQLite + REST snapshot 是唯一事实来源，断线重连必须 refetch。

### Assets and security

- preflight 根据 MIME、字节、尺寸、时长、数量、role 和 offering 限制决定 inline、外链或 Files/storage upload；不把大文件统一转 base64。
- 上传复用按 provider、credential、asset hash 与 expiry 缓存；provider asset 过期后重传。成功输出先完成 SSRF/redirect/DNS 校验，再流式导入本地资产并校验 MIME/size/hash。
- 所有服务端 URL fetch 都经过同一 outbound policy，包括用户输入 metadata/fetch、provider upload source 和结果导入：仅允许明确 scheme，逐次 redirect 复验，解析并 pin 公网连接地址，覆盖 IPv4-mapped IPv6/DNS rebinding，禁用环境 proxy 与 auth forwarding，并限制连接/总超时、压缩/解压后字节及临时文件生命周期。
- 内置 adapter 是受控源码。旧 vendor scripts 保留为 trusted-local compatibility，UI 明示其权限；它们不得被称为 sandboxed，也不能承载无审核 marketplace。

### Credentials

- Provider 配置只保存 `CredentialRef` 和非敏感字段。API 只返回 configured/source/health，不返回 key、尾号或可逆密文。
- Electron 是唯一允许 UI 写入 secret 的形态：renderer → 窄 preload IPC → main-process CredentialVault；REST 明确拒绝 secret 字段。异步 `safeStorage` 的 ciphertext 存在 `userData` 下专用 versioned vault file，采用 owner-only 权限、temp write + fsync + atomic rename、逐条 provider/slot metadata、删除 tombstone 和 key-rotation/re-encrypt 记录；Linux `basic_text` 或加密不可用时 fail closed。
- Standalone Web/server 只读取环境变量或部署 secret reference，设置页仅显示 configured/source/health 并给出部署说明，不能保存/替换 secret。远程部署的 HTTPS secret manager/管理授权不在本期；普通 API 仍需显式 allowed origins，desktop/local mode 绑定 loopback。
- KnipCut fal credential 只允许在 live-test child process 临时注入，不进入 NarraStage vault。vault ciphertext 可随本机备份保存，但不可导出明文，且跨用户/机器恢复不保证可解密。
- 升级时先按内置 credential schema 与 legacy `inputs[].type=password` 识别 secret，写入 vault并读回验证，再用 credential ref 替换明文；LegacyVendorAdapter 仅在内存副本中解析这些 ref 后执行脚本。未声明为 password 的自定义字段不做猜测迁移，并在 UI 提示作者修正 schema。失败则保持旧值并阻止启用对应 adapter。
- Credential migration 是单向安全迁移。回滚只支持新二进制内关闭 feature/adapter；旧二进制 downgrade 不在回滚合同内，因为既有旧版本无法理解 ref。受管理的 updater 记录 minimum compatible version 并阻止降级；手工启动旧二进制可能失去 provider 认证能力。用户可删除/重录 credential，但不会生成含明文的 downgrade backup。

### Web and Electron product behavior

- Provider Settings 按 API Provider 管理凭据与连接测试；Electron 可通过 preload 保存，standalone Web 只读。Model Catalog 按 CanonicalModel 展示 offering、官方/聚合标签、experimental/deprecated、credential/health/live-verification 状态。
- Model picker 默认展示 canonical model，可展开或 pin offering。Capability-driven form 只显示合法 role、素材数量、格式、时长、分辨率与 provider 高级选项；服务端返回同字段的 preflight 结果。
- 对可计价操作，preflight 同时显示各 offering 的原币/用户显示币估算、汇率时间和价格时效。用户 pin 时不因价差自动改道；auto 要在提交前说明选路原因。
- DeepSeek Vision 在对话/Agent 输入中支持图片 attachment、detail 与 Files reuse；UI 提前显示格式/大小/数量限制，且禁止把图片附到非 user message。
- 媒体生成统一显示 queued/preparing/submitting/running/importing/cancel requested/terminal，刷新或重启后恢复；错误展示统一类别、provider request id 与可操作建议。
- NarraStage-web 使用后端 OpenAPI 生成 client；app 发布流水线从固定 Web revision 构建 `data/web`，并执行 contract compatibility。Electron main process启动 runner、暴露窄凭据 bridge，并在退出时释放 lease，不把已确认远端任务误标失败。
- OpenAPI artifact 由后端生成并附 SHA-256；`/api/meta` 返回 SemVer `contractVersion`、`openapiSha256`、backend/Web revision。Web 构建内嵌 `supportedContractRange` 与生成 client 的 source hash；major 只用于 breaking change，minor 只允许 additive。CI 与固定 Electron bundle 要求目标 artifact exact hash；standalone Web runtime 只以 SemVer range 判兼容，hash 仅用于诊断/追溯，避免 additive minor 被误阻断。

## Design decisions

- 选择 Capability Kernel + durable jobs + LegacyVendorAdapter；拒绝继续扩展四函数脚本，也暂不建设 out-of-process marketplace host。
- fal 定位为 Provider/aggregator，其托管模型通过 Offering 关联原始 CanonicalModel；同一模型允许官方与聚合渠道并存。
- Provider ID 使用厂商名，`official/aggregator/compatibility` 由 AccessChannel 表达；价格与汇率是 Offering 的有时效快照，不参与模型归属。
- SQLite/REST 是 job 真相，Socket 只通知；异步 adapter 暴露 start/status/result/cancel 和可序列化 operation。
- Zod/OpenAPI 是跨仓库 API 真相，Web 使用生成 client；Electron 产物固定并记录 Web revision。
- CredentialVault 分离 secret 与 provider config；桌面使用 OS-backed `safeStorage`，headless 使用 env/secret ref。
- 自动 retry/fallback 的安全边界是“尚未提交”或“可证明幂等”；其余不确定提交进入 `submission_unknown`。

## Release support matrix

“Enabled target” 是本期必须交付的用户可用状态，不能通过保持 disabled 满足退出门禁。每个 offering 独立记录 model revision/alias、capability、credential、evidence 与 `lastVerifiedAt`。

| Canonical model / platform | Offering | Required operations and UX | Release target | Required evidence |
|---|---|---|---|---|
| DeepSeek V4 Pro | DeepSeek official | language generate/stream, tools, thinking；Chat/Agent 与设置页 | Enabled | product_accepted |
| DeepSeek V4 Flash | DeepSeek official | language generate/stream, tools, thinking；Chat/Agent 与设置页 | Enabled | product_accepted |
| DeepSeek V4 Flash Vision Exp | DeepSeek official | text+image→text, inline/URL/Files, detail；attachment UX | Enabled + Experimental badge | product_accepted |
| MiniMax H3 | fal.ai | t2v, first/last frame, multimodal reference, queue/status/result/cancel；Workbench/job UX | Enabled | product_accepted |
| MiniMax H3 | MiniMax official | 同上，使用 v2 content roles | Disabled only while credential missing；Key 到位后必须过 live gate 才启用 | contract_verified now; product_accepted before enable |
| fal platform transport | fal.ai | storage, queue, status, result, queued/running cancel semantics, optional webhook | Enabled infrastructure；不伪装成模型 | live_verified through H3 plus contract suite |
| Gemini 3.7 Flash | Google official | language generate/stream/tools, text/image/video/audio/PDF→text, Files, Search/Grounding；Chat/Agent UX | Enabled | product_accepted |
| Nano Banana 2 / 2 Lite / Pro | Google official | image generate/edit/reference, mixed text+image result；Assets/Workbench UX | Enabled per offering | product_accepted per offering |
| Gemini Omni Flash | Google official | video generate + conversational edit, multimodal inputs；Workbench/job UX | Enabled + Preview badge | product_accepted |
| Veo 3.1 / Fast / Lite (`veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.1-lite-generate-preview`) | Google official | video generate and each model-declared frame/extension controls；Workbench/job UX | Enabled per offering + Preview badge | product_accepted per offering |
| Gemini Live/TTS/specialized agents | Google official | realtime/speech/agent-specific operations | Catalog-visible, Disabled, not counted as supported this release | contract declaration only |

Support levels have fixed meaning: `implemented` = code/schema exists；`contract_verified` = deterministic mock/fixture suite passes；`live_verified` = credentialed protocol call passes；`product_accepted` = live structural gate plus dated quality rubric passes。只有表中 Enabled target 达到 required evidence 才能对外声称本期支持。

## Acceptance criteria

- **AC-001** GIVEN 一个 canonical model 同时由官方和 fal 暴露 WHEN catalog 被查询 THEN THE SYSTEM SHALL 返回一个模型身份及两个独立 offering，并保留原始 owner。
  Verify: catalog contract test for MiniMax H3.
- **AC-002** GIVEN 任一新 provider adapter WHEN 它注册所需 operations THEN THE SYSTEM SHALL 无需在核心业务层增加 provider-name 条件分支。
  Verify: static architecture test plus video-only fixture provider.
- **AC-003** GIVEN capability schema WHEN Web 渲染表单且服务端执行 preflight THEN THE SYSTEM SHALL 对相同输入产生相同 violations/warnings，服务端仍执行最终校验。
  Verify: shared fixture suite in backend and generated Web client.
- **AC-004** GIVEN DeepSeek Vision 合法的 inline、URL 或 Files 图片 WHEN 用户发起多模态请求 THEN THE SYSTEM SHALL 使用 `deepseek-v4-flash-vision-exp` 并保留 detail、role 与限制语义。
  Verify: adapter fixtures plus credentialed OCR/chart/multi-image live suite.
- **AC-005** GIVEN MiniMax H3 text/keyframe/reference 请求 WHEN offering 为 fal THEN THE SYSTEM SHALL 选择正确 fal endpoint 并完成 queue/status/result/import；WHEN offering 的 Provider 为 `minimax` 且 AccessChannel 为 `official` THEN THE SYSTEM SHALL 生成符合 v2 `content[]` 的请求。
  Verify: fal live suite and MiniMax official mock/contract suite.
- **AC-006** GIVEN 一个外部已确认的异步任务 WHEN应用在任一后续状态退出并重启 THEN THE SYSTEM SHALL 从持久 handle 恢复且不重复 create。
  Verify: crash-at-transition integration matrix.
- **AC-007** GIVEN submit 结果无法确认且 provider 不支持幂等/对账 WHEN runner 恢复 THEN THE SYSTEM SHALL 标记 `submission_unknown` 并禁止自动重提或换渠道。
  Verify: connection-drop fault injection.
- **AC-008** GIVEN preparing_assets、submitting、submitted/queued、running、importing、submission_unknown 或 terminal 任务 WHEN 用户取消 THEN THE SYSTEM SHALL 按阶段与 offering capability 记录 intent，且绝不把 MiniMax terminal delete 当作 cancel。
  Verify: full-stage cancel/success/handle-late race matrix for fal and MiniMax official.
- **AC-009** GIVEN任一用户输入或 provider 输出 URL 解析到 private、loopback、link-local、IPv4-mapped IPv6、DNS-rebound 或恶意 redirect 地址 WHEN服务端 metadata probe、upload 或 import THEN THE SYSTEM SHALL 拒绝连接且不使用环境 proxy或转发 credential header。
  Verify: outbound-policy integration suite including redirects, pinned DNS, timeouts and compressed/decompressed size limits.
- **AC-010** GIVEN 用户在 Electron 保存 Provider Key WHEN设置页重新打开或 job 执行 THEN THE SYSTEM SHALL 仅经 preload/main vault 使用并只显示配置状态；GIVEN standalone Web WHEN打开同一页 THEN THE SYSTEM SHALL 只读展示 env/ref 状态且不能提交 secret。
  Verify: preload IPC, REST secret rejection, standalone UI, vault-file and canary scan tests.
- **AC-011** GIVEN模型、offering 或参数生命周期变化 WHEN catalog 刷新 THEN THE SYSTEM SHALL 显示 experimental/deprecated/unavailable/live-unverified 状态且不自动启用未知模型。
  Verify: lifecycle fixture and UI component tests.
- **AC-012** GIVEN Web 刷新、Socket 断线或 Electron 重启 WHEN job 仍非终态 THEN THE SYSTEM SHALL 从 REST snapshot 恢复同一 job 与进度。
  Verify: browser and packaged Electron E2E.
- **AC-013** GIVEN Electron 固定 bundle 的目标 OpenAPI hash 与构建 artifact 不同 WHEN构建/打包 THEN THE SYSTEM SHALL fail；GIVEN standalone Web 的 supported range 不包含服务端 `contractVersion` WHEN启动 THEN THE SYSTEM SHALL 显示升级阻断页；兼容 additive minor 的 hash 差异只记录诊断。
  Verify: exact-hash build tests plus major/minor standalone runtime range matrix.
- **AC-014** GIVEN MiniMax official credential 缺失 WHEN支持状态被查询 THEN THE SYSTEM SHALL 报告 adapter/mock verified 但 live unverified，同时允许 H3 经 fal live-verified offering 使用。
  Verify: support-status API and UI test.
- **AC-015** GIVEN双击、客户端超时重试、代理重放或服务端重启 WHEN相同 principal/operation/idempotency-key 与 request hash 再次提交 THEN THE SYSTEM SHALL 返回同一 job；若 hash 不同则返回 409。
  Verify: concurrent duplicate-submit and disconnect/restart API integration suite.
- **AC-016** GIVEN job 处于 submission_unknown WHEN operator 执行 reconcile THEN THE SYSTEM SHALL 只允许 adopt_handle、confirm_not_submitted/new-attempt 或 abandon，并记录不可修改的 actor/time/reason audit。
  Verify: reconciliation authorization, transition and audit tests.
- **AC-017** GIVEN DeepSeek V4 Pro 与 Flash 的 enabled target WHEN release gate 运行 THEN THE SYSTEM SHALL 分别完成 stream、tool、thinking 与多轮 reasoning contract/live/product acceptance。
  Verify: per-model evidence records required by the release matrix.
- **AC-018** GIVEN Gemini 3.7、三个 Nano Banana offering、Gemini Omni Flash 与 Veo 3.1/3.1 Fast/3.1 Lite WHEN release gate 运行 THEN THE SYSTEM SHALL 完成矩阵声明的 language/multimodal/image/video/Search/Files operations 与 Web/Electron UX，不能以 disabled 通过。
  Verify: matrix-generated contract, live, product and E2E suites with one evidence record per enabled offering.
- **AC-019** GIVEN H3 与另一个 fal fixture offering WHEN二者执行 storage/queue/status/result/cancel THEN THE SYSTEM SHALL 复用同一 fal transport 且仅替换 offering operation schema。
  Verify: shared fal transport contract tests with two independent manifests.
- **AC-020** GIVEN release support matrix 中任一 Enabled target 缺少 required evidence 或 evidence 已过期 WHEN生成发布包 THEN THE SYSTEM SHALL fail closed 并阻止宣称该 offering 已支持。
  Verify: release-gate fixtures for missing, stale, disabled and passing evidence.
- **AC-021** GIVEN 同一 H3 请求有 MiniMax 国内 official 与 fal offering 且二者均可用 WHEN preflight 或 auto routing 运行 THEN THE SYSTEM SHALL 按各自原币完整计算输出、额外图像和引用视频费用，用带时间/来源的汇率统一展示，并在报价不可比时禁止声称某渠道更便宜。
  Verify: price fixture matrix for 768P/2K, extra image, reference video, stale FX, account-specific compute-unit pricing and explicit-pin/no-switch behavior.

## Regression contract

- **RC-001** GIVEN 旧 `${vendorId}:${modelName}` 选择 WHEN升级数据库 THEN THE SYSTEM SHALL 可解析并映射到 legacy offering，且不改写原业务选择直到显式保存。
  Verify: copied-database migration suite.
- **RC-002** GIVEN现有 language agent WHEN使用旧 provider THEN THE SYSTEM SHALL 继续 stream text 和 tool results。
  Verify: characterization fixtures for current agents.
- **RC-003** GIVEN现有 image/video consumer WHEN job 成功 THEN THE SYSTEM SHALL 继续得到 NarraStage-owned asset identity，而非临时 provider URL。
  Verify: route integration tests.
- **RC-004** GIVEN用户继续使用 custom vendor script WHEN打开设置和执行 THEN THE SYSTEM SHALL 在 trusted-local 标签下保持 load/test/delete 能力。
  Verify: legacy adapter UI/API regression suite.

## Non-functional requirements

- **NFR-001** GIVEN任一 acknowledged operation WHEN发生 crash/restart THEN THE SYSTEM SHALL 不自动重复付费 submit，并在无法证明状态时进入 submission_unknown。
  Verify: deterministic fault injection at every persistence/network boundary.
- **NFR-002** GIVEN新 kernel/job/credential 代码 WHEN CI 运行 THEN THE SYSTEM SHALL 达到至少 90% branch coverage、关键状态转换 100% 覆盖且关键纯逻辑 mutation score 至少 80%。
  Verify: coverage and mutation reports scoped to new modules.
- **NFR-003** GIVEN任一内置 credential 或声明为 password 的 legacy input WHEN运行、报错、导出诊断或录制 fixture THEN THE SYSTEM SHALL 不在数据库普通列、renderer、日志、snapshot 或 artifact 中出现原值。
  Verify: seeded canary-secret end-to-end scan.
- **NFR-004** GIVEN一个 video-only provider WHEN接入 THEN THE SYSTEM SHALL 不实现空 language/image/speech ports，且核心无 provider branch。
  Verify: compile-time contract fixture and static dependency rules.
- **NFR-005** GIVEN catalog/job API 的常规本地负载 WHEN测量 THEN THE SYSTEM SHALL 在不计 provider latency 时达到 catalog/preflight p95 100 ms 内、job state write p95 50 ms 内。
  Verify: repeatable local benchmark with dataset size documented in report.
- **NFR-006** GIVEN任一 provider call/job WHEN观察 telemetry THEN THE SYSTEM SHALL 输出低基数 provider/offering/model/operation/state、phase latency、request id、usage/cost（若提供），默认不记录 prompt 或 media。
  Verify: telemetry snapshot tests.
- **NFR-007** GIVEN schema、operation 或 OpenAPI 版本变化 WHEN读取旧持久数据或构建 Web THEN THE SYSTEM SHALL 使用显式 migrator或产生 terminal incompatibility/build failure。
  Verify: N-1/N compatibility matrix.
- **NFR-008** GIVEN支持的桌面和 Web viewport/locale WHEN用户配置 provider、上传视觉输入或管理 job THEN THE SYSTEM SHALL 可键盘操作、可读 screen-reader 名称且七种现有 locale 无缺键。
  Verify: axe, keyboard E2E and i18n key gate.
- **NFR-009** GIVEN正式发布包 WHEN产物生成 THEN THE SYSTEM SHALL 记录 backend/Web revision、contract version 和依赖锁，并可从干净 checkout 重现相同功能产物。
  Verify: clean-room CI build and manifest comparison.

## Testing decisions

1. **Static/schema:** TypeScript strict、Zod/OpenAPI compatibility、dependency boundaries、manifest lint、secret pattern scan。
2. **Unit/property/mutation:** capability intersections、route selection、option coercion、error mapping、backoff、state machine、legacy ID codec。
3. **Adapter contracts:** 本地 mock server + 脱敏官方 request/response/error fixtures；覆盖 stream、tool、Files、queue、cancel、429、5xx、malformed/additive responses。
4. **Persistence/fault:** copied legacy DB migration、lease competition、crash at every transition、network ambiguity、expired asset、duplicate event、clock skew。
5. **API/Web:** generated client typecheck；Vue component tests；model/offering picker、dynamic forms、credential status、job restore、a11y/i18n。
6. **Browser/Electron E2E:** Playwright 跑真实 API 服务、Socket 断连、页面刷新、app restart、packaged build；CI 覆盖 macOS/Windows/Linux，硬件相关行为单独标记。
7. **Credentialed live:** 串行、budget-gated、最小计费输入；DeepSeek text/vision、fal H3 三模式/取消、Gemini language/multimodal/Nano Banana/video。MiniMax official 在 Key 到位前只跳过 live case，不能跳过 adapter contract。
8. **Product acceptance:** deterministic structural gate 与人工质量 gate 分离。所有 attempt、seed/provider request id、错误和重跑原因均入证据；不能只挑最好结果。凭据或预算不足时保持未验收，不能 waiver 成 Enabled。

| Workload | Minimum live sample | Deterministic gate | Quality gate |
|---|---:|---|---|
| DeepSeek Pro/Flash language | 每模型 5 个固定 case | stream 完整、tool/schema/marker 5/5、thinking history 无丢失 | 事实型预期 key facts ≥90% |
| DeepSeek Vision | 8 个 OCR/图表/截图/多图/Files case | 8/8 返回可解析的 typed result；实际 port request 逐项保留图片/Files/detail/tool/schema；结构化输出与 tool arguments 通过冻结 JSON Schema | 两名独立盲评者对照 `expectedFacts` 评分，至少 6/8 达到 3 分，且无关键读图反转、必需对象遗漏或预注册 hard failure |
| H3 video per enabled offering | t2v/i2v/reference 各 3，共 9 | 9/9 可导入，MIME/时长/分辨率/音频与 offering contract 一致 | 每模式至少 2/3 达到 0–4 rubric 的 3 分，且无身份/首尾帧/参考模式 hard failure |
| Nano Banana per enabled offering | generate 3 + edit 3 | 6/6 可解析并保留期望尺寸/格式；edit 输入未丢 | 每 operation 至少 2/3 达到 3 分，文字/主体/编辑目标无 hard failure |
| Gemini Omni/Veo per enabled offering | 每个 enabled operation 3 | 3/3 可导入并满足声明的时长/音频/控制字段 | 至少 2/3 达到 3 分，且无关键控制 hard failure |

质量 rubric 固定为 `0 unusable / 1 major failure / 2 partial / 3 acceptable / 4 strong`，按 prompt adherence、reference/control adherence、artifact correctness、可用性评分；hard failure 在数据集定义中预注册。质量由两名盲审者独立评分，分歧超过 1 分时第三人裁决；两名盲审者与裁决者必须绑定互不相同的规范化 SPKI 公钥身份，不能仅依赖不同 reviewer ID。证据绑定 exact model/alias-resolved revision、manifest hash、SDK version 与日期，并在模型 revision 变化或 30 天后过期。

支持声明分四级记录：`implemented`、`contract_verified`、`live_verified`、`product_accepted`。任一级缺失都必须在 API/UI/交付说明中可见。

## Rollout and rollback

- 采用 additive schema、dual-read legacy IDs、per-provider/per-offering feature flag。先上线只读 catalog/preflight，再启用 job runner，随后逐家开启 adapter 与 UI。
- 新安装在全套 acceptance 通过后默认 kernel；升级用户先走 compatibility。fal H3 可先启用，MiniMax official 在 credential + live gate 通过后独立开启。
- 任一 duplicate-billing、secret leak、asset loss 或 contract mismatch 立即停止该 offering 的新 submit，但保留 status/cancel/import recovery。
- 回滚只指同一新二进制内切断 submit或恢复 legacy route，不删除 job、operation、credential migration record；recovery reader 保留至全部 operation 终态。Credential migration 后不支持旧二进制 downgrade，受管理的 updater 必须阻止降级。
- legacy cleanup 仅在两个发布周期零执行、copied-DB tests 通过且用户可导出配置后进行。

## Assumptions

- 当前目标是一等内置支持，不是让任意不可信第三方代码即装即用。
- SQLite 是单机事实来源；lease 仍按多 runner/进程异常设计。
- DeepSeek、Gemini 与 fal 凭据已确认可用于实现阶段验收；MiniMax official 凭据稍后提供。
- 价格、配额和 preview 状态是动态事实；每次 live acceptance 前必须重查官方资料。

## Deferrals

- 不可信第三方 provider 的进程/容器隔离、签名、权限与分发。
- 将 dynamic model discovery 直接变成可用 catalog；本期只允许它提供候选与健康信息。
- Gemini Live/agent 管理的完整产品 UI；底层 operation 可声明，但未完成 UX 与验收前保持 disabled。
- MiniMax official 的 live acceptance，直到用户提供独立 Key；adapter、mock、contract 与 UI 状态不延期。

## Limitations

- 本 SPEC 不保证第三方模型质量、价格、配额、地区或 uptime；这些在 live acceptance 时记录时间戳。
- AI SDK video/interactions 仍可能是 experimental；NarraStage contract 只能降低升级影响，不能消除上游变化。
- Electron Linux secret store 不可用时将拒绝持久化，用户必须提供环境变量或配置系统 keyring。
- 此 SPEC 已选择 Capability Kernel + durable jobs + legacy adapter；详细顺序与仓库改动边界见 PLAN。

## Decision log (append-only)

| Date | Version | Entry | Approved by |
|---|---:|---|---|
| 2026-08-23 | 1 | Initial provider architecture draft | — |
| 2026-08-23 | 2 | Compared script extension, capability kernel and out-of-process plugin host; recommended kernel | — |
| 2026-08-23 | 3 | User selected architecture-level full-stack scope; added DeepSeek Vision, fal-as-offering, Web/Electron, credential vault and maximal tests | pending |
| 2026-08-23 | 4 | Approved version 4 · normative digest eaaf9fca4e4d8e23895dd3d9a88cdbb5a2fbe4229d45d41b503c8187bc99f9fa for implementation; replaced `minimax-direct` with stable Provider `minimax` + AccessChannel `official` and made request pricing an offering concern | reedchan |
| 2026-08-23 | 4a | Review amendment: Vision semantic facts are assessed by signed two-blind rubric instead of brittle substring automation; deterministic acceptance validates the exact port request, frozen JSON Schema and typed result structure | reedchan |
