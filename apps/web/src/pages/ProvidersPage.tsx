import {
  Activity,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import {
  api,
  type ProviderHealth,
  type ProviderHealthCheckResult,
  type ProviderSlot,
  type ProviderStatus,
} from "@/api/client";
import { AgentModelsSection } from "@/features/providers/AgentModelsSection";
import { useI18n } from "@/i18n/useI18n";
import type { MessageKey } from "@/i18n/messages";
import { useSession } from "@/state/session";

const HEALTH_KEYS = {
  unknown: "providers.health.unknown",
  healthy: "providers.health.healthy",
  degraded: "providers.health.degraded",
  unhealthy: "providers.health.unhealthy",
} as const satisfies Record<ProviderHealth, MessageKey>;

const REASON_KEYS: Record<string, MessageKey> = {
  "credential.missing": "providers.reason.missing",
  "credential.invalid": "providers.reason.invalid",
  "provider.connection_failed": "providers.reason.connection",
  "provider.health_probe_unsupported": "providers.reason.unsupported",
  "provider.model_unavailable": "providers.reason.model",
  "provider.offerings_partially_available": "providers.reason.partial",
  "provider.offerings_unavailable": "providers.reason.unavailable",
  "provider.model_access_denied": "providers.reason.denied",
  "provider.model_identity_mismatch": "providers.reason.mismatch",
  "provider.endpoint_unavailable": "providers.reason.endpoint",
  "provider.endpoint_revision_unavailable": "providers.reason.revision",
  "provider.endpoint_contract_unavailable": "providers.reason.contract",
};

function visibleError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const invoked = error.message.match(/^Error invoking remote method '[^']+':\s*([\s\S]+)$/);
  const body = invoked?.[1] ?? error.message;
  try {
    const parsed: unknown = JSON.parse(body);
    if (Array.isArray(parsed)) {
      const first = parsed[0] as { message?: unknown } | undefined;
      if (typeof first?.message === "string" && first.message.trim()) return first.message;
    }
  } catch {
    /* keep the original IPC message */
  }
  return body.trim() || fallback;
}

