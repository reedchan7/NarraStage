import { Boxes, ChevronDown, Film, KeyRound, LogOut, PanelsTopLeft } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { localeLabels, type Locale } from "@/i18n/messages";
import { useI18n } from "@/i18n/useI18n";
import { useSession } from "@/state/session";

export function AppShell({ children }: { children: ReactNode }) {
  const { locale, setLocale, t } = useI18n();
  const session = useSession((state) => state.session);
  const signOut = useSession((state) => state.signOut);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink className="brand" to="/projects" aria-label="Toonflow projects">
          <span className="brand-mark" aria-hidden="true">
            <Film size={18} strokeWidth={2.2} />
          </span>
          <span>
            <strong>{t("app.name")}</strong>
            <small>{t("app.tagline")}</small>
          </span>
        </NavLink>

        <nav className="primary-nav" aria-label="Primary navigation">
          <NavLink to="/projects">
            <Boxes size={18} />
            <span>{t("nav.projects")}</span>
          </NavLink>
          <NavLink to="/studio">
            <PanelsTopLeft size={18} />
            <span>{t("nav.studio")}</span>
          </NavLink>
          <NavLink to="/providers">
            <KeyRound size={18} />
            <span>{t("nav.providers")}</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <label className="locale-control">
            <span className="sr-only">Language</span>
            <select
              value={locale}
              onChange={(event) => setLocale(event.currentTarget.value as Locale)}
            >
              {Object.entries(localeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>
          <div className="account-row">
            <span className="avatar" aria-hidden="true">
              {session?.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="account-copy">
              <strong>{session?.name}</strong>
              <small>{session?.role}</small>
            </span>
            <button
              className="icon-button"
              onClick={signOut}
              type="button"
              aria-label={t("nav.signOut")}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="workspace">{children}</main>
    </div>
  );
}
