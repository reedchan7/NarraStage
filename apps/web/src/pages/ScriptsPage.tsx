import { FileText, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, type ScriptInput, type ScriptRecord } from "@/api/client";
import { ProjectRequired } from "@/components/ProjectRequired";
import { useSession } from "@/state/session";
import { useWorkspace } from "@/state/workspace";

export function ScriptsPage() {
  const routeProjectId = Number(useParams().projectId);
  const selectedProjectId = useWorkspace((state) => state.projectId);
  const selectProject = useWorkspace((state) => state.selectProject);
  const projectId =
    Number.isInteger(routeProjectId) && routeProjectId > 0 ? routeProjectId : selectedProjectId;
  const token = useSession((state) => state.session?.token ?? "");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ScriptRecord | "new" | null>(null);

  useEffect(() => {
    if (projectId) selectProject(projectId);
  }, [projectId, selectProject]);

  const scripts = useQuery({
    queryKey: ["scripts", projectId, search],
    queryFn: () => api.scripts(token, projectId!, search),
    enabled: Boolean(projectId),
  });
  const save = useMutation({
    mutationFn: (input: ScriptInput) =>
      editing === "new"
        ? api.createScript(token, projectId!, input)
        : api.updateScript(token, editing!.id, input),
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["scripts", projectId] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteScripts(token, [id]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scripts", projectId] }),
  });

  if (!projectId) return <ProjectRequired surface="Scripts" />;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    save.mutate({
      name: String(data.get("name")),
      content: String(data.get("content")),
      assets: [],
    });
  }

  return (
    <div className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">PROJECT / {projectId} / SCRIPTS</p>
          <h1>剧本库</h1>
          <p>整理可进入分镜和生产环节的剧本正文。</p>
        </div>
        <button className="button primary" onClick={() => setEditing("new")} type="button">
          <Plus size={16} />
          新建剧本
        </button>
      </header>
      <label className="search-control">
        <Search size={15} />
        <span className="sr-only">搜索剧本</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="搜索剧本"
        />
      </label>
      {scripts.isPending ? (
        <div className="studio-loading" role="status">
          正在读取剧本…
        </div>
      ) : scripts.isError ? (
        <section className="empty-state" role="alert">
          <strong>剧本读取失败</strong>
          <p>{scripts.error.message}</p>
        </section>
      ) : scripts.data.length === 0 ? (
        <section className="empty-state">
          <FileText size={24} />
          <strong>还没有剧本</strong>
          <p>可以直接创建，也可以先在制作台与剧本统筹对话。</p>
        </section>
      ) : (
        <section className="record-grid" aria-label="剧本列表">
          {scripts.data.map((script) => (
            <article className="record-card" key={script.id}>
              <header>
                <span>#{script.id}</span>
                <small>{script.extractState === 1 ? "素材已提取" : "草稿"}</small>
              </header>
              <h2>{script.name}</h2>
              <p>{script.content}</p>
              {script.relatedAssets.length > 0 ? (
                <small>{script.relatedAssets.map((asset) => asset.name).join(" · ")}</small>
              ) : null}
              <footer>
                <button
                  className="button compact secondary"
                  onClick={() => setEditing(script)}
                  type="button"
                >
                  <Pencil size={14} />
                  编辑
                </button>
                <button
                  className="icon-button danger"
                  aria-label={`删除 ${script.name}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`确认删除剧本“${script.name}”？`)) remove.mutate(script.id);
                  }}
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              </footer>
            </article>
          ))}
        </section>
      )}
      {editing ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setEditing(null)}>
          <section
            className="dialog-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="script-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">SCRIPT</p>
                <h2 id="script-dialog-title">{editing === "new" ? "新建剧本" : "编辑剧本"}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setEditing(null)}
                aria-label="关闭"
                type="button"
              >
                <X size={18} />
              </button>
            </header>
            <form className="stack-form" onSubmit={submit}>
              <label>
                <span>名称</span>
                <input
                  name="name"
                  defaultValue={editing === "new" ? "" : editing.name}
                  required
                  autoFocus
                />
              </label>
              <label>
                <span>正文</span>
                <textarea
                  name="content"
                  defaultValue={editing === "new" ? "" : editing.content}
                  rows={12}
                  required
                />
              </label>
              {save.error ? (
                <p className="form-error" role="alert">
                  {save.error.message}
                </p>
              ) : null}
              <footer className="dialog-actions">
                <button className="button ghost" onClick={() => setEditing(null)} type="button">
                  取消
                </button>
                <button className="button primary" disabled={save.isPending} type="submit">
                  {save.isPending ? "保存中…" : "保存剧本"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
