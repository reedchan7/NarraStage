import { builtinCatalog } from "@/providers/catalog/builtinCatalog";

export function isImageOffering(offeringId: string): boolean {
  return builtinCatalog.offerings.some(
    (offering) =>
      offering.id === offeringId &&
      offering.support.implementation === "implemented" &&
      offering.operations.some(
        (operation) => operation.operation === "image.generate" && operation.enabled,
      ),
  );
}
