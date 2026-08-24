import path from "node:path";
import fg from "fast-glob";
import { scanFileForSecrets } from "@/release/secretScan";

const root = path.resolve(import.meta.dir, "..");
const secretNames = [
  "DEEPSEEK_API_KEY",
  "MINIMAX_API_KEY",
  "FAL_KEY",
  "FAL_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "NARRASTAGE_SECRET_SCAN_CANARY",
] as const;
const secrets = secretNames.flatMap((name) => {
  const value = process.env[name]?.trim();
  return value && value.length >= 12 ? [{ name, value }] : [];
});
if (secrets.length === 0) throw new Error("release.secret_scan_inputs_missing");

const paths = await fg(["data/web/**", "data/serve/**", "build/**", "dist/**"], {
  cwd: root,
  onlyFiles: true,
  dot: true,
});
for (const relativePath of paths) {
  const findings = await scanFileForSecrets(path.join(root, relativePath), secrets);
  if (findings.length > 0) {
    throw new Error(`release.secret_detected:${findings.join(",")}:${relativePath}`);
  }
}
console.log(`secret scan passed (${paths.length} artifacts, ${secrets.length} configured values)`);
