import { ArrowRight, Film, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { useI18n } from "@/i18n/useI18n";
import { useSession } from "@/state/session";

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useSession((state) => state.setSession);
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const session = await api.login(String(data.get("username")), String(data.get("password")));
      setSession(session);
      navigate("/projects", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-labelledby="login-story-title">
        <span className="brand-mark large" aria-hidden="true">
          <Film size={28} strokeWidth={2.2} />
        </span>
        <p className="eyebrow">{t("login.eyebrow")}</p>
        <h1 id="login-story-title">{t("app.tagline")}</h1>
        <p className="login-lede">把创意拆成可见的步骤：整理故事，确认镜头，再交付一条完整成片。</p>
        <ol className="production-track" aria-label="Production stages">
          <li>
            <span>01</span>
            <strong>{t("studio.story")}</strong>
            <small>结构、角色与节奏</small>
          </li>
          <li>
            <span>02</span>
            <strong>{t("studio.image")}</strong>
            <small>角色一致的镜头</small>
          </li>
          <li>
            <span>03</span>
            <strong>{t("studio.video")}</strong>
            <small>运动、声音与剪辑</small>
          </li>
        </ol>
      </section>
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-form-wrap">
          <p className="eyebrow">TOONFLOW / WORKSPACE</p>
          <h2 id="login-title">{t("login.title")}</h2>
          <p>{t("login.description")}</p>
          <form onSubmit={submit} className="stack-form">
            <label>
              <span>{t("login.username")}</span>
              <input name="username" autoComplete="username" required autoFocus />
            </label>
            <label>
              <span>{t("login.password")}</span>
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="button primary wide" disabled={pending} type="submit">
              <span>{pending ? t("login.pending") : t("login.submit")}</span>
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="trust-note">
            <ShieldCheck size={16} /> 本机服务验证 · 180 天会话
          </p>
        </div>
      </section>
    </main>
  );
}
