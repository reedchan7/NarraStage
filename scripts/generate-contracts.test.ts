import { describe, expect, test } from "bun:test";
import { renderOpenApiTypes, schemaType } from "./generate-contracts";

describe("TypeScript 7 native OpenAPI contract generation", () => {
  test("renders required, optional, enum, array, and referenced schema types", () => {
    expect(
      schemaType({
        type: "object",
        required: ["mode"],
        properties: {
          mode: { enum: ["image", "video"] },
          ids: { type: "array", items: { type: "integer" } },
          job: { $ref: "#/components/schemas/Job" },
        },
      }),
    ).toContain('"mode": "image" | "video"');
  });

  test("binds paths to operation request and response contracts", () => {
    const output = renderOpenApiTypes({
      openapi: "3.1.0",
      paths: {
        "/api/jobs/{id}": {
          get: {
            operationId: "getJob",
            parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
            responses: {
              200: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["id"],
                      properties: { id: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(output).toContain('get: operations["getJob"]');
    expect(output).toContain('path: { "id": string; }');
    expect(output).toContain('"application/json": { "id": string; }');
  });
});
