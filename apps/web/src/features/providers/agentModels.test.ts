import { describe, expect, test } from "vitest";
import type { AgentDeployRow, CatalogResult } from "@/api/client";
import {
  agentModelUpdate,
  languageOfferings,
  offeringLabel,
  simpleAgentRows,
} from "@/features/providers/agentModels";

const catalog = {
  schemaVersion: "2.0.0",
  providers: [],
  models: [
    {
      id: "deepseek:v4-flash",
      owner: "deepseek",
      family: "v4",
      name: "DeepSeek V4 Flash",
      lifecycle: "stable",
    },
  ],
  priceSnapshots: [],
  offerings: [
    {
      id: "deepseek:v4-flash:official",
      canonicalModelId: "deepseek:v4-flash",
      providerId: "deepseek",
      providerModelId: "deepseek-v4-flash",
      accessChannel: "official",
      lifecycle: "stable",
      operations: [
        { operation: "language.generate", capabilitySchemaId: "language:v1", enabled: true },
      ],
      support: { implementation: "implemented", evidence: ["implemented"] },
    },
    {
      id: "minimax:h3:official",
      canonicalModelId: "minimax:h3",
      providerId: "minimax",
      providerModelId: "MiniMax-H3",
      accessChannel: "official",
      lifecycle: "stable",
      operations: [{ operation: "video.generate", capabilitySchemaId: "video:v1", enabled: true }],
      support: { implementation: "implemented", evidence: ["implemented"] },
    },
  ],
  capabilitySchemas: [],
  availability: [],
} satisfies CatalogResult;

const rows: AgentDeployRow[] = [
  {
    id: 1,
    key: "scriptAgent",
    name: "剧本Agent",
    desc: "决策",
    model: "",
    modelName: "",
    vendorId: null,
    disabled: 0,
  },
  {
    id: 4,
    key: "ttsDubbing",
    name: "TTS配音",
    desc: "配音",
    model: "",
    modelName: "",
    vendorId: null,
    disabled: 1,
  },
  {
    id: 5,
    key: "scriptAgent:decisionAgent",
    name: "剧本Agent:决策层",
    desc: "决策层",
    model: "",
    modelName: "",
    vendorId: null,
    disabled: 0,
  },
];

describe("agent model assignment", () => {
  test("keeps implemented language offerings and drops video-only catalog rows", () => {
    const offerings = languageOfferings(catalog);
    expect(offerings.map((offering) => offering.id)).toEqual(["deepseek:v4-flash:official"]);
  });

  test("shows enabled parent agents in simple mode and hides dubbed or nested keys", () => {
    expect(simpleAgentRows(rows).map((row) => row.key)).toEqual(["scriptAgent"]);
  });

  test("ignores malformed deploy payloads instead of throwing in render", () => {
    expect(simpleAgentRows(undefined)).toEqual([]);
    expect(simpleAgentRows({ qrdinaryData: [] })).toEqual([]);
    expect(
      simpleAgentRows([
        { id: 1, key: null, name: "broken", desc: "", model: "", modelName: "", vendorId: null },
        rows[0],
      ]).map((row) => row.key),
    ).toEqual(["scriptAgent"]);
  });

  test("binds an offering identity the server can normalize", () => {
    const offering = languageOfferings(catalog)[0];
    expect(offering).toBeDefined();
    expect(agentModelUpdate(rows[0]!, offering!, catalog)).toEqual({
      id: 1,
      name: "剧本Agent",
      desc: "决策",
      modelName: "deepseek:v4-flash:official",
      model: "DeepSeek V4 Flash",
      vendorId: "deepseek",
    });
    expect(offeringLabel(catalog, offering!)).toBe("DeepSeek V4 Flash · deepseek");
  });
});
