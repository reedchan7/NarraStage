import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { DesktopTitlebar } from "@/components/DesktopTitlebar";
import { AppearanceSync } from "@/state/appearance";
import { LoginPage } from "@/pages/LoginPage";
import { AssetsPage } from "@/pages/AssetsPage";
import { JobsPage } from "@/pages/JobsPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { ProvidersPage } from "@/pages/ProvidersPage";
import { ScriptsPage } from "@/pages/ScriptsPage";
import { StudioPage } from "@/pages/StudioPage";
import { useSession } from "@/state/session";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

function AuthenticatedLayout() {
  const session = useSession((state) => state.session);
  if (!session) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function LoginRoute() {
  const session = useSession((state) => state.session);
  return session ? <Navigate to="/projects" replace /> : <LoginPage />;
}

export function App() {
  const isDesktop = Boolean(window.narrastageWindow);
  return (
    <QueryClientProvider client={queryClient}>
      <AppearanceSync />
      <DesktopTitlebar />
      <div className={isDesktop ? "app-frame desktop-content" : "app-frame"}>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route element={<AuthenticatedLayout />}>
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/studio" element={<StudioPage />} />
              <Route path="/studio/:projectId" element={<StudioPage />} />
              <Route path="/scripts" element={<ScriptsPage />} />
              <Route path="/scripts/:projectId" element={<ScriptsPage />} />
              <Route path="/assets" element={<AssetsPage />} />
              <Route path="/assets/:projectId" element={<AssetsPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/providers" element={<ProvidersPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </HashRouter>
      </div>
    </QueryClientProvider>
  );
}
