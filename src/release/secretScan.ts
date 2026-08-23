import { createReadStream } from "node:fs";

export interface SecretScanValue {
  name: string;
  value: string;
}

const secretPatterns = [
  { name: "google-api-key-pattern", expression: /AIza[0-9A-Za-z_-]{35}/ },
  {
    name: "sk-token-pattern",
    expression: /(?:^|[^0-9A-Za-z_-])sk-[0-9A-Za-z]{32,}(?![0-9A-Za-z_-])/,
  },
] as const;

export async function scanFileForSecrets(
  filePath: string,
  secrets: readonly SecretScanValue[],
): Promise<string[]> {
  const findings = new Set<string>();
  const maximumSecretLength = Math.max(256, ...secrets.map((secret) => secret.value.length));
  let carry = Buffer.alloc(0);
  for await (const rawChunk of createReadStream(filePath, { highWaterMark: 1024 * 1024 })) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    const searchable = Buffer.concat([carry, chunk]);
    for (const secret of secrets) {
      if (searchable.includes(Buffer.from(secret.value))) findings.add(secret.name);
    }
    const text = searchable.toString("latin1");
    for (const pattern of secretPatterns) {
      if (pattern.expression.test(text)) findings.add(pattern.name);
    }
    carry = searchable.subarray(Math.max(0, searchable.length - maximumSecretLength + 1));
  }
  return [...findings];
}
