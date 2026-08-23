import { afterEach, expect, test } from "bun:test";
import type { Server } from "node:http";
import legacyHttp from "@/http/compat";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

test("Hono compatibility routes preserve params, query, JSON body, middleware, and status", async () => {
  const app = legacyHttp();
  app.use((request, _response, next) => {
    request.user = { id: 42 };
    return next();
  });
  const router = legacyHttp.Router({ mergeParams: true });
  router.post("/:id", (request, response) =>
    response.status(201).json({
      body: request.body,
      id: request.params.id,
      query: request.query.mode,
      user: request.user,
    }),
  );
  app.use("/api/jobs", router);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  const response = await fetch(`http://127.0.0.1:${port}/api/jobs/job-1?mode=retry`, {
    body: JSON.stringify({ prompt: "paper boat" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    body: { prompt: "paper boat" },
    id: "job-1",
    query: "retry",
    user: { id: 42 },
  });
});
