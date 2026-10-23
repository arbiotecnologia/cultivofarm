import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPartnerSettings } from "@/lib/financeiro/partnerSettings";
const state = vi.hoisted(() => ({ org: "A", partner: true, rows: 1, duplicate: false, operations: [] as Array<{ table: string; calls: Array<[string, unknown, unknown]> }> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ roles: ["administrador"], profile: { organization_id: state.org } }) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => {
  const org = state.org;
  return { ready: true, scope: org, capture: () => () => org === state.org };
} }));
vi.mock("@/hooks/useB2BFinancialScope", () => ({ useScopedB2BFinancialQuery: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const op = { table, calls: [] as Array<[string, unknown, unknown]> }; state.operations.push(op);
  const chain: any = {};
  for (const method of ["select", "eq", "is", "maybeSingle", "update", "insert"]) chain[method] = (a: unknown, b: unknown) => { op.calls.push([method, a, b]); return chain; };
  chain.then = (resolve: (x: unknown) => void) => {
    if (table === "partner_accounts") resolve({ data: state.partner ? { id: "P" } : null, error: null });
    else if (table === "payment_methods") resolve({ data: [{ name: "AUDIT-AR-20260922 - Sem transferencia", active: true }], error: null });
    else resolve({ data: state.rows ? { id: "S" } : null, error: state.duplicate ? { code: "23505" } : null });
  };
  return chain;
} } }));
import { useUpdatePartnerFinancialSettings } from "@/hooks/useB2BFinanceiro";
const row = () => ({ ...emptyPartnerSettings("P"), id: "S", updated_at: "2026-10-23T20:00:00Z", default_payment_method: "AUDIT-AR-20260922 - Sem transferencia" });
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useUpdatePartnerFinancialSettings(), { wrapper });
}
beforeEach(() => { state.org = "A"; state.partner = true; state.rows = 1; state.duplicate = false; state.operations = []; });
describe("CAS e owner — SDK simulado, sem provar RLS hosted", () => {
  it("usa tenant exato e baseline completo na atualização atômica", async () => {
    const hook = setup(); const baseline = row();
    await act(async () => hook.result.current.mutateAsync({ draft: { ...baseline, payment_terms_days: 12 }, baseline }));
    expect(state.operations[0].calls).toContainEqual(["eq", "commercial_owner_organization_id", "A"]);
    const update = state.operations.find(op => op.table === "partner_financial_settings");
    expect(update?.calls).toContainEqual(["eq", "updated_at", baseline.updated_at]);
    expect(update?.calls).toContainEqual(["eq", "payment_terms_days", 7]);
    expect(update?.calls).toContainEqual(["is", "credit_limit", null]);
    expect(update?.calls.some(([method]) => method === "update")).toBe(true);
  });
  it("conflito de baseline retorna erro sem sucesso silencioso", async () => {
    state.rows = 0; const hook = setup();
    await act(async () => { await expect(hook.result.current.mutateAsync({ draft: row(), baseline: row() })).rejects.toThrow("settings_conflict"); });
  });
  it("nega parceiro B antes de escrever", async () => {
    state.partner = false; const hook = setup();
    await act(async () => { await expect(hook.result.current.mutateAsync({ draft: row(), baseline: row() })).rejects.toThrow("financial_partner_unavailable"); });
    expect(state.operations.some(op => op.table === "partner_financial_settings")).toBe(false);
  });
  it("inserção concorrente não faz upsert nem sobrescreve", async () => {
    state.duplicate = true; const hook = setup();
    await act(async () => { await expect(hook.result.current.mutateAsync({ draft: row(), baseline: null })).rejects.toThrow("settings_conflict"); });
    expect(state.operations.at(-1)?.calls.some(([method]) => method === "insert")).toBe(true);
  });
  it("não escreve método inexistente", async () => {
    const hook = setup();
    await act(async () => { await expect(hook.result.current.mutateAsync({ draft: { ...row(), default_payment_method: "pix" }, baseline: row() })).rejects.toThrow("payment_method_invalid"); });
    expect(state.operations.some(op => op.table === "partner_financial_settings")).toBe(false);
  });
});