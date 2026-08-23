import type { Knex } from "knex";
import { MediaAssetRepository } from "@/assets/mediaAssetRepository";

let repository: MediaAssetRepository | undefined;

export function configureMediaAssetRuntime(database: Knex, rootDirectory: string) {
  repository = new MediaAssetRepository(database, rootDirectory);
  return repository;
}

export function getMediaAssetRepository(): MediaAssetRepository {
  if (!repository) throw new Error("asset.runtime_not_configured");
  return repository;
}

export function resetMediaAssetRuntimeForTests(): void {
  repository = undefined;
}
