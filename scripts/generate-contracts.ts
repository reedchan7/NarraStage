import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type JsonObject = Record<string, unknown>;

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
const PARAMETER_LOCATIONS = ["query", "header", "path", "cookie"] as const;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function run(command: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`${command.join(" ")} failed\n${stderr || stdout}`);
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function literal(value: unknown): string {
  return value === undefined ? "unknown" : JSON.stringify(value);
}

function referenceType(reference: string): string {
  const match = reference.match(/^#\/components\/([^/]+)\/([^/]+)$/);
  return match ? `components[${JSON.stringify(match[1])}][${JSON.stringify(match[2])}]` : "unknown";
}

export function schemaType(input: unknown): string {
  const schema = object(input);
  if (typeof schema.$ref === "string") return referenceType(schema.$ref);
  if ("const" in schema) return literal(schema.const);
  if (Array.isArray(schema.enum)) return schema.enum.map(literal).join(" | ") || "never";
  for (const keyword of ["oneOf", "anyOf"] as const) {
    if (Array.isArray(schema[keyword])) {
      return schema[keyword].map(schemaType).join(" | ") || "unknown";
    }
  }
  if (Array.isArray(schema.allOf)) return schema.allOf.map(schemaType).join(" & ") || "unknown";

  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const rendered = types.map((type) => {
    if (type === "string") return "string";
    if (type === "number" || type === "integer") return "number";
    if (type === "boolean") return "boolean";
    if (type === "null") return "null";
    if (type === "array") return `(${schemaType(schema.items)})[]`;
    if (type === "object" || schema.properties || schema.additionalProperties) {
      const properties = object(schema.properties);
      const required = new Set(Array.isArray(schema.required) ? schema.required : []);
      const fields = Object.entries(properties).map(
        ([name, property]) =>
          `${JSON.stringify(name)}${required.has(name) ? "" : "?"}: ${schemaType(property)};`,
      );
      let result = `{ ${fields.join(" ")} }`;
      if (schema.additionalProperties === true) result = `${result} & Record<string, unknown>`;
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        result = `${result} & Record<string, ${schemaType(schema.additionalProperties)}>`;
      }
      return result;
    }
    return "unknown";
  });
  return [...new Set(rendered)].join(" | ") || "unknown";
}

function parameterGroups(parameters: unknown): string {
  const groups = new Map<string, Array<{ name: string; required: boolean; schema: unknown }>>();
  for (const location of PARAMETER_LOCATIONS) groups.set(location, []);
  for (const parameterValue of Array.isArray(parameters) ? parameters : []) {
    const parameter = object(parameterValue);
    if (typeof parameter.in !== "string" || typeof parameter.name !== "string") continue;
    groups.get(parameter.in)?.push({
      name: parameter.name,
      required: parameter.required === true,
      schema: parameter.schema,
    });
  }
  return `{ ${PARAMETER_LOCATIONS.map((location) => {
    const entries = groups.get(location) ?? [];
    if (entries.length === 0) return `${location}?: never;`;
    const fields = entries.map(
      (entry) =>
        `${JSON.stringify(entry.name)}${entry.required ? "" : "?"}: ${schemaType(entry.schema)};`,
    );
    return `${location}: { ${fields.join(" ")} };`;
  }).join(" ")} }`;
}

function contentMap(input: unknown): string {
  const content = object(input);
  if (Object.keys(content).length === 0) return "never";
  return `{ ${Object.entries(content)
    .map(
      ([mediaType, media]) => `${JSON.stringify(mediaType)}: ${schemaType(object(media).schema)};`,
    )
    .join(" ")} }`;
}

function requestBody(input: unknown): string {
  const body = object(input);
  if (Object.keys(body).length === 0) return "requestBody?: never;";
  return `requestBody${body.required === true ? "" : "?"}: { content: ${contentMap(body.content)}; };`;
}

