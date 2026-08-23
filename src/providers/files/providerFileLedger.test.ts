import { afterEach, describe, expect, test } from "bun:test";
import knex, { type Knex } from "knex";
import { runProviderPlatformMigrations } from "@/lib/migrations";
import {
  configureProviderFileLedger,
  resetProviderFileLedgerForTests,
} from "@/providers/files/providerFileLedger";
import { defineProviderAdapter } from "@/providers/ports";
import { ProviderRegistry } from "@/providers/registry/providerRegistry";
import { LanguageExecutionService } from "@/providers/languageExecutionService";
import { assertAgentProviderFilesOwned } from "@/agents/chatAttachments";

let database: Knex | undefined;

afterEach(async () => {
  resetProviderFileLedgerForTests();
  await database?.destroy();
  database = undefined;
});

describe("provider file ownership ledger", () => {
  test("allows the uploader and rejects another principal across REST and Agent paths", async () => {
    database = knex({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await runProviderPlatformMigrations(database);
    configureProviderFileLedger(database);
    const registry = new ProviderRegistry();
    registry.register(
      defineProviderAdapter({
        providerId: "google",
        ports: [
          {
            operation: "files.upload" as const,
            async upload() {
              return {
                schemaVersion: "1.0.0" as const,
                providerId: "google",
                fileId: "files/private-42",
                mediaType: "application/pdf",
                filename: "brief.pdf",
              };
            },
          },
          {
            operation: "language.generate" as const,
            async generate() {
              return {
                schemaVersion: "1.0.0" as const,
                text: "ok",
                reasoning: "",
                toolCalls: [],
                finishReason: "stop" as const,
                usage: {},
                resolvedModelId: "gemini-3.7-flash",
              };
            },
          },
        ],
      }),
    );
    const service = new LanguageExecutionService(registry);
    await service.upload(
      {
        schemaVersion: "1.0.0",
        canonicalModelId: "google:gemini-3.7-flash",
        offeringId: "google:gemini-3.7-flash:official",
        idempotencyKey: "upload-private-file",
        input: {
          dataBase64: "JVBERg==",
          byteLength: 4,
          mediaType: "application/pdf",
          filename: "brief.pdf",
        },
      },
      { principalId: "user:A" },
    );
    const input = {
      messages: [
        {
          role: "user" as const,
          content: [
            {
              type: "file" as const,
              source: {
                type: "provider_file" as const,
                providerId: "google",
                fileId: "files/private-42",
                mediaType: "application/pdf",
              },
            },
          ],
        },
      ],
    };
    const request = {
      schemaVersion: "1.0.0" as const,
      canonicalModelId: "google:gemini-3.7-flash" as const,
      offeringId: "google:gemini-3.7-flash:official" as const,
      idempotencyKey: "use-private-file",
      input,
    };

    await expect(service.generate(request, { principalId: "user:A" })).resolves.toMatchObject({
      text: "ok",
    });
    await expect(service.generate(request, { principalId: "user:B" })).rejects.toMatchObject({
      providerError: { category: "forbidden", code: "provider.file_forbidden" },
    });

    const attachment = {
      schemaVersion: "1.0.0" as const,
      id: "0198f8d4-9571-7000-8000-000000000001",
      filename: "brief.pdf",
      mediaType: "application/pdf" as const,
      byteLength: 4,
      source: { type: "provider_file" as const, providerId: "google", fileId: "files/private-42" },
    };
    await expect(assertAgentProviderFilesOwned([attachment], "user:A")).resolves.toBeUndefined();
    await expect(assertAgentProviderFilesOwned([attachment], "user:B")).rejects.toThrow(
      "provider.file_forbidden",
    );
  });
});
