import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session } from "@/api/client";

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
      signOut: () => set({ session: null }),
    }),
    {
      name: "toonflow.session.v2",
      version: 2,
      partialize: (state) => ({ session: state.session }),
    },
  ),
);
