import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WorkspaceState {
  projectId: number | null;
  selectProject: (projectId: number) => void;
  clearProject: () => void;
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      projectId: null,
      selectProject: (projectId) => set({ projectId }),
      clearProject: () => set({ projectId: null }),
    }),
    {
      name: "narrastage.workspace.v1",
      version: 1,
      partialize: (state) => ({ projectId: state.projectId }),
    },
  ),
);
