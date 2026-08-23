import legacyHttp from "@/http/compat";
import { z } from "zod";
import { submitGenerationJobSchema } from "@/contracts/v2/schemas";
import { toGenerationJobView } from "@/generation/view";
import { getGenerationRuntime } from "@/generation/runtime";
import { success } from "@/lib/responseFormat";
import { principalIdFromClaims } from "@/security/principal";
import { generationJobStateSchema } from "@/generation/stateMachine";
import { decodeGenerationJobCursor, encodeGenerationJobCursor } from "@/generation/pagination";

const router = legacyHttp.Router();

router.post("/", async (req, res) => {
  const parsed = submitGenerationJobSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "contract.invalid_request" });
  try {
    const job = await getGenerationRuntime().submit(parsed.data, principalIdFromClaims(req.user));
    return res.status(202).json(success(toGenerationJobView(job), "任务已接受"));
  } catch (cause) {
    const error = cause as Error & { violations?: unknown };
    if (error.message === "generation.idempotency_conflict") {
      return res.status(409).json({ message: error.message });
    }
    if (
      error.message === "generation.preflight_failed" ||
      error.message === "generation.offering_unavailable"
    ) {
      return res.status(422).json({ message: error.message, violations: error.violations ?? [] });
    }
    if (error.message === "generation.offering_not_implemented") {
      return res.status(503).json({ message: error.message });
    }
    if (error.message.startsWith("generation.continuation_")) {
      return res.status(422).json({ message: error.message });
    }
    throw cause;
  }
});

router.get("/", async (req, res) => {
  const parsed = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      beforeUpdatedAt: z.coerce.number().int().optional(),
      cursor: z.string().min(1).optional(),
      state: z.union([generationJobStateSchema, z.array(generationJobStateSchema)]).optional(),
      recovery: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),
    })
    .safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: "contract.invalid_request" });
  let cursor;
  try {
    cursor = parsed.data.cursor ? decodeGenerationJobCursor(parsed.data.cursor) : undefined;
  } catch {
    return res.status(400).json({ message: "generation.invalid_cursor" });
  }
  const jobs = await getGenerationRuntime().list({
    principalId: principalIdFromClaims(req.user),
    limit: parsed.data.limit + 1,
    ...(parsed.data.beforeUpdatedAt ? { beforeUpdatedAt: parsed.data.beforeUpdatedAt } : {}),
    ...(cursor ? { cursor } : {}),
    ...(parsed.data.state
      ? { states: Array.isArray(parsed.data.state) ? parsed.data.state : [parsed.data.state] }
      : {}),
    ...(parsed.data.recovery ? { recoveryOnly: true } : {}),
  });
  const page = jobs.slice(0, parsed.data.limit);
  res.status(200).json(
    success({
      jobs: page.map(toGenerationJobView),
      ...(jobs.length > parsed.data.limit && page.length > 0
        ? {
            nextCursor: encodeGenerationJobCursor({
              updatedAt: page[page.length - 1]!.updatedAt,
              id: page[page.length - 1]!.id,
            }),
          }
        : {}),
    }),
  );
});

export default router;
