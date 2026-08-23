import { Clapperboard } from "lucide-react";
import { Link } from "react-router-dom";

export function ProjectRequired({ surface }: { surface: string }) {
  return (
    <div className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">TOONFLOW / {surface.toUpperCase()}</p>
          <h1>{surface}</h1>
          <p>先选择一个项目，再进入这条制作路径。</p>
        </div>
      </header>
      <section className="empty-state">
        <span className="empty-icon">
          <Clapperboard size={24} />
        </span>
        <strong>尚未选择项目</strong>
        <Link className="button primary" to="/projects">
          返回项目库
        </Link>
      </section>
    </div>
  );
}
