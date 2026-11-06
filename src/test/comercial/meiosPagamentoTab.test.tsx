import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Transporte sintético local; nenhuma chamada hospedada. Regras de autoridade continuam no servidor.
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => state.rpc(...a) } }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({ ready: true, scope: "s1", capture: () => () => true }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MeiosPagamentoTab } from "@/components/comercial/MeiosPagamentoTab";
import { validateConfig } from "@/hooks/useB2BPaymentMethodAdmin";

const ORG = "11111111-1111-4111-8111-111111111111";
const PLAN = { id: "22222222-2222-4222-8222-222222222222", name: "TESTE 3x", code: "T3", installment_count: 3, max_days: 90, monthly_interest_percent: 0 };
const CFG = { id: "33333333-3333-4333-8333-333333333333", payment_plan_id: PLAN.id, method_kind: "boleto", payment_method_id: "m-bol", status: "active",
  version: 4, due_days: 30, max_installments: 3, price_monthly_rate_percent: 1.8 };
function list(over: Record<string, unknown> = {}) {
  return { contract: "B2B_PAYMENT_METHOD_V1", organization_id: ORG, can_edit: true, can_activate: true,
    activation: { mode: "off", pilot_partner_ids: [], version: 0 }, configs: [CFG], catalog: [{ id: "m-bol", name: "Boleto TESTE" }],
    plans: [PLAN], partners: ["44444444-4444-4444-8444-444444444444"], ...over };
}
const ok = (data: unknown) => { const p = Promise.resolve({ data, error: null }); return Object.assign(p, { abortSignal: () => p }); };
const calls = (n: string) => state.rpc.mock.calls.filter(([x]) => x === n).map(([, a]) => a as Record<string, unknown>);

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MeiosPagamentoTab /></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

it("edição envia CAS da versão observada; conflito mantém o rascunho, mostra motivo e não tenta de novo", async () => {
  state.rpc.mockImplementation((n: string) => n === "b2b_payment_method_config_list" ? ok(list())
    : Promise.resolve({ data: null, error: { code: "PT409", message: "payment_method_config_stale" } }));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
  fireEvent.change(screen.getByLabelText(/Prazo da 1ª parcela/), { target: { value: "45" } });
  fireEvent.click(screen.getByRole("button", { name: /Salvar meio/ }));
  await waitFor(() => expect(calls("b2b_payment_method_config_save")).toHaveLength(1));
  expect(calls("b2b_payment_method_config_save")[0]).toMatchObject({ p_config_id: CFG.id, p_expected_version: 4, p_due_days: 45, p_price_monthly_rate_percent: 1.8 });
  expect(await screen.findByText(/Outra pessoa alterou/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Prazo da 1ª parcela/)).toHaveValue("45");
  await new Promise((r) => setTimeout(r, 30));
  expect(calls("b2b_payment_method_config_save")).toHaveLength(1);
});

it("parcelado sem taxa explícita é recusado antes do envio (nenhuma taxa presumida)", () => {
  expect(validateConfig({ config_id: null, payment_plan_id: PLAN.id, method_kind: "promissoria", payment_method_id: "m", due_days: 30,
    max_installments: 3, price_monthly_rate_percent: null, status: "active", expected_version: 0 }, PLAN)).toMatch(/taxa Price/);
  expect(validateConfig({ config_id: null, payment_plan_id: PLAN.id, method_kind: "promissoria", payment_method_id: "m", due_days: 30,
    max_installments: 3, price_monthly_rate_percent: 0, status: "active", expected_version: 0 }, PLAN)).toBeNull();
  expect(validateConfig({ config_id: null, payment_plan_id: PLAN.id, method_kind: "boleto", payment_method_id: "m", due_days: 30,
    max_installments: 4, price_monthly_rate_percent: 1, status: "active", expected_version: 0 }, PLAN)).toMatch(/1 a 3/);
  expect(validateConfig({ config_id: null, payment_plan_id: PLAN.id, method_kind: "pix", payment_method_id: "m", due_days: 91,
    max_installments: 1, price_monthly_rate_percent: null, status: "active", expected_version: 0 }, PLAN)).toMatch(/90 dias/);
});

it("financeiro edita mas não ativa; gestor só consulta", async () => {
  state.rpc.mockImplementation(() => ok(list({ can_activate: false })));
  const v = mount();
  expect(await screen.findByTestId("pm-form")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Tornar obrigatória" })).toBeNull();
  v.unmount();
  state.rpc.mockImplementation(() => ok(list({ can_activate: false, can_edit: false })));
  mount();
  expect(await screen.findByText(/Consulta apenas/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
});

it("piloto envia só os parceiros marcados com CAS da ativação", async () => {
  state.rpc.mockImplementation((n: string) => n === "b2b_payment_method_config_list" ? ok(list())
    : Promise.resolve({ data: { contract: "B2B_PAYMENT_METHOD_V1", activation: { mode: "pilot" } }, error: null }));
  mount();
  const card = (await screen.findByText("Exigência do meio no pedido")).closest("div")!.parentElement!;
  expect(within(card).getByRole("button", { name: "Ativar piloto" })).toBeDisabled();
  fireEvent.click(within(card).getByRole("button", { name: /Parceiro 44444444/ }));
  fireEvent.click(within(card).getByRole("button", { name: "Ativar piloto" }));
  await waitFor(() => expect(calls("b2b_payment_method_activation_set")).toHaveLength(1));
  expect(calls("b2b_payment_method_activation_set")[0]).toEqual({ p_mode: "pilot", p_pilot_partner_ids: ["44444444-4444-4444-8444-444444444444"], p_expected_version: 0 });
});

it("resposta fora do contrato vira erro com nova leitura manual (nunca lista vazia)", async () => {
  state.rpc.mockImplementation(() => ok({ contract: "OUTRO" }));
  mount();
  expect(await screen.findByTestId("pm-admin-error")).toBeInTheDocument();
  const n = calls("b2b_payment_method_config_list").length;
  await new Promise((r) => setTimeout(r, 30));
  expect(calls("b2b_payment_method_config_list")).toHaveLength(n);
  fireEvent.click(screen.getByRole("button", { name: "Tentar carregar novamente" }));
  await waitFor(() => expect(calls("b2b_payment_method_config_list").length).toBe(n + 1));
});
