import fg from "fast-glob";
import path from "path";
import { readFile, writeFile } from "fs/promises";
import crypto from "crypto";

function fileNameToRoutePath(fileName: string): string {
  let routePath = fileName.replace(/\.(ts)$/, "");
  routePath = routePath.split(path.sep).join("/");
  routePath = routePath.replace(/\[([^\]]+)\]/g, (_, p1: string) =>
    p1.startsWith("...") ? "*" : `:${p1}`,
  );
  if (routePath === "index") return "/";
  routePath = routePath.replace(/\/index$/, "");
  routePath = "/" + routePath.replace(/\/+/g, "/").replace(/\/$/, "");
  return routePath;
}

type RouteModulePair = { routePath: string; varName: string; entry: string };

export function isRouteEntry(entry: string): boolean {
  return !/\.(?:test|spec)\.ts$/.test(entry);
}

export default async function generateRouter(options: { check?: boolean } = {}): Promise<void> {
  const sourceRoot = "apps/server/src";
  const routesRoot = `${sourceRoot}/routes`;
  // glob 得到 entries
  let entries: string[] = (await fg([`${routesRoot}/**/*.ts`])).filter(isRouteEntry);
  // 排序
  entries = entries.sort((a, b) => a.localeCompare(b));

  const importLines: string[] = [];
  const routeModulePairs: RouteModulePair[] = [];

  entries.forEach((entry: string, i: number) => {
    const varName = `route${i + 1}`;
    let importPath = "@/" + path.relative(sourceRoot, entry).replace(/\\/g, "/");
    importPath = importPath.replace(/\.ts$/, "");
    importLines.push(`import ${varName} from "${importPath}";`);
    const routeKey = path.relative(routesRoot, entry).replace(/\\/g, "/");
    const routePath = fileNameToRoutePath(routeKey);
    routeModulePairs.push({ routePath, varName, entry });
  });
  const routerData = JSON.stringify(
    routeModulePairs.map(({ routePath, varName }) => ({ routePath, varName })),
  );
  const hash = crypto.createHash("md5").update(routerData).digest("hex");

  let content = `// @routes-hash ${hash}\nimport type { LegacyHttpApplication } from "@/http/compat";\n\n`;
  content += `${importLines.join("\n")}\n\n`;
  content += `export default async (app: LegacyHttpApplication) => {\n`;
  for (const { routePath, varName } of routeModulePairs) {
    content += `  app.use("/api${routePath}", ${varName});\n`;
  }
  content += `};\n`;

  let needWrite = true;
  try {
    const current = await readFile(`${sourceRoot}/router.ts`, "utf8");
    if (current === content) needWrite = false;
  } catch {
    needWrite = true;
  }
  if (needWrite && options.check) throw new Error("generated router is stale");
  if (needWrite) await writeFile(`${sourceRoot}/router.ts`, content, "utf8");
}

if (import.meta.main) {
  await generateRouter({ check: process.argv.includes("--check") });
}
