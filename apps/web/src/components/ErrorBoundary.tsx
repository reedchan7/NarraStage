import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    globalThis.reportError?.(new Error(error.message, { cause: info.componentStack }));
  }

  override render() {
    if (this.state.error) {
      return (
        <main className="fatal-state">
          <p className="eyebrow">TOONFLOW / RECOVERY</p>
          <h1>界面遇到了问题</h1>
          <p>{this.state.error.message}</p>
          <button className="button primary" onClick={() => window.location.reload()} type="button">
            重新加载
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
