import type { Knex } from "knex";
import { GenerationJobRepository } from "@/generation/jobRepository";
import { GenerationService } from "@/generation/generationService";
import type { ProviderCatalog } from "@/providers/domain/models";
import type { ProviderRegistry } from "@/providers/registry/providerRegistry";
import type { AssetGateway } from "@/assets/assetGateway";
import { GenerationLeaseRepository } from "@/generation/leaseRepository";
import { GenerationRunner } from "@/generation/runner";
import { DurableGenerationWorker } from "@/generation/worker";
import type { MediaAssetRepository } from "@/assets/mediaAssetRepository";
import type { OfferingAvailabilityService } from "@/providers/availability/offeringAvailability";

let runtime: GenerationService | undefined;
let worker: DurableGenerationWorker | undefined;

export function configureGenerationRuntime(
  database: Knex,
  catalog?: ProviderCatalog,
  dependencies: {
    registry?: ProviderRegistry;
    assetGateway?: AssetGateway;
    mediaAssetRepository?: MediaAssetRepository;
    availability?: OfferingAvailabilityService;
  } = {},
): GenerationService {
  const repository = new GenerationJobRepository(database);
  runtime = new GenerationService(repository, undefined, catalog, dependencies.availability);
  worker = dependencies.registry
    ? new DurableGenerationWorker(
        repository,
        new GenerationLeaseRepository(database),
        new GenerationRunner(repository, dependencies.registry, {
          ...(dependencies.assetGateway ? { assetGateway: dependencies.assetGateway } : {}),
          ...(dependencies.mediaAssetRepository
            ? { mediaAssetRepository: dependencies.mediaAssetRepository }
            : {}),
        }),
        runtime.changes,
      )
    : undefined;
  return runtime;
}

export function getGenerationRuntime(): GenerationService {
  if (!runtime) throw new Error("generation.runtime_not_configured");
  return runtime;
}

export function resetGenerationRuntimeForTests(): void {
  runtime = undefined;
  worker = undefined;
}

export async function startGenerationWorker(): Promise<void> {
  if (!worker) throw new Error("generation.worker_not_configured");
  await worker.start();
}

export async function stopGenerationWorker(): Promise<void> {
  await worker?.stop();
}
