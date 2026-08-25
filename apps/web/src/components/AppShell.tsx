import {
  Boxes,
  ChevronDown,
  FileText,
  Film,
  Images,
  KeyRound,
  ListChecks,
  LogOut,
  Monitor,
  Moon,
  PanelsTopLeft,
  Sun,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { localeLabels, type Locale, type MessageKey } from "@/i18n/messages";
import { useI18n } from "@/i18n/useI18n";
import { THEME_PREFERENCES } from "@/state/appearance";
import { usePreferences, type ThemePreference } from "@/state/preferences";
import { useSession } from "@/state/session";
import { useWorkspace } from "@/state/workspace";

const themeIcons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

const themeLabels: Record<ThemePreference, MessageKey> = {
  light: "settings.theme.light",
  dark: "settings.theme.dark",
  system: "settings.theme.system",
};

export function AppShell({ children }: { children: ReactNode }) {
  const { locale, setLocale, t } = useI18n();
  const theme = usePreferences((state) => state.theme);
  const setTheme = usePreferences((state) => state.setTheme);
  const session = useSession((state) => state.session);
  const signOut = useSession((state) => state.signOut);
  const projectId = useWorkspace((state) => state.projectId);
  const projectPath = (surface: string) => (projectId ? `/${surface}/${projectId}` : `/${surface}`);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink className="brand" to="/projects" aria-label="NarraStage projects">
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
          <NavLink to={projectPath("studio")}>
            <PanelsTopLeft size={18} />
            <span>{t("nav.studio")}</span>
          </NavLink>
          <NavLink to={projectPath("scripts")}>
            <FileText size={18} />
            <span>{t("nav.scripts")}</span>
          </NavLink>
          <NavLink to={projectPath("assets")}>
            <Images size={18} />
            <span>{t("nav.assets")}</span>
          </NavLink>
          <NavLink to="/jobs">
            <ListChecks size={18} />
            <span>{t("nav.jobs")}</span>
          </NavLink>
          <NavLink to="/providers">
            <KeyRound size={18} />
            <span>{t("nav.providers")}</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="theme-switch" role="radiogroup" aria-label={t("settings.theme")}>
            {THEME_PREFERENCES.map((value) => {
              const Icon = themeIcons[value];
              const label = t(themeLabels[value]);
              return (
                <label key={value} title={label}>
                  <input
                    type="radio"
                    name="appearance"
                    value={value}
                    checked={theme === value}
                    aria-label={label}
                    onChange={() => setTheme(value)}
                  />
                  <Icon size={15} strokeWidth={2.1} aria-hidden="true" />
                </label>
              );
            })}
          </div>
          <label className="locale-control">
            <span className="sr-only">{t("settings.language")}</span>
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
