import { Check, KeyRound, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type ProviderSlot, type ProviderStatus } from "@/api/client";
import { useI18n } from "@/i18n/useI18n";
import { useSession } from "@/state/session";

function CredentialSlot({ provider, slot }: { provider: ProviderStatus; slot: ProviderSlot }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState("");
  const bridge = window.toonflowCredentials;
  const writable = Boolean(bridge && slot.writable);
  const mutation = useMutation({
    mutationFn: async (action: "set" | "delete") => {
      if (!bridge) throw new Error(t("providers.browser"));
      const request = { providerId: provider.providerId, slot: slot.slot };
      return action === "set" ? bridge.set({ ...request, value: secret }) : bridge.delete(request);
    },
    onSuccess: async () => {
      setSecret("");
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
          <label className="sr-only" htmlFor={`${provider.providerId}-${slot.slot}`}>
            {t("providers.key")}
          </label>
          <input
            id={`${provider.providerId}-${slot.slot}`}
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.currentTarget.value)}
            placeholder={t("providers.key")}
            autoComplete="off"
            required
          />
          <button
            className="button compact secondary"
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
        </form>
      ) : (
        <span className="desktop-only-note">{t("providers.browser")}</span>
      )}
      {mutation.error ? (
        <p className="form-error row-error" role="alert">
          {mutation.error.message}
        </p>
      ) : null}
    </div>
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
          <p className="eyebrow">TOONFLOW / RUNTIME</p>
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
        <div className="provider-list" aria-label={t("common.loading")}>
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
            <article className="provider-card" key={provider.providerId}>
              <header>
                <span className="provider-monogram" aria-hidden="true">
                  {provider.providerId.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <strong>{provider.providerId}</strong>
                  <small data-health={provider.health}>{provider.health}</small>
                </span>
              </header>
              <div className="credential-list">
                {provider.slots.length > 0 ? (
                  provider.slots.map((slot) => (
                    <CredentialSlot key={slot.slot} provider={provider} slot={slot} />
                  ))
                ) : (
                  <p className="slot-empty">No credential required</p>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
