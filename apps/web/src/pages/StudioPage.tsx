import { FileText, Image, Video } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { ConversationPanel } from "@/features/conversation/ConversationPanel";
import { GenerationPanel } from "@/features/generation/GenerationPanel";
import { configuredProjectOffering } from "@/features/generation/contracts";
import { useI18n } from "@/i18n/useI18n";
import { useSession } from "@/state/session";
import { useWorkspace } from "@/state/workspace";

type StudioStage = "story" | "image" | "video";

export function StudioPage() {
  const parameters = useParams();
  const projectId = Number(parameters.projectId);
  const token = useSession((state) => state.session?.token ?? "");
  const selectProject = useWorkspace((state) => state.selectProject);
  const { t } = useI18n();
  const [stage, setStage] = useState<StudioStage>("story");
  useEffect(() => {
    if (Number.isInteger(projectId) && projectId > 0) selectProject(projectId);
  }, [projectId, selectProject]);
  const catalog = useQuery({
    queryKey: ["provider-catalog"],
    queryFn: () => api.catalog(token),
    enabled: Number.isInteger(projectId) && projectId > 0,
    staleTime: 60_000,
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects(token),
    enabled: Number.isInteger(projectId) && projectId > 0,
  });
  const project = projects.data?.find((candidate) => candidate.id === projectId);
  const stages: Array<{
    id: StudioStage;
    label: string;
    description: string;
    icon: typeof FileText;
  }> = [
    { id: "story", label: t("studio.story"), description: "统筹故事与镜头", icon: FileText },
    { id: "image", label: t("studio.image"), description: "建立视觉素材", icon: Image },
    { id: "video", label: t("studio.video"), description: "生成运动成片", icon: Video },
  ];

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return (
      <div className="page-frame studio-placeholder">
        <header className="page-header">
          <div>
            <p className="eyebrow">TOONFLOW / STUDIO</p>
            <h1>制作台</h1>
            <p>先从项目库选择一部作品。</p>
          </div>
        </header>
        <section className="empty-state">
          <strong>尚未选择项目</strong>
          <Link className="button primary" to="/projects">
            返回项目库
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="page-frame studio-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">PROJECT / {projectId}</p>
          <h1>制作台</h1>
          <p>沿着一条连续轨道完成故事统筹、画面生成和视频交付。</p>
        </div>
      </header>
      <nav className="production-stage-nav" aria-label="制作阶段">
        {stages.map((candidate, index) => (
          <button
            key={candidate.id}
            className={stage === candidate.id ? "active" : ""}
            onClick={() => setStage(candidate.id)}
            type="button"
          >
            <span className="stage-number">0{index + 1}</span>
            <candidate.icon size={18} />
            <span>
              <strong>{candidate.label}</strong>
              <small>{candidate.description}</small>
            </span>
          </button>
        ))}
      </nav>

      {stage === "story" ? <ConversationPanel projectId={projectId} token={token} /> : null}
      {stage !== "story" && (catalog.isPending || projects.isPending) ? (
        <div className="studio-loading" role="status">
          正在读取模型能力…
        </div>
      ) : null}
      {stage !== "story" && (catalog.isError || projects.isError) ? (
        <section className="empty-state" role="alert">
          <strong>模型目录读取失败</strong>
          <p>{catalog.error?.message ?? projects.error?.message}</p>
          <button
            className="button secondary"
            onClick={() => {
              void catalog.refetch();
              void projects.refetch();
            }}
            type="button"
          >
            重试
          </button>
        </section>
      ) : null}
      {stage === "image" && catalog.data && project ? (
        <GenerationPanel
          operation="image.generate"
          projectId={projectId}
          catalog={catalog.data}
          token={token}
          configuredOfferingId={configuredProjectOffering(project, "image.generate")}
          onOfferingChange={(offering) =>
            api.updateImageGenerationSelection(token, projectId, offering.id)
          }
        />
      ) : null}
      {stage === "video" && catalog.data && project ? (
        <GenerationPanel
          operation="video.generate"
          projectId={projectId}
          catalog={catalog.data}
          token={token}
          configuredOfferingId={configuredProjectOffering(project, "video.generate")}
          onOfferingChange={(offering) =>
            api.updateGenerationSelection(token, projectId, {
              catalogMode: "builtin",
              canonicalModelId: offering.canonicalModelId,
              offeringId: offering.id,
              providerId: offering.providerId,
              preferenceMode: "pinned",
            })
          }
        />
      ) : null}
    </div>
  );
}
