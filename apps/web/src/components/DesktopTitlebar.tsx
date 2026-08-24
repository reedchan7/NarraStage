import { Minus, Square, X } from "lucide-react";

export function DesktopTitlebar() {
  const bridge = window.narrastageWindow;
  if (!bridge) return null;

  return (
    <header className="desktop-titlebar" aria-label="桌面窗口控制栏">
      <span>NarraStage</span>
      <div className="window-controls">
        <button type="button" aria-label="最小化窗口" onClick={() => bridge.minimize()}>
          <Minus size={14} />
        </button>
        <button type="button" aria-label="最大化或还原窗口" onClick={() => bridge.toggleMaximize()}>
          <Square size={12} />
        </button>
        <button
          className="close"
          type="button"
          aria-label="关闭窗口"
          onClick={() => bridge.close()}
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
