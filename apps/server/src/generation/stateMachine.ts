import { z } from "zod";

export const generationJobStateSchema = z.enum([
  "queued",
  "preparing_assets",
  "submitting",
  "submitted",
  "remote_queued",
  "running",
  "importing",
  "submission_unknown",
  "succeeded",
  "failed",
  "cancelled",
  "abandoned",
]);

export type GenerationJobState = z.infer<typeof generationJobStateSchema>;

const transitions: Readonly<Record<GenerationJobState, ReadonlySet<GenerationJobState>>> = {
  queued: new Set(["preparing_assets", "cancelled", "failed"]),
  preparing_assets: new Set(["submitting", "cancelled", "failed"]),
  submitting: new Set(["submitted", "failed", "cancelled", "submission_unknown"]),
  submitted: new Set(["remote_queued", "running", "importing", "failed", "cancelled"]),
  remote_queued: new Set(["running", "importing", "failed", "cancelled"]),
  running: new Set(["running", "importing", "failed", "cancelled"]),
  importing: new Set(["succeeded", "failed", "cancelled"]),
  submission_unknown: new Set([
    "queued",
    "submitted",
    "remote_queued",
    "running",
    "importing",
    "failed",
    "cancelled",
    "abandoned",
  ]),
  succeeded: new Set(),
  failed: new Set(["importing"]),
  cancelled: new Set(),
  abandoned: new Set(),
};

export function assertJobTransition(from: GenerationJobState, to: GenerationJobState): void {
  if (!canJobTransition(from, to)) {
    throw new Error(`generation.invalid_transition:${from}->${to}`);
  }
}

export function canJobTransition(from: GenerationJobState, to: GenerationJobState): boolean {
  return transitions[from].has(to);
}

export function isTerminalJobState(state: GenerationJobState): boolean {
  return (
    state === "succeeded" || state === "failed" || state === "cancelled" || state === "abandoned"
  );
}

export function recoverInterruptedJobState(
  state: GenerationJobState,
  attemptState?:
    | "prepared"
    | "send_started"
    | "handle_persisted"
    | "provider_rejected"
    | "submission_unknown",
): GenerationJobState {
  return state === "submitting" && attemptState === "send_started" ? "submission_unknown" : state;
}
