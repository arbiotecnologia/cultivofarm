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
const PARTNER = "44444444-4444-4444-8444-444444444444";
const PLAN = { id: "22222222-2222-4222-8222-222222222222", name: "TESTE 3x", code: "T3", max_days: 90, monthly_interest_percent: 0 };
const COND = { plan_id: PLAN.id, method: "boleto", version: 4, deadline_days: 30, installment_count: 3, monthly_rate: 1.8,
  payment_method_id: "m-bol", category_id: "c-rec", retired: false, partner_ids: [] as string[] };
function list(over: Record<string, unknown> = {}) {
  return { contract: "B2B_PAYMENT_CONDITION_V1", organization_id: ORG, can_edit: true, can_activate: true, default_deadline_days: 30,
    activation: { mode: "off", pilot_partner_ids: [], version: 0 }, conditions: [COND], catalog: [{ id: "m-bol", name: "Boleto TESTE" }],
    categories: [{ id: "c-rec", name: "Receita TESTE" }], plans: [PLAN], partners: [PARTNER], ...over };
}
const ok = (data: unknown) => { const p = Promise.resolve({ data, error: null }); return Object.assign(p, { abortSignal: () => p }); };
const calls = (n: string) => state.rpc.mock.calls.filter(([x]) => x === n).map(([, a]) => a as Record<string, unknown>);
const base = { plan_id: PLAN.id, payment_method_id: "m", category_id: "c", deadline_days: 30, expected_version: 0 };

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MeiosPagamentoTab /></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

it("nova versão envia CAS da versão vigente; conflito mantém o rascunho, mostra motivo e não tenta de novo", async () => {
  state.rpc.mockImplementation((n: string) => n === "b2b_payment_condition_config_list" ? ok(list())
    : Promise.resolve({ data: null, error: { code: "PT409", message: "payment_condition_config_stale" } }));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Nova versão" }));
  fireEvent.change(screen.getByLabelText(/Prazo da 1ª parcela/), { target: { value: "45" } });
  fireEvent.click(screen.getByRole("button", { name: /Publicar versão/ }));
  await waitFor(() => expect(calls("b2b_payment_condition_publish")).toHaveLength(1));
  expect(calls("b2b_payment_condition_publish")[0]).toEqual({ p_plan_id: PLAN.id, p_method: "boleto", p_payment_method_id: "m-bol", p_category_id: "c-rec",
    p_deadline_days: 45, p_installment_count: 3, p_monthly_rate: 1.8, p_expected_version: 4 });
  expect(await screen.findByText(/Outra pessoa alterou/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Prazo da 1ª parcela/)).toHaveValue("45");
  await new Promise((r) => setTimeout(r, 30));
  expect(calls("b2b_payment_condition_publish")).toHaveLength(1);
});

it("formulário novo começa com o prazo padrão do servidor (30 dias), sem taxa presumida além de 0 explícito", async () => {
  state.rpc.mockImplementation(() => ok(list()));
  mount();
  expect(await screen.findByLabelText(/Prazo da 1ª parcela/)).toHaveValue("30");
});

it("regras locais espelham o servidor: taxa explícita em 1x só para boleto/promissória/crédito", () => {
  for (const method of ["boleto", "promissoria", "cartao_credito"] as const)
    expect(validateConfig({ ...base, method, installment_count: 1, monthly_rate: 1.8 }, PLAN)).toBeNull();
  for (const method of ["dinheiro", "pix", "cartao_debito"] as const)
    expect(validateConfig({ ...base, method, installment_count: 1, monthly_rate: 1.8 }, PLAN)).toMatch(/sem juros/);
  expect(validateConfig({ ...base, method: "promissoria", installment_count: 3, monthly_rate: 0 }, PLAN)).toBeNull();
  expect(validateConfig({ ...base, method: "boleto", installment_count: 4, monthly_rate: 1 }, PLAN)).toMatch(/1 a 3/);
  expect(validateConfig({ ...base, method: "pix", installment_count: 1, monthly_rate: 0, deadline_days: 91 }, PLAN)).toMatch(/90 dias/);
  expect(validateConfig({ ...base, method: "boleto", installment_count: 3, monthly_rate: 1.8 }, { ...PLAN, monthly_interest_percent: 2 })).toMatch(/juros próprios/);
  expect(validateConfig({ ...base, method: "cartao_credito", installment_count: 2, monthly_rate: NaN }, PLAN)).toMatch(/taxa Price/);
});

