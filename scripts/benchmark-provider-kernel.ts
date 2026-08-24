import { performance } from "node:perf_hooks";
import { builtinCatalog } from "@/providers/catalog/builtinCatalog";
import { preflightRequest } from "@/providers/preflight/preflightService";

const iterations = 1_000;
const startedAt = performance.now();
for (let index = 0; index < iterations; index += 1) {
  preflightRequest(
    {
      schemaVersion: "2.0.0",
      canonicalModelId: "minimax:h3",
      operation: "video.generate",
      input: {
        mode: "text",
        values: {
          prompt: "A paper boat crosses a pond",
          durationSeconds: 10,
          resolution: "768P",
          aspectRatio: "16:9",
        },
        assets: [],
      },
      offeringPreference: { mode: "pinned", offeringId: "minimax:h3:fal" },
      displayCurrency: "CNY",
    },
    { catalog: builtinCatalog, at: "2026-08-23T00:00:00+08:00" },
  );
}
const elapsedMs = performance.now() - startedAt;
const maximumMs = Number(process.env.NARRASTAGE_PROVIDER_BENCHMARK_MAX_MS ?? 2_000);
if (!Number.isFinite(maximumMs) || maximumMs <= 0 || elapsedMs > maximumMs) {
  throw new Error(
    `provider.kernel_benchmark_failed:${elapsedMs.toFixed(2)}ms>${maximumMs.toFixed(2)}ms`,
  );
}
console.log(JSON.stringify({ iterations, elapsedMs: Number(elapsedMs.toFixed(2)), maximumMs }));
