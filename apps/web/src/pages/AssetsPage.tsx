import { Image as ImageIcon, Layers3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/api/client";
import { ProjectRequired } from "@/components/ProjectRequired";
import { useSession } from "@/state/session";
import { useWorkspace } from "@/state/workspace";

const assetTypes = ["all", "role", "scene", "tool"] as const;

export function AssetsPage() {
  const routeProjectId = Number(useParams().projectId);
  const selectedProjectId = useWorkspace((state) => state.projectId);
  const selectProject = useWorkspace((state) => state.selectProject);
  const projectId =
    Number.isInteger(routeProjectId) && routeProjectId > 0 ? routeProjectId : selectedProjectId;
  const token = useSession((state) => state.session?.token ?? "");
  const [filter, setFilter] = useState<(typeof assetTypes)[number]>("all");
  useEffect(() => {
    if (projectId) selectProject(projectId);
  }, [projectId, selectProject]);
  const assets = useQuery({
    queryKey: ["project-assets", projectId],
    queryFn: () => api.projectAssets(token, projectId!),
    enabled: Boolean(projectId),
  });
  if (!projectId) return <ProjectRequired surface="Assets" />;
  const visible = (assets.data ?? []).filter((asset) => filter === "all" || asset.type === filter);

  return (
    <div className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">PROJECT / {projectId} / ASSETS</p>
          <h1>素材库</h1>
          <p>查看角色、场景与道具及其历史画面。</p>
        </div>
      </header>
      <nav className="filter-tabs" aria-label="素材类型">
        {assetTypes.map((type) => (
          <button
            className={filter === type ? "active" : ""}
            key={type}
            onClick={() => setFilter(type)}
            type="button"
          >
            {type === "all" ? "全部" : type}
          </button>
        ))}
      </nav>
      {assets.isPending ? (
        <div className="studio-loading" role="status">
          正在读取素材…
        </div>
      ) : assets.isError ? (
        <section className="empty-state" role="alert">
          <strong>素材读取失败</strong>
          <p>{assets.error.message}</p>
        </section>
      ) : visible.length === 0 ? (
        <section className="empty-state">
          <Layers3 size={24} />
          <strong>当前分类还没有素材</strong>
          <p>在剧本库整理正文，或在制作台生成新的视觉结果。</p>
        </section>
      ) : (
        <section className="asset-grid" aria-label="项目素材">
          {visible.map((asset) => (
            <article className="asset-card" key={asset.id}>
              <div className="asset-preview">
                {asset.filePath ? (
                  <img src={asset.filePath} alt={asset.name} />
                ) : (
                  <ImageIcon size={28} />
                )}
              </div>
              <div>
                <span>{asset.type}</span>
                <h2>{asset.name}</h2>
                <p>{asset.describe || "暂无描述"}</p>
                <small>{asset.state || `${asset.historyImages?.length ?? 0} 个历史版本`}</small>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
