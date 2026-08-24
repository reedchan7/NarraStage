# Research — Feature 001 可扩展多模型供应商架构

- Date: 2026-08-23 · Mode: deep · Spec: ./SPEC.md
- Scope: DeepSeek V4（含视觉实验模型）、MiniMax H3、fal.ai、Google Gemini；覆盖服务端、Web 源码、Electron 客户端、凭据与测试。

## Questions

1. 四家的模型、输入约束、同步/异步生命周期和模型淘汰策略分别是什么？
2. fal.ai 作为聚合平台，应被建模成模型厂商、统一入口，还是一条可替换执行渠道？
3. 当前 vendor-script 契约为何无法长期承载这些能力？
4. 服务端、Web 与 Electron 如何共享契约且独立发布？
5. SDK、自研适配、资产、任务、取消、错误、凭据和可观测性如何分层？
6. 什么测试证据才足以声称“正式支持”，尤其是暂时没有 MiniMax Key 时？

## Repository and client evidence

### Backend/runtime

- `src/utils/ai.ts` 将 provider 固定成 `textRequest | imageRequest | videoRequest | ttsRequest`。运行时解析 `vendor:model`，编译数据库内的 TypeScript 字符串，并在 `node:vm` 中执行。
- 图像/视频使用窄接口和字符串 mode DSL。没有 provider-namespaced options、组合约束、warning、capability negotiation 或结构化素材 role。
- `AiImage.run` / `AiVideo.run` 在 adapter 内等待全部轮询完成；调用方拿不到 request id、队列状态、取消能力或可恢复 operation handle。
- `src/utils/vm.ts` 向脚本开放网络、provider factory、FormData、crypto 和固定间隔 `pollTask`。Node 官方明确说明 `node:vm` 不是安全机制，因此该路径只能定义为“可信本地脚本”。
- `o_tasks` 只有粗粒度状态；视频 route 响应后依赖进程内 Promise。应用退出后无法根据远端 operation 恢复，也无法证明没有重复计费提交。
- 当前 MiniMax adapter 仍走 Hailuo `/v1/video_generation`。当前 DeepSeek adapter 手工修改 OpenAI-compatible 请求，而已安装的 `@ai-sdk/deepseek` 已包含 V4、视觉实验模型、thinking 和 Files 类型。

### Web source and consumers

