import "onnxruntime-web";
import { pipeline, env as transformersEnv } from "@huggingface/transformers";
import type { DataType, FeatureExtractionPipeline } from "@huggingface/transformers";
import path from "path";
import fs from "fs";
import getPath from "@/utils/getPath";
import db from "@/utils/db";

// ── 模型配置 ──
// const modelOnnxFile = ["all-MiniLM-L6-v2", "onnx", "model_fp16.onnx"]; // 模型文件路径
// const modelDtype = "fp16" as const; // 量化类型：fp32
let extractor: FeatureExtractionPipeline | null = null;
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
const supportedDtypes = [
  "auto",
  "bnb4",
  "fp16",
  "fp32",
  "int8",
  "q1",
  "q1f16",
  "q2",
  "q2f16",
  "q4",
  "q4f16",
  "q8",
  "uint8",
] as const satisfies readonly DataType[];

function isSupportedDtype(value: string | undefined): value is DataType {
  return supportedDtypes.some((dtype) => dtype === value);
}

export async function initEmbedding(): Promise<void> {
  if (extractor) return;

  extractorPromise ??= createEmbedding();
  try {
    extractor = await extractorPromise;
  } catch (error) {
    extractorPromise = null;
    throw error;
  }
}

async function createEmbedding(): Promise<FeatureExtractionPipeline> {
  const modelConfigData = await db("o_setting").whereIn("key", ["modelOnnxFile", "modelDtype"]);
  const modelObj: Record<string, string> = {};
  Object.entries(modelConfigData).forEach(([key, value]) => {
    modelObj[key] = value as string;
  });
  let modelOnnxFile = modelObj?.modelOnnxFile
    ? JSON.parse(modelObj.modelOnnxFile)
    : ["all-MiniLM-L6-v2", "onnx", "model_fp16.onnx"]; // 模型文件路径
  const configuredDtype = modelObj.modelDtype;
  const modelDtype = isSupportedDtype(configuredDtype) ? configuredDtype : "fp16";
  const onnxPath = path.join(getPath("models"), ...modelOnnxFile);
  if (!fs.existsSync(onnxPath)) {
    throw new Error(`Embedding 模型文件不存在: ${onnxPath}`);
  }

  transformersEnv.allowRemoteModels = false;
  transformersEnv.allowLocalModels = true;
  transformersEnv.localModelPath = getPath("models").replace(/\\/g, "/") + "/";

  const modelFolder = modelOnnxFile[0];
  return pipeline("feature-extraction", modelFolder, {
    dtype: modelDtype,
    session_options: { graphOptimizationLevel: "disabled" },
  });
}

export async function getEmbedding(text: string): Promise<number[]> {
  if (!extractor) await initEmbedding();
  const output = await extractor!(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  return a.reduce((dot, v, i) => dot + v * b[i], 0);
}

export async function disposeEmbedding(): Promise<void> {
  await extractor?.dispose?.();
  extractor = null;
  extractorPromise = null;
}
