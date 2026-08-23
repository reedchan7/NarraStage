# Provider live acceptance runbook

正式支持声明由三类相互独立的证据组成：受控执行器签名、逐字节复验后的人工评审签名、以及绑定当前源码与依赖锁的 release evidence。Mock、健康检查或单次成功响应都不能替代这条链路。

## 一次性 GitHub 配置

在首次运行 `.github/workflows/provider-live-acceptance.yml` 前，仓库管理员必须创建 `provider-acceptance` Environment，并完成以下配置：

- deployment branch policy 只允许 default branch；
- 至少一名 required reviewer，执行付费任务前由其审批预算和 offering；
- Provider Key 与 `TOONFLOW_EXECUTOR_PRIVATE_KEY_PEM` 只存放在该 Environment，不放 repo-level secrets；
- executor 公钥、repository、workflow 与 environment 写入 `data/contracts/provider-evidence-trust.json`。

缺少任一项时不得把 live workflow 的产物用于发布。私钥不得写入仓库、artifact、日志或评审决策文件。

## 受控执行

从 default branch 手动触发 `Provider live acceptance`，精确选择 offering，并填写每个 frozen case 的保守美元上限和整次运行总预算。执行器会串行运行固定 case，验证健康状态、endpoint revision、请求/响应结构、媒体 MIME/尺寸/时长，保存 normalized request evidence 与输出产物，并签署报告。报告和 review artifacts 保留 14 天。

本地等价入口为：

```sh
TOONFLOW_LIVE_TESTS=1 \
TOONFLOW_LIVE_TEST_MAX_USD=<approved-total> \
bun run live:test -- \
  --offering <offering-id> \
  --case-max-usd <case-cap> \
  --run-id <immutable-run-id> \
  --artifact-dir <absolute-directory-outside-repository> \
  --output <report-directory>/<immutable-run-id>.json
```

执行前可省略凭据并加 `--dry-run`，只查看准确 case 数与成本上限。非 dry-run 还要求 executor identity、Git commit/run identity、签名私钥和对应 Provider Key。

## 盲评与裁决

每名 reviewer 从同一不可变 execution report 和 artifact 目录开始。先生成评审包；该步骤会验证 executor trust、每个 artifact 的路径归属、长度、SHA-256、MIME 和媒体元数据：

```sh
bun run live:review -- \
  --prepare \
  --report <run-id>.json \
  --artifact-dir <downloaded-run-artifact-directory> \
  --trust data/contracts/provider-evidence-trust.json \
  --output <run-id>.review-packet.json
```

评审包展示每个 frozen case 的 prompt、expected facts、deterministic assertions、预注册 hard failures 和 artifact 路径。Reviewer 在隔离环境查看实际产物，填写严格的 decision JSON：

```json
{
  "schemaVersion": 1,
  "runId": "<run-id>",
  "reviewerId": "<trusted-reviewer-id>",
  "role": "blind",
  "cases": [
    {
      "caseId": "<frozen-case-id>",
      "promptAdherence": 0,
      "referenceControlAdherence": 0,
      "artifactCorrectness": 0,
      "usability": 0,
      "hardFailures": []
    }
  ]
}
```

分数范围为 0–4。Blind reviewer 必须覆盖报告中的全部 case，hard failure 只能选 frozen case 预注册的定义。签名时再次完整复验报告和 artifact，防止准备评审包后的替换：

```sh
TOONFLOW_REVIEWER_PRIVATE_KEY_PEM='<private-key>' \
bun run live:review -- \
  --report <input-report>/<run-id>.json \
  --artifact-dir <downloaded-run-artifact-directory> \
  --decisions <reviewer-decisions>.json \
  --trust data/contracts/provider-evidence-trust.json \
  --output <new-output-directory>/<run-id>.json
```

第二名 blind reviewer 以上一步的报告为输入，并使用不同的 trusted identity 和不同的规范化 SPKI 公钥。任一评分维度分歧超过 1 分时，使用第三个独立 ID 与独立公钥的 adjudicator 只评审存在分歧的 case；没有分歧时附加 adjudicator 会被 release gate 拒绝。CLI 与 release gate 按公钥指纹拒绝换 ID/换 PEM 文本后的密钥复用，同时拒绝错 run、缺 case、多 case、未注册 hard failure、失配私钥、旧 reviewer manifest、篡改或逃逸路径。

## 发布证据

最终 signed report 使用 run ID 作为文件名放入 `data/contracts/live-reports/`，再为 exact offering 写入 `provider-release-evidence.json`。`bun run release:evidence` 会重新绑定当前 adapter、acceptance suite、executor、reviewer、SDK lock、API revision、execution commit/workflow run、resolved model revision 和 30 天时效。Deterministic gate 会对实际提交给 port 的请求快照执行冻结 JSON Schema、素材/控制字段、MIME、尺寸、时长与 lineage 检查；从 case 定义反向重建的请求不能作为证据。

原始媒体 artifact、decision 草稿和任何私钥都不进入仓库。缺少付费 live、两名盲评、必要裁决、受保护 GitHub Environment、可信公钥或 fresh exact-revision evidence 时，正式发布门禁必须保持失败。
