import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCommercialKpis } from "@/hooks/useCommercial";

const s = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), ready: true, actor: "u-A", org: "org-A", roles: ["gestor_comercial"], loading: false, epoch: 0 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: s.rpc, from: s.from } }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: s.actor ? { id: s.actor } : null,
    profile: s.actor ? { user_id: s.actor, organization_id: s.org, ativo: true, senha_provisoria: false } : null,
    roles: s.roles, loading: s.loading, authzReady: s.ready, authzEpoch: s.epoch, checkAuthzAccess: () => s.ready,
  }),
}));
vi.mock("@/hooks/useActiveTenantName", () => ({ useActiveTenantName: () => ({ name: null, label: "empresa responsável" }) }));
import IndicadoresComerciais from "@/pages/comercial/IndicadoresComerciais";

const kpis = (total: number, prevista: number) => ({
  pedidos_total: total, pedidos_aprovados: 0, pedidos_em_negociacao: 0, pedidos_aguardando_ajuste: 0,
  receita_prevista: prevista, receita_aprovada: 0, parceiros_ativos: 1, parceiros_novos: 0,
});
type Pending = { resolve: (v: unknown) => void; args: Record<string, unknown>; signal?: AbortSignal };
let pending: Pending[] = [];
function transport() {
  s.rpc.mockImplementation((_fn: string, args: Record<string, unknown>) => {
    const p: Pending = { resolve: () => {}, args };
    const promise = new Promise((r) => { p.resolve = r; });
    pending.push(p);
    return { abortSignal: (signal: AbortSignal) => { p.signal = signal; return promise; } };
  });
}
function mount() {
  const qc = new QueryClient();
  const ui = () => <QueryClientProvider client={qc}><IndicadoresComerciais /></QueryClientProvider>;
  const r = render(ui());
  return { ...r, rerender: () => r.rerender(ui()), qc };
}
beforeEach(() => {
  s.rpc.mockReset(); s.from.mockReset(); pending = [];
  Object.assign(s, { ready: true, actor: "u-A", org: "org-A", roles: ["gestor_comercial"], loading: false, epoch: 0 });
  transport();
});

describe("Indicadores comerciais — escopo de cache e sem zero falso", () => {
  it("chama só a RPC canônica com sinal de abort e mostra valores confirmados", async () => {
    mount();
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(s.rpc).toHaveBeenCalledWith("rpc_commercial_kpis", expect.objectContaining({ p_partner_id: null }));
    expect(pending[0].signal).toBeInstanceOf(AbortSignal);
    await act(async () => { pending[0].resolve({ data: kpis(7, 1454.2), error: null }); });
    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(s.from).not.toHaveBeenCalled();
  });

  it("erro do servidor mostra indisponível, não zeros", async () => {
    mount();
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => { pending[0].resolve({ data: null, error: { code: "P0001", message: "forbidden" } }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar");
    expect(screen.queryByText("Pedidos no período")).toBeNull();
    expect(s.rpc).toHaveBeenCalledTimes(1); // sem retry automático
  });

  it("resposta malformada (null/chave extra/negativo) é erro, não zero", async () => {
    for (const bad of [null, [], {}, { ...kpis(1, 1), extra: 1 }, { ...kpis(1, 1), receita_prevista: -1 }, { ...kpis(1, 1), pedidos_total: "x" }])
      expect(() => parseCommercialKpis(bad)).toThrow();
    expect(parseCommercialKpis({ ...kpis(2, 3), receita_prevista: "1454.20" }).receita_prevista).toBe(1454.2);
  });

  it("sem acesso pronto (revogação/logout) não consulta e não mostra valores", async () => {
    s.ready = false; mount();
    expect(screen.getByRole("status")).toHaveTextContent("Verificando");
    await act(async () => { await Promise.resolve(); });
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it("troca de tenant em voo: resposta atrasada de A nunca aparece em B; B consulta de novo", async () => {
    const h = mount();
    await waitFor(() => expect(pending).toHaveLength(1));
    s.actor = "u-B"; s.org = "org-B"; h.rerender();
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => { pending[0].resolve({ data: kpis(7, 1454.2), error: null }); });
    expect(screen.queryByText("7")).toBeNull();
    await act(async () => { pending[1].resolve({ data: kpis(3, 10), error: null }); });
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.queryByText("7")).toBeNull();
  });

  it("dados de A são descartados ao trocar para B (cache não reaproveitado) e revogação esconde dados", async () => {
    const h = mount();
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => { pending[0].resolve({ data: kpis(7, 1454.2), error: null }); });
    expect(await screen.findByText("7")).toBeInTheDocument();
    s.ready = false; h.rerender();
    expect(screen.queryByText("7")).toBeNull();
    s.ready = true; s.actor = "u-B"; s.org = "org-B"; h.rerender();
    expect(screen.queryByText("7")).toBeNull();
    await waitFor(() => expect(pending.length).toBeGreaterThanOrEqual(2));
    const keys = h.qc.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey));
    expect(keys.some((k) => k.includes("u-A"))).toBe(false);
  });

  it("mudança de época de autorização (mesma identidade) invalida a resposta em voo", async () => {
    const h = mount();
    await waitFor(() => expect(pending).toHaveLength(1));
    s.epoch = 1; h.rerender();
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => { pending[0].resolve({ data: kpis(7, 1), error: null }); });
    expect(screen.queryByText("7")).toBeNull();
  });
});
