import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ rpc: vi.fn(), error: null as unknown, auth: { user: { id: "A" }, profile: { user_id: "A", organization_id: "AR", ativo: true }, roles: ["gestor"], loading: false, authzReady: true, authzEpoch: 0 } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => s.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: s.rpc, from: (table: string) => {
  if (table !== "alertas_agronomicos") throw new Error(`unexpected_table:${table}`);
  const c: Record<string, unknown> = {}; for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: s.error ? null : [row], error: s.error }).then(resolve); return c;
} } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import MonitoramentoAlertas from "@/pages/MonitoramentoAlertas";
const ALERT = "11111111-1111-4111-8111-111111111111";
const VISIT = "22222222-2222-4222-8222-222222222222";
const AT = "2026-10-27T10:00:00.123456+00:00";
const row = { id: ALERT, status: "monitoramento", registro_origem_id: VISIT, updated_at: AT, data_vencimento: "2099-11-01", descricao: "Alerta autorizado A", fazendas: { nome: "Fazenda A" }, talhoes: { nome: "Talhão A", fazendas: { clientes: { nome: "Cliente A" } } } };
let client: QueryClient;
beforeEach(() => { s.rpc.mockReset(); s.error = null; s.auth.authzEpoch = 0; s.auth.profile.organization_id = "AR";
  s.rpc.mockImplementation(async (name: string) => name === "rpc_get_visita_workspace" ? { data: { version: 3, permissions: { can_view: true }, registro: { id: VISIT } }, error: null } : { data: null, error: { code: "PT409", message: "version_conflict" } });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); });
function mount() { const tree = () => <QueryClientProvider client={client}><MemoryRouter><MonitoramentoAlertas /></MemoryRouter></QueryClientProvider>; return { view: render(tree()), tree }; }
async function open() { await screen.findAllByText("Alerta autorizado A"); fireEvent.click(screen.getByRole("button", { name: "Reprogramar monitoramento" })); }
it("página envia origem+versão 3 e timestamp observado pelo contrato v2, PT409 não repete", async () => {
  mount(); await open(); const input = await screen.findByLabelText("Nova data de reavaliação");
  fireEvent.change(input, { target: { value: "2099-11-20" } }); fireEvent.click(screen.getByRole("button", { name: "Confirmar Nova Data" }));
  await waitFor(() => expect(s.rpc.mock.calls.filter(c => c[0] === "rpc_reprogramar_monitoramento_v2")).toHaveLength(1));
  expect(s.rpc.mock.calls.find(c => c[0] === "rpc_reprogramar_monitoramento_v2")?.[1]).toMatchObject({ p_alerta_id: ALERT, p_nova_data: "2099-11-20", p_expected_alert_updated_at: AT, p_expected_visit_version: 3 });
  expect(s.rpc.mock.calls.some(c => c[0] === "rpc_reprogramar_monitoramento_v1")).toBe(false);
});
it.each(["42501", "PGRST202"])("workspace %s impede abrir confirmação e despachar reprogramação", async code => {
  s.rpc.mockResolvedValue({ data: null, error: { code, message: code } }); mount(); await open();
  await waitFor(() => expect(s.rpc).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("button", { name: "Confirmar Nova Data" })).toBeNull();
});
it("workspace tardio após mudança de tenant não abre diálogo anterior", async () => {
  let finish: ((v: unknown) => void) | undefined; s.rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { view, tree } = mount(); await open(); await waitFor(() => expect(finish).toBeDefined());
  s.auth.profile.organization_id = "FSF"; view.rerender(tree());
  await act(async () => { finish?.({ data: { version: 3, permissions: { can_view: true } }, error: null }); });
  expect(screen.queryByRole("button", { name: "Confirmar Nova Data" })).toBeNull();
  expect(s.rpc).toHaveBeenCalledTimes(1);
});
it("erro na lista não é vazio e não inicia RPC de mutação", async () => {
  s.error = { code: "42501", message: "denied" }; mount();
  await screen.findByRole("button", { name: "Tentar novamente" });
  expect(screen.queryByText("Alerta autorizado A")).toBeNull(); expect(s.rpc).not.toHaveBeenCalled();
});