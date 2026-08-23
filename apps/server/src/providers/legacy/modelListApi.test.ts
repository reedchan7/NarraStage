import { afterEach, describe, expect, test } from "bun:test";
import express from "express";
import type http from "node:http";
import { createModelListRouter } from "@/providers/legacy/modelListApi";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe("legacy model list API", () => {
  test("returns a successful empty collection when no vendor is enabled", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/api/modelSelect/getModelList",
      createModelListRouter({
        listEnabledVendors: async () => [],
        getModels: async () => {
          throw new Error("unexpected model lookup");
        },
        getVendor: async () => {
          throw new Error("unexpected vendor lookup");
        },
      }),
    );
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}/api/modelSelect/getModelList`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "image" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: 200, data: [], message: "成功" });
  });
});
