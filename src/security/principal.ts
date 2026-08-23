import { createHash } from "node:crypto";

export function principalIdFromClaims(claims: unknown): string {
  if (!claims || typeof claims !== "object") return "local";
  const record = claims as Record<string, unknown>;
  const value = record.sub ?? record.userId ?? record.id ?? record.username ?? record.name;
  if (typeof value !== "string" && typeof value !== "number") return "local";
  return `user:${createHash("sha256").update(String(value)).digest("hex").slice(0, 24)}`;
}

export function assertOperatorClaims(claims: unknown): void {
  if (
    !claims ||
    typeof claims !== "object" ||
    (claims as Record<string, unknown>).role !== "operator"
  ) {
    throw new Error("authorization.operator_required");
  }
}
