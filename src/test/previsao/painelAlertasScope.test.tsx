import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PainelAlertas } from "@/components/previsao/PainelAlertas";
const s = vi.hoisted(() => ({ actor: "A", ready: true, rows: {} as Record<string, unknown[]>, calls: 0 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: () => {
  const who = s.actor; s.calls++;
  const chain: any = { select: () => chain, order: () => chain, eq: () => chain, abortSignal: () => chain,
    then: (res: any, rej: any) => Promise.resolve({ data: s.rows[who], error: null }).then(res, rej) };
  return chain;
} } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: s.actor }, profile: { user_id: s.actor, organization_id: s.actor, ativo: true, senha_provisoria: false }, roles: ["gestor"], loading: false, authzReady: s.ready, authzEpoch: 0, checkAuthzAccess: () => s.ready }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const alerta = (nome: string) => ({ id: `${nome}-id`, fazendas: { nome }, talhoes: null, tipo_alerta: "praga", nivel_risco: "alto", data_alerta: "2026-10-27", status: "ativo", updated_at: "2026-10-27T00:00:00Z" });
beforeEach(() => { s.actor = "A"; s.ready = true; s.calls = 0; s.rows = { A: [alerta("Fazenda A")], B: [] }; });
describe("PainelAlertas — cache escopado por ator", () => {
  it("troca A→B não exibe alertas de A", async () => {
    const qc = new QueryClient();
    const ui = () => <QueryClientProvider client={qc}><PainelAlertas /></QueryClientProvider>;
    const r = render(ui());
    expect(await screen.findByText("Fazenda A")).toBeTruthy();
    s.actor = "B"; r.rerender(ui());
    expect(screen.queryByText("Fazenda A")).toBeNull();
    await waitFor(() => expect(screen.getByText("Nenhum alerta encontrado.")).toBeTruthy());
    expect(qc.getQueryCache().getAll().some((q) => JSON.stringify(q.state.data ?? null).includes("Fazenda A"))).toBe(false);
  });
  it("revogado não consulta nem mostra dados", async () => {
    s.ready = false;
    render(<QueryClientProvider client={new QueryClient()}><PainelAlertas /></QueryClientProvider>);
    await new Promise((r) => setTimeout(r, 20));
    expect(s.calls).toBe(0); expect(screen.queryByText("Fazenda A")).toBeNull();
  });
});
