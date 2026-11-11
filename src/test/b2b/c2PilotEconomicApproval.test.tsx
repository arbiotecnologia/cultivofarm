import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Transporte stub local: nenhuma chamada hospedada. Hook e componente reais.
const s = vi.hoisted(() => ({ rpc: vi.fn(), table: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: "fin" }, profile: { user_id: "fin", organization_id: "arbio", ativo: true, senha_provisoria: false },
  roles: ["financeiro"], role: "financeiro", loading: false, authzReady: true, authzEpoch: 0, checkAuthzAccess: () => true,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (...a: unknown[]) => { const p = s.rpc(...a); return Object.assign(p, { abortSignal: () => p }); },
  from: (...a: unknown[]) => s.table(...a),
} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { C2PilotEconomicApproval } from "@/components/pedidos-b2b/C2PilotEconomicApproval";
import { parseC2PilotRead, parseC2PilotState } from "@/hooks/useC2PilotEconomicApproval";

const ORDER = "11111111-2222-4333-8444-555555555555";
const H = "a".repeat(32);
const state = (o: Record<string, unknown> = {}) => ({
  contract: "C2_PILOT_ECON_STATE_V1", order_id: ORDER, available: true, pilot_enabled: true,
  evidence: { evidence_hash: H, financed_total: 20, method: "boleto", due_basis: "nf_issue", estimated: true,
    schedule: [{ installment_number: 1, amount: 20, due_date: "2026-12-11" }], items: [{ id: "i1", quantidade: 2, preco_unitario: 10, subtotal: 20 }] },
  evidence_block_reason: null, approvals: [], can_approve_commercial: false, can_approve_credit: true, forecast: null,
  operational_blocked: true, fiscal_blocked: true, billing_blocked: true, shipping_blocked: true, ...o });
const ok = (data: unknown) => Promise.resolve({ data, error: null });
const fail = (message: string, code = "P0001") => Promise.resolve({ data: null, error: { message, code } });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><C2PilotEconomicApproval orderId={ORDER} /></QueryClientProvider>);
}
const writes = () => s.rpc.mock.calls.filter((c) => c[0] === "c2_pilot_economic_approve_v1");
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("Financeiro com concessão: aprova crédito uma vez com hash da evidência e mostra autor/data e previsão estimada", async () => {
  let cur = state();
  s.rpc.mockImplementation((name: string, args: any) => {
    if (name === "c2_pilot_economic_approve_v1") {
      cur = state({ approvals: [{ kind: "credit", approved_by: "fin", actor_role: "financeiro", approved_at: "2026-11-11T10:00:00Z", evidence_hash: H }],
        can_approve_credit: false, forecast: { forecast_id: "f1", state: "aguardando_fiscal", total_amount: 20, due_dates_estimated: true, created_at: "2026-11-11T10:00:00Z" } });
      return ok({ contract: "C2_PILOT_ECON_APPROVAL_V1", kind: args.p_kind, approval_id: "a1", approved_by: "fin", approved_at: "2026-11-11T10:00:00Z", forecast_id: "f1", replayed: false });
    }
    return ok(cur);
  });
  mount();
  const btn = await screen.findByRole("button", { name: "Aprovar" });
  expect(screen.getByTestId("c2-pilot-commercial")).toHaveTextContent("Pendente");
  fireEvent.click(btn); fireEvent.click(btn);
  await waitFor(() => expect(screen.getByTestId("c2-pilot-forecast")).toBeInTheDocument());
  expect(writes()).toHaveLength(1);
  expect(writes()[0][1]).toMatchObject({ p_order: ORDER, p_kind: "credit", p_expected_evidence_hash: H });
  expect(screen.getByTestId("c2-pilot-credit")).toHaveTextContent(/Aprovado em .*financeiro/);
  expect(screen.getByTestId("c2-pilot-forecast")).toHaveTextContent(/não é cobrança/);
  expect(s.table).not.toHaveBeenCalled();
  expect(s.rpc.mock.calls.map((c) => c[0]).filter((n) => !n.startsWith("c2_pilot_"))).toEqual([]);
});

