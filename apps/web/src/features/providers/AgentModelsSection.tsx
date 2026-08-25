import { Bot } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type AgentDeployRow, type CatalogResult } from "@/api/client";
import {
  agentModelUpdate,
  languageOfferings,
  offeringLabel,
  simpleAgentRows,
} from "@/features/providers/agentModels";
import { useI18n } from "@/i18n/useI18n";

function AgentModelRow({
  row,
  catalog,
  token,
}: {
  row: AgentDeployRow;
  catalog: CatalogResult;
  token: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const offerings = languageOfferings(catalog);
  const fieldId = `agent-model-${row.key}`;
  const mutation = useMutation({
    mutationFn: async (offeringId: string) => {
      const offering = offerings.find((candidate) => candidate.id === offeringId);
      if (!offering) throw new Error(t("agents.needOffering"));
      return api.updateAgentModel(token, agentModelUpdate(row, offering, catalog));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agent-deploy"] });
    },
  });
  const knownIds = new Set(offerings.map((offering) => offering.id));
  const selected = mutation.isError ? row.modelName : (mutation.variables ?? row.modelName);
  const orphan = selected && !knownIds.has(selected) ? selected : null;
  const errorId = `${fieldId}-error`;

  return (
    <article className="provider-card">
      <header>
        <span className="provider-monogram" aria-hidden="true">
          <Bot size={16} strokeWidth={2.1} />
        </span>
        <span className="provider-identity">
          <strong>{row.name}</strong>
          <small>{row.desc}</small>
        </span>
      </header>
      <div className="agent-model-row">
        <label className="agent-model-field" htmlFor={fieldId}>
          <span>{t("agents.field")}</span>
          <select
            id={fieldId}
            value={selected}
            disabled={mutation.isPending || offerings.length === 0}
            aria-label={row.name}
            aria-invalid={mutation.isError}
            aria-describedby={mutation.isError ? errorId : undefined}
            aria-busy={mutation.isPending}
            onChange={(event) => {
              const next = event.currentTarget.value;
              if (next) mutation.mutate(next);
            }}
          >
            <option value="" disabled={Boolean(selected)}>
              {t("agents.unassigned")}
            </option>
            {orphan ? <option value={orphan}>{orphan}</option> : null}
            {offerings.map((offering) => (
              <option key={offering.id} value={offering.id}>
                {offeringLabel(catalog, offering)}
              </option>
            ))}
          </select>
        </label>
        {mutation.error ? (
          <p className="form-error row-error" id={errorId} role="alert">
            {mutation.error.message}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function AgentModelsSection({ token }: { token: string }) {
  const { t } = useI18n();
  const catalog = useQuery({
    queryKey: ["provider-catalog"],
    queryFn: () => api.catalog(token),
    staleTime: 60_000,
  });
  const deploy = useQuery({
    queryKey: ["agent-deploy"],
    queryFn: () => api.agentDeploy(token),
  });
  const catalogData = catalog.data;
  const agents = simpleAgentRows(deploy.data?.qrdinaryData ?? []);

  return (
    <section className="runtime-section" aria-labelledby="agent-models-heading">
      <div className="runtime-section-header">
        <h2 id="agent-models-heading">{t("agents.title")}</h2>
        <p>{t("agents.description")}</p>
      </div>
      {catalog.isPending || deploy.isPending ? (
        <div className="provider-list" role="status" aria-live="polite">
          <div className="provider-skeleton" />
        </div>
      ) : catalog.isError || deploy.isError ? (
        <section className="empty-state" role="alert">
          <strong>{t("common.error")}</strong>
          <p>{(catalog.error ?? deploy.error)?.message}</p>
        </section>
      ) : !catalogData || agents.length === 0 ? (
        <section className="empty-state">
          <strong>{t("agents.empty")}</strong>
        </section>
      ) : (
        <div className="provider-list">
          {languageOfferings(catalogData).length === 0 ? (
            <p className="runtime-section-note">{t("agents.needOffering")}</p>
          ) : null}
          {agents.map((row) => (
            <AgentModelRow key={row.key} row={row} catalog={catalogData} token={token} />
          ))}
        </div>
      )}
    </section>
  );
}