function CredentialSlot({
  provider,
  slot,
  onSaved,
  onDeleted,
}: {
  provider: ProviderStatus;
  slot: ProviderSlot;
  onSaved: () => Promise<unknown>;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState("");
  const [revealed, setRevealed] = useState(false);
  const bridge = window.narrastageCredentials;
  const writable = Boolean(bridge && slot.writable);
  const fieldId = `${provider.providerId}-${slot.slot}`;
  const mutation = useMutation({
    mutationFn: async (action: "set" | "delete") => {
      if (!bridge) throw new Error(t("providers.browser"));
      const request = { providerId: provider.providerId, slot: slot.slot };
      if (action === "delete") return bridge.delete(request);
      return bridge.set({ ...request, value: secret });
    },
    onSuccess: (_status, action) => {
      setSecret("");
      setRevealed(false);
      if (action === "delete") onDeleted();
      else void onSaved();
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate("set");
  }

  return (
    <div className="credential-row">
      <span className="credential-status" data-configured={slot.configured}>
        {slot.configured ? <Check size={14} /> : <KeyRound size={14} />}
      </span>
      <span className="credential-copy">
        <strong>{slot.slot}</strong>
        <small>
          {slot.configured ? t("providers.connected") : t("providers.missing")} · {slot.source}
        </small>
      </span>
      {writable ? (
        <form onSubmit={submit} className="secret-form">
          <label className="sr-only" htmlFor={fieldId}>
            {t("providers.key")}
          </label>
          <div className="secret-field">
            <input
              id={fieldId}
              type={revealed ? "text" : "password"}
              value={secret}
              onChange={(event) => setSecret(event.currentTarget.value)}
              placeholder={t("providers.key")}
              name={`${provider.providerId}-${slot.slot}-secret`}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
            <button
              className="icon-button secret-visibility"
              type="button"
              aria-label={revealed ? t("providers.hideSecret") : t("providers.showSecret")}
              aria-pressed={revealed}
              onClick={() => setRevealed((current) => !current)}
            >
              {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <div className="credential-actions">
            <button
              className="button compact primary"
              disabled={mutation.isPending || !secret}
              type="submit"
            >
              {t("providers.set")}
            </button>
            {slot.configured ? (
              <button
                className="icon-button danger"
                onClick={() => mutation.mutate("delete")}
                disabled={mutation.isPending}
                type="button"
                aria-label={t("providers.remove")}
              >
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <span className="desktop-only-note">{t("providers.browser")}</span>
      )}
      {mutation.error ? (
        <p className="form-error row-error" role="alert">
          {visibleError(mutation.error, t("common.error"))}
        </p>
      ) : null}
    </div>
  );
}

function ProviderCard({ provider, token }: { provider: ProviderStatus; token: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const configured = provider.slots.some((slot) => slot.configured);
  const probeEpoch = useRef(0);
  const [probe, setProbe] = useState<ProviderHealthCheckResult | null>(null);
  const ping = useMutation({
    mutationFn: async () => {
      const epoch = probeEpoch.current;
      const snapshot = await api.healthCheck(token, provider.providerId);
      if (epoch === probeEpoch.current) setProbe(snapshot);
      return snapshot;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });
  const health = probe?.health ?? (configured ? provider.health : "unknown");
  const reasonKey = probe?.reasonCode ? REASON_KEYS[probe.reasonCode] : undefined;

  function forgetProbe() {
    probeEpoch.current += 1;
    setProbe(null);
    ping.reset();
  }

  return (
    <article className="provider-card">
      <header>
        <span className="provider-monogram" aria-hidden="true">
          {provider.providerId.slice(0, 2).toUpperCase()}
        </span>
        <span className="provider-identity">
          <strong>{provider.providerId}</strong>
          <small data-health={health} role="status">
            {t(HEALTH_KEYS[health])}
          </small>
        </span>
        <button
          className="button compact secondary provider-ping"
          type="button"
          disabled={ping.isPending || !configured}
          aria-busy={ping.isPending}
          title={!configured ? t("providers.pingNeedSecret") : undefined}
          onClick={() => ping.mutate()}
        >
          <Activity className={ping.isPending ? "spin" : ""} size={15} />
          {ping.isPending ? t("providers.pinging") : t("providers.ping")}
        </button>
      </header>
      {reasonKey ? (
        <p className="provider-reason" data-health={health}>
          {t(reasonKey)}
        </p>
      ) : null}
      {ping.error ? (
        <p className="form-error provider-reason" role="alert">
          {visibleError(ping.error, t("common.error"))}
        </p>
      ) : null}
      <div className="credential-list">
        {provider.slots.length > 0 ? (
          provider.slots.map((slot) => (
            <CredentialSlot
              key={slot.slot}
              provider={provider}
              slot={slot}
              onSaved={() => ping.mutateAsync()}
              onDeleted={forgetProbe}
            />
          ))
        ) : (
          <p className="slot-empty">{t("providers.noCredential")}</p>
        )}
      </div>
    </article>
  );
}

export function ProvidersPage() {
  const token = useSession((state) => state.session?.token ?? "");
  const { t } = useI18n();
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: () => api.providers(token),
  });

  return (
    <div className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">NARRASTAGE / RUNTIME</p>
          <h1>{t("providers.title")}</h1>
          <p>{t("providers.description")}</p>
        </div>
        <button
          className="button secondary"
          onClick={() => providers.refetch()}
          disabled={providers.isFetching}
          type="button"
        >
          <RefreshCw className={providers.isFetching ? "spin" : ""} size={16} />
          {t("common.retry")}
        </button>
      </header>
      <div className="security-note">
        <ShieldCheck size={18} />
        <span>{t("providers.secure")}</span>
      </div>

      {providers.isPending ? (
        <div className="provider-list" role="status" aria-live="polite">
          <div className="provider-skeleton" />
          <div className="provider-skeleton" />
        </div>
      ) : providers.isError ? (
        <section className="empty-state" role="alert">
          <strong>{t("common.error")}</strong>
          <p>{providers.error.message}</p>
        </section>
      ) : (
        <section className="provider-list" aria-label={t("providers.title")}>
          {providers.data.providers.map((provider) => (
            <ProviderCard key={provider.providerId} provider={provider} token={token} />
          ))}
        </section>
      )}
      <AgentModelsSection token={token} />
    </div>
  );
}
