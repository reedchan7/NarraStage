import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "@/styles.css";

const legacyStorageKeys = [
  ["toonflow.preferences.v2", "narrastage.preferences.v2"],
  ["toonflow.session.v2", "narrastage.session.v2"],
  ["toonflow.workspace.v1", "narrastage.workspace.v1"],
] as const;

for (const [legacyKey, currentKey] of legacyStorageKeys) {
  if (localStorage.getItem(currentKey) === null) {
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue !== null) localStorage.setItem(currentKey, legacyValue);
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("NarraStage renderer root is missing");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
