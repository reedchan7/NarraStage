import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session } from "@/api/client";
import { useWorkspace } from "@/state/workspace";

interface SessionState {
  session: Session | null;
  setSession: (session: Session) => void;
  signOut: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      signOut: () => {
        useWorkspace.getState().clearProject();
        set({ session: null });
      },
    }),
    {
      name: "narrastage.session.v2",
      version: 2,
      partialize: (state) => ({ session: state.session }),
    },
  ),
);
