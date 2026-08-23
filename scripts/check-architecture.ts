import { readFile } from "node:fs/promises";
import path from "node:path";

const guarded = [
  "src/providers/registry/providerRegistry.ts",
  "src/providers/policy/offeringPolicy.ts",
];
const providerIdentityPattern = /\b(deepseek|minimax|fal|google)\b/i;

for (const relativePath of guarded) {
  const source = await readFile(path.resolve(import.meta.dir, "..", relativePath), "utf8");
  if (providerIdentityPattern.test(source)) {
    throw new Error(`provider-specific branch detected in core: ${relativePath}`);
  }
}
