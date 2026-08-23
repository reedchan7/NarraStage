import express from "express";
import { languageExecutionRequestSchema } from "@/contracts/v2/schemas";
import { getLanguageExecutionRuntime } from "@/providers/languageExecutionService";
import {
  providerErrorHttpStatus,
  unexpectedProviderError,
} from "@/providers/domain/executionError";
import { principalIdFromClaims } from "@/security/principal";

const router = express.Router();

export default router.post("/", async (req, res) => {
  const parsed = languageExecutionRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "contract.invalid_request" });
  const abortController = new AbortController();
  res.once("close", () => abortController.abort());
  try {
    const stream = await getLanguageExecutionRuntime().stream(parsed.data, {
      abortSignal: abortController.signal,
      principalId: principalIdFromClaims((req as express.Request & { user?: unknown }).user),
    });
    res.status(200);
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-cache, no-transform");
    res.setHeader("x-accel-buffering", "no");
    res.flushHeaders();
    for await (const event of stream) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
  } catch (cause) {
    const error = unexpectedProviderError(cause).providerError;
    if (!res.headersSent) {
      return res.status(providerErrorHttpStatus(error)).json({ message: error.code, error });
    }
    res.write(`data: ${JSON.stringify({ type: "error", error })}\n\n`);
    res.end();
  }
});
