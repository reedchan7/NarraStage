import fg from "fast-glob";

const files = await fg(["src/**/*.{ts,tsx}", "scripts/**/*.{ts,tsx}"], {
  ignore: ["**/node_modules/**"],
});
const failures: string[] = [];
const staticImportPattern = /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const internalExtensionPattern = /\.(?:[cm]?[jt]sx?|json)$/;

for (const file of files) {
  const source = await Bun.file(file).text();
  const lines = source.split("\n");

  for (const [index, line] of lines.entries()) {
    if (/\brequire\s*\(|\bmodule\.exports\b/.test(line)) {
      failures.push(`${file}:${index + 1} CommonJS syntax is not allowed`);
    }
  }

  const specifiers = new Set<string>();
  for (const pattern of [staticImportPattern, dynamicImportPattern]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }

  for (const specifier of specifiers) {
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
    if (internalExtensionPattern.test(specifier)) {
      failures.push(`${file}: internal import must omit its file extension: ${specifier}`);
    }
    if (
      specifier.startsWith("../") ||
      (specifier.startsWith("./") && specifier.slice(2).includes("/"))
    ) {
      failures.push(`${file}: use the @/ alias for nested relative imports: ${specifier}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`ESM module boundaries valid (${files.length} files)`);
