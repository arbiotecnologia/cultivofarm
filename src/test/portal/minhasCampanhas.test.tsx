import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const rpc = vi.fn(); const from = vi.fn();
const chain = (): any => new Proxy({}, { get: (_t, k) => k === "then" ? (r: (v: unknown) => void) => r({ data: [], count: 0, error: null }) : () => chain() });
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (...a: unknown[]) => ({ abortSignal: () => rpc(...a) }),
  from: (...a: unknown[]) => { from(...a); return chain(); } } }));
let auth: { role: string | null; roles: string[]; profile?: unknown } = { role: "cliente_produtor", roles: ["cliente_produtor"] };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ ...auth, user: { id: "u1" }, profile: { nome: "P" } }) }));
// Isolamento de cache por identidade é coberto em scopedPortalQuery.*; aqui só o contrato da seção.
vi.mock("@/hooks/useScopedPortalQuery", () => ({ useScopedPortalQuery: (o: any) => useQuery({ ...o, retry: false, queryFn: ({ signal }) => o.queryFn(signal) }) }));
vi.mock("@/hooks/usePortalCliente", () => ({ usePortalCliente: () => ({ clienteId: "c1", clienteNome: "Fazenda", loading: false }) }));
vi.mock("@/hooks/useActiveTenantName", () => ({ useActiveTenantName: () => ({ label: "Empresa" }) }));
vi.mock("@/hooks/useSystemConfig", () => ({ useSystemConfig: () => ({ config: null, defaults: { nome_empresa: "X" } }) }));
vi.mock("@/components/LogoDisplay", () => ({ LogoDisplay: () => null }));

import { MinhasCampanhas, canQueryMyCampaigns, parseMyCampaigns, MY_CAMPAIGNS_RPC } from "@/components/portal/MinhasCampanhas";
import PortalDashboard from "@/pages/portal/PortalDashboard";
import MobileDashboardProdutor from "@/pages/app/MobileDashboardProdutor";

const ID = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;
const item = (n: number) => ({ id: ID(n), nome: `Campanha ${n}`, descricao: n === 1 ? "Desconto safra" : null, data_inicio: "2026-11-01", data_fim: "2026-11-30" });
const page = (items: unknown[], total = items.length, offset = 0) => ({ data: { total, offset, limit: 5, items }, error: null });
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
beforeEach(() => { rpc.mockReset(); from.mockReset(); auth = { role: "cliente_produtor", roles: ["cliente_produtor"] }; });

describe("Minhas campanhas — quem consulta", () => {
  it("só produtor sem papel interno", () => {
    expect(canQueryMyCampaigns("cliente_produtor", ["cliente_produtor"])).toBe(true);
    expect(canQueryMyCampaigns("cliente_produtor", ["cliente_produtor", "parceiro_b2b"])).toBe(true);
    for (const r of ["administrador", "gestor", "gestor_comercial", "consultor_tecnico", "tecnico_agronomo", "superadmin"])
      expect(canQueryMyCampaigns("cliente_produtor", ["cliente_produtor", r])).toBe(false);
    expect(canQueryMyCampaigns("administrador", ["administrador"])).toBe(false);
    expect(canQueryMyCampaigns("consultor_tecnico", ["consultor_tecnico"])).toBe(false);
  });
  it("sessão de admin/gestor/consultor não chama a RPC nem mostra a seção", () => {
    for (const roles of [["administrador"], ["gestor"], ["consultor_tecnico"], ["cliente_produtor", "gestor_comercial"]]) {
      auth = { role: roles[0], roles }; const { unmount } = wrap(<MinhasCampanhas />);
      expect(screen.queryByLabelText("Minhas campanhas")).toBeNull(); unmount();
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("Minhas campanhas — estados", () => {
  it("carregando → lista com nome, descrição e vigência, sem ações de edição", async () => {
    let res!: (v: unknown) => void; rpc.mockReturnValue(new Promise((r) => (res = r)));
    wrap(<MinhasCampanhas />);
    expect(screen.getByRole("status").textContent).toMatch(/Carregando/);
    res(page([item(1)]));
    await screen.findByText("Campanha 1");
    expect(screen.getByText("Desconto safra")).toBeTruthy();
    expect(screen.getByText("Vigência: 01/11/2026 a 30/11/2026")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(rpc).toHaveBeenCalledWith(MY_CAMPAIGNS_RPC, { p_offset: 0, p_limit: 5 });
  });
  it("vazio", async () => { rpc.mockResolvedValue(page([])); wrap(<MinhasCampanhas />); await screen.findByText(/Nenhuma campanha vigente/); });
  it("erro do servidor é neutro", async () => { rpc.mockResolvedValue({ data: null, error: { message: "permission denied for table x" } }); wrap(<MinhasCampanhas />); expect((await screen.findByRole("alert")).textContent).not.toMatch(/permission|table/); });
  it("resposta com campos administrativos/destinatários é rejeitada (erro, nada exibido)", async () => {
    rpc.mockResolvedValue({ data: { total: 1, offset: 0, limit: 5, items: [{ ...item(1), clientes: ["x"], created_by: ID(9) }] }, error: null });
    wrap(<MinhasCampanhas />); await screen.findByRole("alert"); expect(screen.queryByText("Campanha 1")).toBeNull();
    expect(() => parseMyCampaigns({ total: 1, offset: 0, limit: 5, items: [{ ...item(1), ativa: true }] })).toThrow();
  });
  it("paginação pede a próxima página ao servidor", async () => {
    rpc.mockResolvedValueOnce(page([1, 2, 3, 4, 5].map(item), 7)).mockResolvedValueOnce(page([6, 7].map(item), 7, 5));
    wrap(<MinhasCampanhas />); await screen.findByText("Campanha 5");
    fireEvent.click(screen.getByRole("button", { name: "Próximas" }));
    await screen.findByText("Campanha 7");
    expect(rpc).toHaveBeenLastCalledWith(MY_CAMPAIGNS_RPC, { p_offset: 5, p_limit: 5 });
    expect(screen.getByText("6–7 de 7")).toBeTruthy();
  });
});

describe("Minhas campanhas — entradas do produtor", () => {
  it("portal desktop mostra a seção", async () => { rpc.mockResolvedValue(page([item(1)])); wrap(<PortalDashboard />); await screen.findByText("Campanha 1"); });
  it("entrada móvel (/app) mostra a seção", async () => { rpc.mockResolvedValue(page([item(2)])); wrap(<MobileDashboardProdutor />); await screen.findByText("Campanha 2"); });
  it("nenhuma tela do produtor lê commercial_campaigns diretamente", async () => {
    rpc.mockResolvedValue(page([])); wrap(<><PortalDashboard /><MobileDashboardProdutor /></>);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(from.mock.calls.map((c) => c[0])).not.toContain("commercial_campaigns");
    expect(from.mock.calls.map((c) => c[0])).not.toContain("commercial_campaign_clientes");
  });
});
