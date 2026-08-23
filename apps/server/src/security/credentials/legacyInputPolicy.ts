interface VendorInputDescriptor {
  key: string;
  type: "text" | "password" | "url";
}

export function sanitizeLegacyVendorInputResponse(
  inputs: readonly VendorInputDescriptor[],
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  const passwordKeys = new Set(
    inputs.filter((input) => input.type === "password").map((input) => input.key),
  );
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, passwordKeys.has(key) ? "" : value]),
  );
}

export function validateLegacyVendorInputUpdate(
  inputs: readonly VendorInputDescriptor[],
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  const passwordKeys = new Set(
    inputs.filter((input) => input.type === "password").map((input) => input.key),
  );
  for (const key of passwordKeys) {
    if (values[key]?.trim()) throw new Error("credential.rest_write_forbidden");
  }
  return Object.fromEntries(Object.entries(values).filter(([key]) => !passwordKeys.has(key)));
}
