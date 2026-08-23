import { providerIdSchema } from "@/providers/domain/ids";

export interface LegacyModelRef {
  providerId: string;
  providerModelId: string;
}

export function decodeLegacyModelId(value: string): LegacyModelRef {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`invalid legacy model ID: ${value}`);
  }
  return {
    providerId: providerIdSchema.parse(value.slice(0, separator)),
    providerModelId: value.slice(separator + 1),
  };
}

export function encodeLegacyModelId(ref: LegacyModelRef): string {
  const providerId = providerIdSchema.parse(ref.providerId);
  if (!ref.providerModelId) throw new Error("legacy provider model ID cannot be empty");
  return `${providerId}:${ref.providerModelId}`;
}
