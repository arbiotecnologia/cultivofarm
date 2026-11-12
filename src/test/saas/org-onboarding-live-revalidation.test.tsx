import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), functions: { invoke: vi.fn() } } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: "administrador", user: { id: "u1" }, profile: { organization_id: "org-A" }, signOut: vi.fn() }) }));
vi.mock("@/hooks/useSystemConfig", () => ({ useSystemConfig: () => ({ config: null, defaults: { nome_empresa: "X" } }) }));
vi.mock("@/components/AppSidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/components/portal/PortalTopBar", () => ({ PortalTopBar: () => null }));

import { AppLayout } from "@/components/AppLayout";
import { ONBOARDING_POLL_MS, ONBOARDING_RETURN_REVALIDATE_MS, onboardingStateBloqueia } from "@/hooks/useOrgOnboarding";

const ATIVA = { data: { required: false, organization_id: "org-A", status: "ativa" }, error: null };
const REVISAO = { data: { required: true, blocked: true, is_admin: true, organization_id: "org-A", status: "aguardando_revisao", review_pending: true, review: { origem: "plataforma", motivo_codigo: "remessa_manual_plataforma", submetido_em: "2026-11-12T10:00:00Z" } }, error: null };
const ONBOARDING = { data: { required: true, is_admin: true, organization_id: "org-A", status: "onboarding", dados: {} }, error: null };

let qc: QueryClient;
function montar() {
  qc = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, refetchOnWindowFocus: false, refetchOnMount: false } } });
  qc.setQueryData(["fiscal-company-settings", "org-A"], { stale: true });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/configuracoes/fiscal/empresa"]}>
        <Routes><Route element={<AppLayout />}><Route path="/configuracoes/fiscal/empresa" element={<p>CENTRAL FISCAL</p>} /></Route></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe("estado do cadastro em aba já aberta", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); rpc.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it("ativa → revisão → aprovada sem navegação, pelo fallback periódico", async () => {
    rpc.mockResolvedValue(ATIVA);
    montar(); await flush();
    expect(screen.getByText("CENTRAL FISCAL")).toBeTruthy();

    rpc.mockResolvedValue(REVISAO);
    await flush(ONBOARDING_POLL_MS + 10);
    expect(screen.getByText("Cadastro em revisão")).toBeTruthy();
    expect(screen.queryByText("CENTRAL FISCAL")).toBeNull();
    expect(qc.getQueryData(["fiscal-company-settings", "org-A"])).toBeUndefined();

    rpc.mockResolvedValue(ATIVA);
    await flush(ONBOARDING_POLL_MS + 10);
    expect(screen.getByText("CENTRAL FISCAL")).toBeTruthy();
    expect(screen.queryByText("Cadastro em revisão")).toBeNull();
  });

  it("formulário manual aberto (etapa) vira 'Cadastro em revisão' sem recarregar", async () => {
    rpc.mockImplementation((n: string) => Promise.resolve(n === "org_onboarding_state" ? ONBOARDING : { data: null, error: null }));
    montar(); await flush();
    expect(screen.queryByText("Cadastro em revisão")).toBeNull();
    rpc.mockResolvedValue(REVISAO);
    await flush(ONBOARDING_POLL_MS + 10);
    expect(screen.getByText("Cadastro em revisão")).toBeTruthy();
    expect(screen.queryByText(/Etapa \d de/)).toBeNull();
  });

  it("ao voltar após ausência longa não mostra conteúdo antigo enquanto revalida", async () => {
    rpc.mockResolvedValue(ATIVA);
    montar(); await flush();
    const vis = vi.spyOn(document, "visibilityState", "get");
    vis.mockReturnValue("hidden"); await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await flush(ONBOARDING_RETURN_REVALIDATE_MS + 1000);
    let resolver: (v: unknown) => void = () => {};
    rpc.mockReturnValue(new Promise((r) => { resolver = r; }));
    vis.mockReturnValue("visible"); await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.getByText(/Verificando a situação do cadastro/)).toBeTruthy();
    expect(screen.queryByText("CENTRAL FISCAL")).toBeNull();
    await act(async () => { resolver(REVISAO); }); await flush();
    expect(screen.getByText("Cadastro em revisão")).toBeTruthy();
    vis.mockRestore();
  });

  it("descarta resposta de outra organização e mantém o último estado válido", async () => {
    rpc.mockResolvedValue(REVISAO);
    montar(); await flush();
    rpc.mockResolvedValue({ data: { required: false, organization_id: "org-B", status: "ativa" }, error: null });
    await flush(ONBOARDING_POLL_MS + 10);
    expect(screen.getByText("Cadastro em revisão")).toBeTruthy();
  });

  it("revisão bloqueia mesmo se `required` vier falso", () => {
    expect(onboardingStateBloqueia({ required: false, status: "aguardando_revisao" })).toBe(true);
    expect(onboardingStateBloqueia({ required: false, review_pending: true })).toBe(true);
    expect(onboardingStateBloqueia({ required: false, status: "ativa" })).toBe(false);
  });
});
