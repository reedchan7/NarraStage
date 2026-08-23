import { ArrowRight, FileText, Image, Video } from "lucide-react";
import { useParams } from "react-router-dom";
import { useI18n } from "@/i18n/useI18n";

export function StudioPage() {
  const { projectId } = useParams();
  const { t } = useI18n();
  const stages = [
    { label: t("studio.story"), description: "梳理人物与事件，形成可拍摄的剧本", icon: FileText },
    { label: t("studio.image"), description: "锁定角色、场景与每个镜头的构图", icon: Image },
    { label: t("studio.video"), description: "生成运动素材，在时间线上组织成片", icon: Video },
  ];
  return (
    <div className="page-frame studio-placeholder">
      <header className="page-header">
        <div>
          <p className="eyebrow">PROJECT / {projectId ?? "SELECT"}</p>
          <h1>制作台</h1>
          <p>{t("studio.soon")}</p>
        </div>
      </header>
      <ol className="studio-track">
        {stages.map((stage, index) => (
          <li key={stage.label}>
            <span className="stage-index">0{index + 1}</span>
            <stage.icon size={22} />
            <strong>{stage.label}</strong>
            <p>{stage.description}</p>
            {index < stages.length - 1 ? (
              <ArrowRight className="stage-arrow" size={18} aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
