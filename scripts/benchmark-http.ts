import legacyHttp from "@/http/compat";

const app = legacyHttp();
const router = legacyHttp.Router();
router.get("/", (_request, response) => response.status(200).json({ ok: true }));
app.use("/health", router);
const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;
const startedAt = performance.now();

try {
  const responses = await Promise.all(
    Array.from({ length: 100 }, () => fetch(`http://127.0.0.1:${port}/health`)),
  );
  const failed = responses.filter((response) => response.status !== 200);
  if (failed.length > 0) throw new Error(`http.benchmark_failures:${failed.length}`);
  await Promise.all(responses.map((response) => response.body?.cancel()));
  console.log(
    JSON.stringify({
      requests: responses.length,
      failures: failed.length,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
    }),
  );
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