function responses(input: unknown): string {
  return `{ ${Object.entries(object(input))
    .map(([status, responseValue]) => {
      const response = object(responseValue);
      const key = /^\d+$/.test(status) ? status : JSON.stringify(status);
      return `${key}: { headers: Record<string, unknown>; content: ${contentMap(response.content)}; };`;
    })
    .join(" ")} }`;
}

function componentSection(input: unknown, section: string): string {
  const values = object(object(input)[section]);
  if (Object.keys(values).length === 0) return "never";
  return `{ ${Object.entries(values)
    .map(([name, schema]) => `${JSON.stringify(name)}: ${schemaType(schema)};`)
    .join(" ")} }`;
}

export function renderOpenApiTypes(documentValue: unknown): string {
  const document = object(documentValue);
  const paths = object(document.paths);
  const operations: string[] = [];
  const renderedPaths = Object.entries(paths).map(([routePath, pathValue]) => {
    const pathItem = object(pathValue);
    const pathParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    const methods = HTTP_METHODS.map((method) => {
      const operation = object(pathItem[method]);
      if (Object.keys(operation).length === 0) return `${method}?: never;`;
      const operationId =
        typeof operation.operationId === "string"
          ? operation.operationId
          : `${method}${routePath.replace(/[^A-Za-z0-9]+(.)?/g, (_, next) => next?.toUpperCase() ?? "")}`;
      const parameters = [
        ...pathParameters,
        ...(Array.isArray(operation.parameters) ? operation.parameters : []),
      ];
      operations.push(
        `${JSON.stringify(operationId)}: { parameters: ${parameterGroups(parameters)}; ${requestBody(operation.requestBody)} responses: ${responses(operation.responses)}; };`,
      );
      return `${method}: operations[${JSON.stringify(operationId)}];`;
    });
    return `${JSON.stringify(routePath)}: { parameters: ${parameterGroups(pathParameters)}; ${methods.join(" ")} };`;
  });
  const components = object(document.components);
  const componentSections = [
    "schemas",
    "responses",
    "parameters",
    "requestBodies",
    "headers",
    "pathItems",
  ].map((section) => `${section}: ${componentSection(components, section)};`);
  return `/**\n * Generated from data/contracts/openapi.v2.json.\n * Do not edit directly.\n */\n\nexport interface paths { ${renderedPaths.join(" ")} }\nexport type webhooks = Record<string, never>;\nexport interface components { ${componentSections.join(" ")} }\nexport interface operations { ${operations.join(" ")} }\n`;
}

export async function generateContracts(repositoryRoot: string, check: boolean): Promise<void> {
  const openapiPath = path.join(repositoryRoot, "data/contracts/openapi.v2.json");
  const generatedPath = path.join(repositoryRoot, "packages/contracts/src/generated/v2.ts");
  const sourcePath = path.join(repositoryRoot, "packages/contracts/src/generated/source.json");
  const openapi = await readFile(openapiPath);
  const document = JSON.parse(openapi.toString("utf8")) as JsonObject;
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "toonflow-contracts-"));
  const temporaryGenerated = path.join(temporaryDirectory, "v2.ts");
  try {
    await writeFile(temporaryGenerated, renderOpenApiTypes(document), "utf8");
    await run(["bunx", "oxfmt", "--write", temporaryGenerated], repositoryRoot);
    const generated = await readFile(temporaryGenerated);
    const source = `${JSON.stringify(
      {
        schemaVersion: 1,
        contractVersion: object(document.info).version,
        openapiSha256: sha256(openapi),
        generatedClientSha256: sha256(generated),
      },
      null,
      2,
    )}\n`;
    if (check) {
      const [currentGenerated, currentSource] = await Promise.all([
        readFile(generatedPath),
        readFile(sourcePath, "utf8"),
      ]);
      if (!generated.equals(currentGenerated) || source !== currentSource) {
        throw new Error("generated contracts are stale");
      }
      return;
    }
    await Promise.all([writeFile(generatedPath, generated), writeFile(sourcePath, source, "utf8")]);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await generateContracts(path.resolve(import.meta.dir, ".."), process.argv.includes("--check"));
}