it("resposta incerta: mantém a mesma chave na repetição explícita; sem retry automático", async () => {
  let n = 0;
  s.rpc.mockImplementation((name: string) => name === "c2_pilot_economic_approve_v1" ? (n++, fail("network")) : ok(state()));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Aprovar" }));
  const again = await screen.findByRole("button", { name: "Repetir" });
  expect(n).toBe(1);
  fireEvent.click(again);
  await waitFor(() => expect(writes()).toHaveLength(2));
  expect(writes()[1][1].p_idempotency_key).toBe(writes()[0][1].p_idempotency_key);
});

it("conflito de evidência descarta a chave e não reenvia", async () => {
  s.rpc.mockImplementation((name: string) => name === "c2_pilot_economic_approve_v1" ? fail("C2_PILOT_ECON_EVIDENCE_CHANGED", "PT409") : ok(state()));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Aprovar" }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(screen.queryByRole("button", { name: "Repetir" })).toBeNull();
});

it.each([
  ["leitor não instalado", () => fail("Could not find the function public.c2_pilot_economic_state_v1(p_order)", "PGRST202")],
  ["negado pelo servidor", () => fail("C2_PILOT_ECON_DENIED:role", "42501")],
  ["contrato inválido", () => ok({ ...state(), fiscal_blocked: false })],
  ["piloto desligado sem histórico", () => ok(state({ pilot_enabled: false, evidence: null, can_approve_credit: false }))],
  ["fora do piloto/sem concessão (indisponível)", () => ok({ contract: "C2_PILOT_ECON_STATE_V1", order_id: ORDER, available: false, reason: "NOT_GRANTED" })],
  ["piloto desligado (indisponível)", () => ok({ contract: "C2_PILOT_ECON_STATE_V1", order_id: ORDER, available: false, reason: "PILOT_DISABLED" })],
  ["indisponível com autores vazados", () => ok({ contract: "C2_PILOT_ECON_STATE_V1", order_id: ORDER, available: false, reason: "NOT_GRANTED", approvals: [{ kind: "credit", approved_by: "x", approved_at: "t", evidence_hash: H }] })],
])("%s: nada é montado nem gravado", async (_l, r) => {
  s.rpc.mockImplementation(() => r());
  mount();
  await waitFor(() => expect(s.rpc).toHaveBeenCalled());
  await new Promise((x) => setTimeout(x, 20));
  expect(screen.queryByTestId("c2-pilot-economic")).toBeNull();
  expect(writes()).toHaveLength(0);
});

it("sem concessão: mostra estado e nenhum botão", async () => {
  s.rpc.mockImplementation(() => ok(state({ evidence: null, can_approve_credit: false })));
  mount();
  expect(await screen.findByTestId("c2-pilot-economic")).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
});

it("parser recusa ação sem evidência ou com piloto desligado", () => {
  expect(() => parseC2PilotState(state({ evidence: null }), ORDER)).toThrow();
  expect(() => parseC2PilotState(state({ pilot_enabled: false }), ORDER)).toThrow();
  expect(() => parseC2PilotState(state(), "outro")).toThrow();
  expect(parseC2PilotState(state(), ORDER).can_approve_credit).toBe(true);
});

it("parser: indisponível só sem payload financeiro/autor; disponível exige available=true", () => {
  expect(parseC2PilotRead({ contract: "C2_PILOT_ECON_STATE_V1", order_id: ORDER, available: false, reason: "NOT_GRANTED" }, ORDER)).toEqual({ state: "unavailable" });
  expect(() => parseC2PilotRead({ contract: "C2_PILOT_ECON_STATE_V1", order_id: ORDER, available: false, reason: "NOT_GRANTED", forecast: { forecast_id: "f" } }, ORDER)).toThrow();
  expect(() => parseC2PilotRead({ contract: "C2_PILOT_ECON_STATE_V1", order_id: ORDER, available: false, reason: "OUTRO" }, ORDER)).toThrow();
  expect(() => parseC2PilotState(state({ available: undefined }), ORDER)).toThrow();
  expect(parseC2PilotRead(state(), ORDER).state).toBe("ready");
});
