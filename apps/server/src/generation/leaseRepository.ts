import type { Knex } from "knex";
import type { GenerationJobState } from "@/generation/stateMachine";

const leasableStates: GenerationJobState[] = [
  "queued",
  "preparing_assets",
  "submitting",
  "submitted",
  "remote_queued",
  "running",
  "importing",
];

export class GenerationLeaseRepository {
  readonly #database: Knex;

  constructor(database: Knex) {
    this.#database = database;
  }

  async claimDueJobs(input: {
    owner: string;
    now: number;
    leaseMs: number;
    limit: number;
  }): Promise<string[]> {
    if (!input.owner.trim() || input.leaseMs <= 0 || input.limit <= 0) {
      throw new Error("generation.invalid_lease_request");
    }
    const candidates = (await this.#database("o_generation_jobs")
      .select("id")
      .whereIn("state", leasableStates)
      .where("next_run_at", "<=", input.now)
      .andWhere((builder) => {
        builder.whereNull("lease_expires_at").orWhere("lease_expires_at", "<=", input.now);
      })
      .orderBy("next_run_at", "asc")
      .orderBy("created_at", "asc")
      .limit(input.limit)) as Array<{ id: string }>;

    const claimed: string[] = [];
    for (const candidate of candidates) {
      const updated = await this.#database("o_generation_jobs")
        .where({ id: candidate.id })
        .whereIn("state", leasableStates)
        .where("next_run_at", "<=", input.now)
        .andWhere((builder) => {
          builder.whereNull("lease_expires_at").orWhere("lease_expires_at", "<=", input.now);
        })
        .update({
          lease_owner: input.owner,
          lease_expires_at: input.now + input.leaseMs,
        });
      if (updated === 1) claimed.push(candidate.id);
    }
    return claimed;
  }

  async heartbeat(id: string, owner: string, now: number, leaseMs: number): Promise<boolean> {
    const updated = await this.#database("o_generation_jobs")
      .where({ id, lease_owner: owner })
      .where("lease_expires_at", ">", now)
      .update({ lease_expires_at: now + leaseMs });
    return updated === 1;
  }

  async release(id: string, owner: string): Promise<boolean> {
    const updated = await this.#database("o_generation_jobs")
      .where({ id, lease_owner: owner })
      .update({ lease_owner: null, lease_expires_at: null });
    return updated === 1;
  }

  async releaseOwned(owner: string): Promise<number> {
    return this.#database("o_generation_jobs")
      .where({ lease_owner: owner })
      .update({ lease_owner: null, lease_expires_at: null });
  }

  async scheduleNextPoll(input: {
    id: string;
    owner: string;
    nextRunAt: number;
    pollAttemptCount: number;
  }): Promise<boolean> {
    const updated = await this.#database("o_generation_jobs")
      .where({ id: input.id, lease_owner: input.owner })
      .update({
        next_run_at: input.nextRunAt,
        poll_attempt_count: input.pollAttemptCount,
        lease_owner: null,
        lease_expires_at: null,
      });
    return updated === 1;
  }
}