it("UI publica boleto sintético em 1x com 1,8% explícito e não oculta a taxa", async () => {
  state.rpc.mockImplementation((n: string) => n === "b2b_payment_condition_config_list"
    ? ok(list({ conditions: [{ ...COND, installment_count: 1, monthly_rate: 1.8 }] }))
    : Promise.resolve({ data: { contract: "B2B_PAYMENT_CONDITION_V1" }, error: null }));
  mount();
  expect(await screen.findByText("1,8% a.m.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Nova versão" }));
  fireEvent.click(screen.getByRole("button", { name: /Publicar versão/ }));
  await waitFor(() => expect(calls("b2b_payment_condition_publish")).toHaveLength(1));
  expect(calls("b2b_payment_condition_publish")[0]).toMatchObject({ p_method: "boleto", p_installment_count: 1, p_monthly_rate: 1.8, p_expected_version: 4 });
});

it("liberar parceiro envia a versão vigente; aposentar envia CAS", async () => {
  state.rpc.mockImplementation((n: string) => n === "b2b_payment_condition_config_list" ? ok(list())
    : Promise.resolve({ data: { contract: "B2B_PAYMENT_CONDITION_V1" }, error: null }));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: PARTNER.slice(0, 8) }));
  await waitFor(() => expect(calls("b2b_payment_condition_assign")).toHaveLength(1));
  expect(calls("b2b_payment_condition_assign")[0]).toEqual({ p_partner_id: PARTNER, p_plan_id: PLAN.id, p_method: "boleto", p_version: 4, p_enabled: true });
  fireEvent.click(screen.getByRole("button", { name: "Aposentar" }));
  await waitFor(() => expect(calls("b2b_payment_condition_retire")).toHaveLength(1));
  expect(calls("b2b_payment_condition_retire")[0]).toEqual({ p_plan_id: PLAN.id, p_method: "boleto", p_expected_version: 4 });
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
  expect(screen.queryByRole("button", { name: "Nova versão" })).toBeNull();
});

it("piloto envia só os parceiros marcados com CAS da ativação", async () => {
  state.rpc.mockImplementation((n: string) => n === "b2b_payment_condition_config_list" ? ok(list())
    : Promise.resolve({ data: { contract: "B2B_PAYMENT_CONDITION_V1", activation: { mode: "pilot" } }, error: null }));
  mount();
  const card = (await screen.findByText("Exigência no pedido")).closest("div")!.parentElement!;
  expect(within(card).getByRole("button", { name: "Ativar piloto" })).toBeDisabled();
  fireEvent.click(within(card).getByRole("button", { name: /Parceiro 44444444/ }));
  fireEvent.click(within(card).getByRole("button", { name: "Ativar piloto" }));
  await waitFor(() => expect(calls("b2b_payment_condition_activation_set")).toHaveLength(1));
  expect(calls("b2b_payment_condition_activation_set")[0]).toEqual({ p_mode: "pilot", p_pilot_partner_ids: [PARTNER], p_expected_version: 0 });
});

it("resposta fora do contrato vira erro com nova leitura manual (nunca lista vazia)", async () => {
  state.rpc.mockImplementation(() => ok({ contract: "B2B_PAYMENT_METHOD_V1" }));
  mount();
  expect(await screen.findByTestId("pm-admin-error")).toBeInTheDocument();
  const n = calls("b2b_payment_condition_config_list").length;
  await new Promise((r) => setTimeout(r, 30));
  expect(calls("b2b_payment_condition_config_list")).toHaveLength(n);
  fireEvent.click(screen.getByRole("button", { name: "Tentar carregar novamente" }));
  await waitFor(() => expect(calls("b2b_payment_condition_config_list").length).toBe(n + 1));
});