- 当前 app 仓库只含 `data/web/index.html` 等编译产物；Git 历史里没有可维护的 Web 源码。直接修改单行 bundle 不满足可维护性要求。
- 上游公开源码仓库为 [`HBAI-Ltd/Toonflow-web`](https://github.com/HBAI-Ltd/Toonflow-web)，本次核验 revision 为 `9c4cb0ec7d4f6b4067c7768e2df8cdc7f8587214`。它是 Vue 3/Vite 项目，当前没有自动化 test script。
- `modelSelect.vue` 只理解 text/image/video 和 `${vendorId}:${modelName}`；`vendorConfig.vue` 硬编码旧 mode、音频与时长/分辨率表，并把 `inputValues` 整体回传；`stores/video.ts` 使用旧提交接口和客户端轮询。
- 因此前端工作必须在 NarraStage-web 源码仓库完成，再由可复现构建产出 app 的 `data/web`；不能仅改后端，也不能手补构建产物。

### Electron

- `scripts/main.ts` 在开发时加载 Vite URL，发布时加载内置 Web bundle，并在同一主进程启动本地 API。
- 当前没有 provider credential 的窄 preload bridge。Electron 官方建议 renderer 保持 sandbox/context isolation，并只通过逐方法、参数校验的 `contextBridge` 暴露必要能力。
- 当前 API 使用开放 CORS 且 listen 未显式绑定 loopback；因此不能新增 REST secret-write。Desktop 必须走 preload/main vault 并收紧本地监听，standalone Web 本期只读 env/ref credential 状态。
- Electron `safeStorage` 可使用 macOS Keychain、Windows DPAPI 和 Linux secret store；Linux `basic_text` 是不安全降级。新凭据层必须检测后端并在不安全降级时 fail closed，不得宣称已加密。

## Latest official APIs

### DeepSeek V4 and Vision

- 官方模型目录当前列出 `deepseek-v4-flash`、`deepseek-v4-pro` 与 2026-08-21 新增的实验模型 `deepseek-v4-flash-vision-exp`。后者接收 text + image，输出 text。
- 支持 JPEG/PNG/GIF/WebP。Chat Completions 的图片限 user 消息；Responses API 还允许 developer message 和 tool output image。NarraStage 首期 UI 选择更窄的 user-attachment 产品约束。输入可用 base64 data URL、外部 HTTPS URL、Files API `file_id`/`file_data`；`detail` 支持 low/high/original/auto。
- 主要限制：请求体 48 MiB；外链单图 32 MiB、URL 8192 字符；Files 单图 64 MiB；单请求最多 600 图；含 Files 时图片总量最高 200 MiB。外部 URL 是不可信输入，Files 是有生命周期的 provider asset。
- 视觉模型同时覆盖 OpenAI-compatible Chat Completions、Responses 与 Anthropic Messages。产品 contract 不应绑定其中一种 wire shape。
- `@ai-sdk/deepseek@3.0.31` 已包含模型 ID、thinking/reasoning effort 和 Files。正式 adapter 优先复用其成熟实现，并以 contract tests 锁定 reasoning/tool/multimodal round trip；不把 SDK 类型直接暴露给产品域。

Sources: [DeepSeek quick start and current model IDs](https://api-docs.deepseek.com/), [Vision guide](https://api-docs.deepseek.com/guides/vision/), [thinking mode](https://api-docs.deepseek.com/guides/thinking_mode), [AI SDK DeepSeek provider](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek).

### MiniMax H3 direct

- MiniMax 官方已经提供 `MiniMax-H3`：POST `/v2/video_generation`，并提供 query/list/cancel-delete、H3-Context-IR 和 regeneration。DELETE 对 queued 是取消，对 succeeded/failed 是删除远端记录；running 不可取消，因此产品“取消”不能统一映射成 DELETE。
- `content[]` 以 role-tagged text/image/video/audio 表达 text-to-video、首尾帧和 reference-to-video。每次必须有非空 text；keyframe 与 reference 互斥。
- 当前官方约束包括：请求体不超过 64 MB；参考图片最多 9、视频最多 3、音频最多 3；输出 768P/2K；时长 4–15 秒；文本模式不能使用 adaptive ratio。
- 桌面应用通常没有公网 callback，因此 durable polling 是默认路径；callback/webhook 只在部署环境具备公开回调和签名校验时启用。

Sources: [H3 guide](https://platform.minimax.io/docs/guides/video-generation), [create v2](https://platform.minimax.io/docs/api-reference/video-generation-v2-create), [query v2](https://platform.minimax.io/docs/api-reference/video-generation-v2-query), [cancel/delete v2](https://platform.minimax.io/docs/api-reference/video-generation-v2-delete).

### fal.ai as aggregator

- fal 是商业/API 执行平台，不是其托管模型的原始厂商。H3 在 fal 上分成 text-to-video、image-to-video、reference-to-video endpoint；它们共享 fal queue/storage/auth，但输入 schema 和平台选项不同。
- `@fal-ai/client` 提供 storage upload、queue submit/status/result/cancel 和 webhook。长任务的 `request_id` 必须持久化；结果 URL 可能过期，需在成功后导入 NarraStage-owned storage。
- fal 官方明确要求浏览器/GUI 不暴露 `FAL_KEY`，应由服务端代理。运行中取消是 best effort，job 必须保留正交的 cancel intent，不能把本地停止等待当作远端已取消。
- 正确抽象是：模型归属与执行渠道分离。Canonical model `minimax:h3` 可有 Provider `minimax` + AccessChannel `official` 与 Provider `fal` + AccessChannel `aggregator` 两个 offering；fal endpoint 是 offering 内的 operation。Provider ID 不使用 `minimax-direct`，UI 可显示“MiniMax Official”。
- fal 不应成为无条件全局主入口，也不应因“官方”标签便永久降级为备选。策略先过滤能力、凭据、地区、生命周期、健康和验收证据，再根据完整请求价格、延迟和数据政策选路。这既允许 fal 成为 H3 当前主入口，又不让模型语义、前端 ID 和数据迁移绑定 fal。
- MiniMax 官方 H3 的普通生成契约是 768P/2K、4–15 秒，创建任务可以直接请求 2K；把已有 768P 成片再生成到 2K 是另一条可选 regeneration 流程。fal 当前 endpoint 契约是 480P/768P/2K/4K、5–15 秒；其 endpoint 页面只突出 2K，但同页报价列出四档，机器可读 OpenAPI schema 进一步明确 480P/768P 是原生生成、2K/4K 从 768P 基础结果升采样。因此 catalog 以 schema 为准，把 fal 2K/4K 标成 `upscaled`，不能与 MiniMax official 的原生 2K 视为同一质量档。

Sources: [fal model/API overview](https://fal.ai/llms.txt), [MiniMax H3 on fal](https://fal.ai/minimax-h3), [queue lifecycle](https://fal.ai/docs/documentation/model-apis/inference/queue), [JavaScript client](https://fal.ai/docs/api-reference/client-libraries/javascript).

### MiniMax H3 国内官网与 fal 价格对比

- MiniMax 国内开放平台 2026-08-23 可见的按量列价：768P `¥0.50/输出秒`，2K `¥0.80/输出秒`；音频引用免费，前 5 张引用图免费、后续 `¥0.20/张`，引用视频按输入时长与相同分辨率秒价计费。
- fal H3 endpoint 当日公开页面列价：480P `$0.05/秒`、768P `$0.06/秒`、2K `$0.13/秒`、4K `$0.16/秒`。fal 账户 pricing API 对这三个 endpoint 返回 `$0.00017/compute second`，但没有公开 compute-second 到输出视频秒的确定换算，因此不能用它替代 endpoint 报价。
- 使用国家外汇管理局最新一个工作日（2026-08-21）中间价 `1 USD = ¥6.7817`：fal 768P 约 `¥0.407/秒`，比国内官方 `¥0.50` 便宜约 `18.6%`；fal 2K 约 `¥0.882/秒`，国内官方 `¥0.80` 反而便宜约 `9.3%`。10 秒纯输出对比分别是 768P `¥4.07 vs ¥5.00`、2K `¥8.82 vs ¥8.00`。
- 768P 是可直接比较档位；2K 的上述数字只是列价并排展示，official 原生 2K 与 fal 从 768P 升采样的 2K 不是同质量口径，路由器必须标记 `incomparable`。换算也不含银行/信用卡汇差、跨境手续费、税费、企业合同折扣和额外引用素材。产品保留原币价格和来源，再用带 `asOf` 的汇率生成可解释 CostEstimate；不能将今天的结论写成固定路由。fal 自己的营销文章还出现过与 endpoint 页面不同的价格，因此实际计费证据必须绑定具体 endpoint/定价 API、采集时间和原币，不能从文章固化。

Sources: [MiniMax 国内按量计费](https://platform.minimaxi.com/docs/guides/pricing-paygo), [fal H3 endpoint pricing](https://fal.ai/models/minimax/h3/text-to-video), [fal pricing API semantics](https://fal.ai/docs/platform-apis/v1/models/pricing), [国家外汇管理局人民币汇率中间价](https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do).

### Google Gemini

- OpenAI compatibility 适合迁移已有 client；Google 对新项目建议使用原生 Gemini API。NarraStage 的正式 Google provider 不应建立在 compatibility endpoint 上。
- 当前一等候选包括：`gemini-3.7-flash`（GA，text/image/video/audio/PDF → text）、`gemini-3.1-flash-image`（Nano Banana 2）、`gemini-3.1-flash-lite-image`、`gemini-3-pro-image`、`gemini-omni-flash-preview` 与 Veo 3.1 full/fast/lite preview 系列。旧 Imagen 与 Veo 2/3 已进入或完成退役窗口，证明静态永久模型表不可行。
- Files API 单文件最高 2 GB、项目 20 GB、48 小时自动删除；它是 provider asset，不是 NarraStage 永久资产。Interactions、Grounding/Search、Live 和媒体生成必须作为独立 capability 声明，不能因同属 Gemini 就自动视为支持。Omni 的继续编辑使用 `previous_interaction_id`，因此 NarraStage 以已完成父 job 表达 provider-state continuation，不向 renderer 暴露原始 state token。
- 当前 Omni 视频限制为 3–10 秒、720P、16:9/9:16；不接受音频参考，多视频参考不支持，文档声明的视频参考表面仍有已知不可用限制。NarraStage 只启用已验证可表达的 text/image 与有状态继续编辑模式，对这些缺口 fail closed。
- 当前 `@ai-sdk/google@4.0.50` 源码已提供 language/image/video/speech/files/interactions/realtime/tools。优先复用；只有官方新能力尚未暴露时才使用窄 `@google/genai` escape hatch。

Sources: [current models](https://ai.google.dev/gemini-api/docs/models), [Gemini 3.7 Flash](https://ai.google.dev/gemini-api/docs/latest-model), [Nano Banana](https://ai.google.dev/gemini-api/docs/image-generation), [Veo](https://ai.google.dev/gemini-api/docs/veo), [Gemini Omni](https://ai.google.dev/gemini-api/docs/omni), [Files](https://ai.google.dev/gemini-api/docs/generate-content/files), [Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview), [deprecations](https://ai.google.dev/gemini-api/docs/deprecations).

## Architecture convergence and decision

没有一个行业标准接口能无损统一全部生成式 AI 模态；成熟实现正在收敛到以下范式：

1. **按模态/operation 的 ports。** Language、image、video、speech、files 分离，避免万能 `generate(any)`。
2. **Canonical model 与 provider offering 分离。** 模型是谁的、从哪里购买/执行是两个事实；聚合商、云平台和官方 API 都只是 offering。
3. **稳定公共字段 + namespaced provider options。** 通用产品参数保持可移植，非便携能力显式归属 provider/operation，未知参数不得静默丢弃。
4. **声明式 capability + 同源 preflight。** UI 渲染和服务端校验来自同一 schema，但服务端仍是最终权威。
5. **可序列化 long-running operation。** start/status/result/cancel 分开，opaque operation 带版本；应用拥有 lease、恢复、幂等和导入生命周期。
6. **限制请求、容忍响应。** 请求 schema 严格拒绝非法组合；响应解析只要求实际消费字段并允许上游添加字段。
7. **秘密引用与资产引用。** job 只保存 credential ref 和 asset ref，不保存 secret、base64 大对象或短命下载 URL 作为最终结果。
8. **Push 是通知，数据库是事实。** REST/SQLite 提供 snapshot；Socket.IO 降低延迟，重连后必须 refetch，不能把内存事件当真相。

采用 hybrid strangler：新内置 provider 走 typed kernel；旧脚本由 `LegacyVendorAdapter` 继续支持并标注 trusted local；不在本期建设不可信第三方 marketplace。服务端用 versioned OpenAPI 作为跨仓库契约源，Web 生成 typed client，Electron 发布物记录后端/Web revision 与 contract version。

Sources: [AI SDK provider development](https://github.com/vercel/ai/blob/main/contributing/providers.md), [OpenTelemetry GenAI conventions](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/), [Node VM warning](https://nodejs.org/api/vm.html), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

## Credential and live-test inventory

- 只做存在性核验，未输出或复制值：当前进程有 `DEEPSEEK_API_KEY`、`GEMINI_API_KEY`。
- KnipCut 的权限受限本地配置中，fal provider credential 非空；实现阶段仅通过临时进程注入使用，不复制进源码、fixture、日志或 NarraStage 数据库。
- `MINIMAX_API_KEY` 当前缺失。MiniMax official adapter 先用官方 schema/录制的脱敏响应/mock server 完成全部自动化合同；H3 真实链路先通过 fal offering 验收，official live suite 保持 credential-gated。
- 所有付费 live suites 必须设置单次预算上限并串行执行；fixtures 在录制时自动清理 authorization、request payload 中的敏感素材 URL 和 provider identifiers。

## Buy vs build

| Area | Decision | Reason |
|---|---|---|
| Language/image common protocol | 复用 AI SDK，外包一层 NarraStage contract | 已覆盖 streaming/tools/multimodal/provider metadata，且能屏蔽 experimental API 漂移。 |
| DeepSeek/Google | 使用现有官方 AI SDK provider | 减少手写 wire protocol；以 NarraStage contract tests 固定语义。 |
| fal | 增加 `@fal-ai/client` | queue/storage/cancel 是平台通用能力，直接复用维护价值最高。 |
| MiniMax H3 official | 自建窄 v2 adapter | 当前依赖没有完整表达 role-tagged H3 与取消协议。 |
| Durable jobs | SQLite-backed runner | 匹配本地 Electron，不引入 Temporal；operation 保持可迁移。 |
| Cross-repo API | OpenAPI + generated Web client | 后端单一真相、Web 可独立发布、CI 可检查 breaking change。 |
| Secrets | CredentialVault + Electron safeStorage/env refs | renderer、DB job 和 provider config 均不持有明文。 |
| Untrusted plugins | 延后 out-of-process host | 当前用户目标是一等内置支持，不是公共 marketplace。 |

## Remaining uncertainty

- 上游模型价格、配额和 preview 生命周期会变化；curated catalog 需要 `lastVerifiedAt`、lifecycle 和启动时非权威探测，不能自动把新模型暴露给生产用户。
- `@ai-sdk/google` video/interactions 与 AI SDK VideoModel V4 仍含 experimental 表面；必须用 NarraStage 稳定 contract 隔离。
- MiniMax official 在获得 Key 前不能声称 live accepted；产品可显示“adapter ready / credential missing / live unverified”的独立状态。
