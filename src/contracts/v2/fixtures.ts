import { builtinCapabilitySchemas } from "@/providers/catalog/builtinCatalog";
import type { CapabilitySchema } from "@/providers/domain/capabilities";

function capability(id: string): CapabilitySchema {
  const found = builtinCapabilitySchemas.find((schema) => schema.id === id);
  if (!found) throw new Error(`missing capability fixture ${id}`);
  return found;
}

export const h3CapabilityFixtures = {
  official: capability("minimax:h3:official:v1"),
  fal: capability("minimax:h3:fal:v1"),
} satisfies Record<string, CapabilitySchema>;
