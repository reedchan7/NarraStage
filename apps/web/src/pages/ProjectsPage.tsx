import { ArrowUpRight, Clapperboard, Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type CreateProjectInput } from "@/api/client";
import { useI18n } from "@/i18n/useI18n";
import { useSession } from "@/state/session";
import { useWorkspace } from "@/state/workspace";

const projectDefaults: Omit<CreateProjectInput, "name" | "intro" | "artStyle" | "videoRatio"> = {
  projectType: "animation",
  type: "short",
  directorManual: "",
  imageModel: "grsai:nano-banana-2",
  imageOfferingId: "google:nano-banana-2-lite:official",
  videoModel: "narrastage:Kling-Video-O1",
  imageQuality: "1K",
  mode: "text",
  videoGenerationSelection: {
    catalogMode: "builtin",
    canonicalModelId: "minimax:h3",
    offeringId: "minimax:h3:official",
    providerId: "minimax",
    preferenceMode: "pinned",
  },
};

export function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useSession((state) => state.session?.token ?? "");
  const selectProject = useWorkspace((state) => state.selectProject);
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects(token),
  });
  const createProject = useMutation({
    mutationFn: (input: CreateProjectInput) => api.createProject(token, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setCreating(false);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    createProject.mutate({
      ...projectDefaults,
      name: String(data.get("name")),
      intro: String(data.get("intro")),
      artStyle: String(data.get("artStyle")),
      videoRatio: String(data.get("videoRatio")),
    });
  }

  return (
    <div className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">NARRASTAGE / LIBRARY</p>
          <h1>{t("projects.title")}</h1>
          <p>{t("projects.description")}</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)} type="button">
          <Plus size={17} />
          {t("projects.create")}
        </button>
      </header>

      {projects.isPending ? (
        <div className="project-grid" aria-label={t("common.loading")}>
          {[0, 1, 2].map((item) => (
            <div className="project-skeleton" key={item} />
          ))}
        </div>
      ) : projects.isError ? (
        <section className="empty-state" role="alert">
          <strong>{t("common.error")}</strong>
          <p>{projects.error.message}</p>
          <button className="button secondary" onClick={() => projects.refetch()} type="button">
            {t("common.retry")}
          </button>
        </section>
      ) : projects.data.length === 0 ? (
        <section className="empty-state">
          <span className="empty-icon">
            <Clapperboard size={24} />
          </span>
          <h2>{t("projects.empty")}</h2>
          <button className="button secondary" onClick={() => setCreating(true)} type="button">
            {t("projects.emptyAction")}
          </button>
        </section>
      ) : (
        <section className="project-grid" aria-label={t("projects.title")}>
          {projects.data.map((project, index) => (
            <article className="project-card" key={project.id}>
              <button
                className="project-card-link"
                onClick={() => {
                  selectProject(project.id);
                  navigate(`/studio/${project.id}`);
                }}
                type="button"
                aria-label={`${t("projects.open")}: ${project.name}`}
              >
                <span className={`project-poster tone-${index % 3}`} aria-hidden="true">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </span>
                <span className="project-card-body">
                  <span className="project-meta">
                    {project.projectType ?? "animation"} · {project.videoRatio ?? "16:9"}
                  </span>
                  <strong>{project.name}</strong>
                  <small>{project.intro || "尚未填写故事简介"}</small>
                  <span className="project-open">
                    {t("projects.open")} <ArrowUpRight size={15} />
                  </span>
                </span>
              </button>
            </article>
          ))}
        </section>
      )}

      {creating ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setCreating(false)}>
          <section
            className="dialog-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">NEW PRODUCTION</p>
                <h2 id="create-project-title">{t("projects.create")}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setCreating(false)}
                type="button"
                aria-label={t("projects.cancel")}
              >
                <X size={18} />
              </button>
            </header>
            <form className="stack-form" onSubmit={submit}>
              <label>
                <span>{t("projects.name")}</span>
                <input name="name" required autoFocus />
              </label>
              <label>
                <span>{t("projects.intro")}</span>
                <textarea name="intro" rows={3} required />
              </label>
              <div className="form-grid">
                <label>
                  <span>{t("projects.style")}</span>
                  <input name="artStyle" defaultValue="cinematic animation" required />
                </label>
                <label>
                  <span>{t("projects.ratio")}</span>
                  <select name="videoRatio" defaultValue="16:9">
                    <option>16:9</option>
                    <option>9:16</option>
                    <option>1:1</option>
                  </select>
                </label>
              </div>
              {createProject.error ? (
                <p className="form-error" role="alert">
                  {createProject.error.message}
                </p>
              ) : null}
              <footer className="dialog-actions">
                <button className="button ghost" onClick={() => setCreating(false)} type="button">
                  {t("projects.cancel")}
                </button>
                <button className="button primary" disabled={createProject.isPending} type="submit">
                  {createProject.isPending ? t("projects.saving") : t("projects.save")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
