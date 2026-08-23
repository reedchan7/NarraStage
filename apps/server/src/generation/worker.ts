import { randomUUID } from "node:crypto";
import { GenerationJobRepository } from "@/generation/jobRepository";
import { GenerationLeaseRepository } from "@/generation/leaseRepository";
import { GenerationRunner } from "@/generation/runner";
import type { JobChangePublisher } from "@/generation/jobChanges";

export interface GenerationWorkerOptions {
  owner?: string;
  pollIntervalMs?: number;
  leaseMs?: number;
  batchSize?: number;
  now?: () => number;
}

export class DurableGenerationWorker {
  readonly #repository: GenerationJobRepository;
  readonly #leases: GenerationLeaseRepository;
  readonly #runner: GenerationRunner;
  readonly #changes: JobChangePublisher;
  readonly #owner: string;
  readonly #pollIntervalMs: number;
  readonly #leaseMs: number;
  readonly #batchSize: number;
  readonly #now: () => number;
  #timer?: ReturnType<typeof setInterval>;
  #tickPromise?: Promise<number>;

  constructor(
    repository: GenerationJobRepository,
    leases: GenerationLeaseRepository,
    runner: GenerationRunner,
    changes: JobChangePublisher,
    options: GenerationWorkerOptions = {},
  ) {
    this.#repository = repository;
    this.#leases = leases;
    this.#runner = runner;
    this.#changes = changes;
    this.#owner = options.owner ?? `worker:${process.pid}:${randomUUID()}`;
    this.#pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.#leaseMs = options.leaseMs ?? 120_000;
    this.#batchSize = options.batchSize ?? 4;
    this.#now = options.now ?? Date.now;
  }

  async start(): Promise<void> {
    if (this.#timer) return;
    await this.#runner.recoverInterruptedSubmissions();
    await this.tick();
    this.#timer = setInterval(() => void this.tick(), this.#pollIntervalMs);
    this.#timer.unref?.();
  }

  tick(): Promise<number> {
    if (this.#tickPromise) return this.#tickPromise;
    this.#tickPromise = this.#runTick().finally(() => {
      this.#tickPromise = undefined;
    });
    return this.#tickPromise;
  }

  async stop(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    await this.#tickPromise;
    await this.#leases.releaseOwned(this.#owner);
  }

  async #runTick(): Promise<number> {
    const ids = await this.#leases.claimDueJobs({
      owner: this.#owner,
      now: this.#now(),
      leaseMs: this.#leaseMs,
      limit: this.#batchSize,
    });
    for (const id of ids) await this.#runClaimed(id);
    return ids.length;
  }

  async #runClaimed(id: string): Promise<void> {
    const heartbeat = setInterval(
      () => void this.#leases.heartbeat(id, this.#owner, this.#now(), this.#leaseMs),
      Math.max(1_000, Math.floor(this.#leaseMs / 3)),
    );
    heartbeat.unref?.();
    try {
      const job = await this.#repository.get(id);
      if (!job) return;
      if (["queued", "preparing_assets", "submitting"].includes(job.state)) {
        await this.#runner.runJob(id);
      } else {
        await this.#runner.pollJob(id);
      }
    } catch {
      await this.#repository.recoverInterruptedSubmission(id);
    } finally {
      clearInterval(heartbeat);
      const job = await this.#repository.get(id);
      if (job) {
        this.#changes.publish({
          jobId: job.id,
          principalId: job.principalId,
          version: job.version,
        });
      }
      await this.#leases.release(id, this.#owner);
    }
  }
}
