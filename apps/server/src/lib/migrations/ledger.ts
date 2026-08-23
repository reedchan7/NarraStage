import type { Knex } from "knex";

export interface ProviderPlatformMigration {
  id: string;
  up(database: Knex): Promise<void>;
}

const ledgerTable = "o_provider_schema_migrations";

export async function runMigrationLedger(
  database: Knex,
  migrations: readonly ProviderPlatformMigration[],
): Promise<void> {
  if (!(await database.schema.hasTable(ledgerTable))) {
    await database.schema.createTable(ledgerTable, (table) => {
      table.string("id").primary();
      table.text("applied_at").notNullable();
    });
  }

  for (const migration of migrations) {
    const applied = await database(ledgerTable).where({ id: migration.id }).first();
    if (applied) continue;
    await database.transaction(async (transaction) => {
      const concurrent = await transaction(ledgerTable).where({ id: migration.id }).first();
      if (concurrent) return;
      await migration.up(transaction);
      await transaction(ledgerTable).insert({
        id: migration.id,
        applied_at: new Date().toISOString(),
      });
    });
  }
}
