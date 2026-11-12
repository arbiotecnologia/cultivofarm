import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), functions: { invoke: vi.fn() } } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, profile: { organization_id: "org-A" }, primaryRole: "administrador", roles: ["administrador"], loading: false, authzReady: true, signOut: vi.fn() }) }));
vi.mock("@/hooks/useAvailableContexts", () => ({ useAvailableContexts: () => ({ data: { available_contexts: ["technical"] }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }) }));
vi.mock("@/hooks/useOfflineSync", () => ({ useOfflineSync: () => ({ isOnline: true, pendingCount: 0, syncing: false, syncAll: vi.fn(), progress: null }) }));
vi.mock("@/hooks/useEntitlements", () => ({ useEntitlements: () => ({ ready: true, has: () => true }) }));
vi.mock("@/lib/saas/featureRouteMap", () => ({ isPathEntitled: () => true }));
vi.mock("@/hooks/useSystemConfig", () => ({ useSystemConfig: () => ({ config: null, defaults: { nome_empresa: "X" } }) }));
vi.mock("@/components/portal/PortalTopBar", () => ({ PortalTopBar: () => null }));
vi.mock("@/components/app/OfflineIndicator", () => ({ OfflineIndicator: () => null }));
vi.mock("@/components/app/PendingMediaRecovery", () => ({ PendingMediaRecovery: () => null }));

import MobileLayout from "@/pages/app/MobileLayout";
import { ONBOARDING_POLL_MS } from "@/hooks/useOrgOnboarding";

const ATIVA = { data: { required: false, organization_id: "org-A", status: "ativa" }, error: null };
const REVISAO = { data: { required: true, is_admin: true, organization_id: "org-A", status: "aguardando_revisao", review_pending: true }, error: null };
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

function montar(path: string) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route element={<MobileLayout />}><Route path="/app/*" element={<p>CONTEUDO APP</p>} /></Route></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("acesso direto pelo celular (/app) com cadastro em revisão", () => {
  beforeEach(() => { vi.useFakeTimers(); rpc.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it("acesso direto mostra 'Cadastro em revisão' e nunca o conteúdo", async () => {
    rpc.mockResolvedValue(REVISAO);
    montar("/app/catalogo"); await flush();
    expect(screen.getByText("Cadastro em revisão")).toBeTruthy();
    expect(screen.queryByText("CONTEUDO APP")).toBeNull();
  });

  it("aba aberta no celular: ativa → revisão → aprovada sem navegação", async () => {
    rpc.mockResolvedValue(ATIVA);
    montar("/app"); await flush();
    expect(screen.getByText("CONTEUDO APP")).toBeTruthy();
    rpc.mockResolvedValue(REVISAO); await flush(ONBOARDING_POLL_MS + 10);
    expect(screen.getByText("Cadastro em revisão")).toBeTruthy();
    rpc.mockResolvedValue(ATIVA); await flush(ONBOARDING_POLL_MS + 10);
    expect(screen.getByText("CONTEUDO APP")).toBeTruthy();
  });
});
