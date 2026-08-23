import { describe, expect, test } from "bun:test";
import {
  assertJobTransition,
  canJobTransition,
  isTerminalJobState,
  recoverInterruptedJobState,
  type GenerationJobState,
  generationJobStateSchema,
} from "@/generation/stateMachine";

describe("generation job state machine", () => {
  test("permits only declared transitions and keeps terminal states closed", () => {
    expect(() => assertJobTransition("queued", "preparing_assets")).not.toThrow();
    expect(() => assertJobTransition("preparing_assets", "submitting")).not.toThrow();
    expect(() => assertJobTransition("submitting", "submitted")).not.toThrow();
    expect(() => assertJobTransition("running", "importing")).not.toThrow();
    expect(() => assertJobTransition("importing", "succeeded")).not.toThrow();
    expect(() => assertJobTransition("succeeded", "running")).toThrow(
      "generation.invalid_transition:succeeded->running",
    );

    const states: GenerationJobState[] = ["succeeded", "failed", "cancelled", "abandoned"];
    expect(states.every(isTerminalJobState)).toBe(true);
  });

  test("turns a crash at the paid submit boundary into manual reconciliation", () => {
    expect(recoverInterruptedJobState("submitting", "send_started")).toBe("submission_unknown");
    expect(recoverInterruptedJobState("submitting", "prepared")).toBe("submitting");
    expect(recoverInterruptedJobState("running", "send_started")).toBe("running");
  });

  test("locks the complete transition matrix", () => {
    const allowed: Record<GenerationJobState, GenerationJobState[]> = {
      queued: ["preparing_assets", "cancelled", "failed"],
      preparing_assets: ["submitting", "cancelled", "failed"],
      submitting: ["submitted", "failed", "cancelled", "submission_unknown"],
      submitted: ["remote_queued", "running", "importing", "failed", "cancelled"],
      remote_queued: ["running", "importing", "failed", "cancelled"],
      running: ["running", "importing", "failed", "cancelled"],
      importing: ["succeeded", "failed", "cancelled"],
      submission_unknown: [
        "queued",
        "submitted",
        "remote_queued",
        "running",
        "importing",
        "failed",
        "cancelled",
        "abandoned",
      ],
      succeeded: [],
      failed: ["importing"],
      cancelled: [],
      abandoned: [],
    };
    for (const from of generationJobStateSchema.options) {
      for (const to of generationJobStateSchema.options) {
        expect(canJobTransition(from, to)).toBe(allowed[from].includes(to));
      }
    }
  });
});
