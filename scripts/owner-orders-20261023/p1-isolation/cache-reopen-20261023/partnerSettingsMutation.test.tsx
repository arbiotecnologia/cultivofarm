import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPartnerSettings } from "@/lib/financeiro/partnerSettings";
const state = vi.hoisted(() => ({ org: "A", roles: ["administrador"], ready: true,
  ownPartner: null as string | null, orgActive: true, owner: "A", partner: true, partnerActive: true,
  rows: 1, duplicate: false, rpcError: null as null | { code: string; message: string },
  methodActive: true, changedAt: "", operations: [] as Array<{ table: string; calls: Array<[string, unknown, unknown]> }> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ roles: state.roles, profile: { organization_id: state.org } }) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => {
  const org = state.org;
  return { ready: state.ready, scope: org, capture: () => () => state.ready && org === state.org };
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async (name: string, args: Record<string, unknown>) => {
    state.operations.push({ table: name, calls: [["rpc", args, undefined]] });
    return { data: state.rows ? { id: "S", partner_id: args.p_partner_id, ...(args.p_values as Record<string, unknown>) } : null,
      error: state.rpcError ?? (state.duplicate ? { code: "40001", message: "settings_conflict" } : null) };
  }, from: (table: string) => {
    const op = { table, calls: [] as Array<[string, unknown, unknown]> }; state.operations.push(op);
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "or", "order", "limit", "maybeSingle"])
      chain[method] = (a: unknown, b: unknown) => { op.calls.push([method, a, b]); return chain; };
    chain.then = (resolve: (x: unknown) => void) => {
      let rows: Array<Record<string, unknown>> = table === "organizations"
        ? [{ id: state.org, partner_account_id: state.ownPartner, ativo: state.orgActive, status: state.orgActive ? "ativa" : "inativa" }]
        : table === "partner_accounts" ? (state.partner ? [{ id: "P", commercial_owner_organization_id: state.owner,
          ativo: state.partnerActive, deleted_at: null, razao_social: "Parceiro", nome_fantasia: null }] : [])
        : table === "payment_methods" ? [{ name: "AUDIT-AR-20260922 - Sem transferencia", active: state.methodActive }] : [];
      for (const [method, field, value] of op.calls) {
        if (method === "eq" || method === "is") rows = rows.filter(row => row[String(field)] === value);
        if (method === "or") rows = rows.filter(row => String(field).split(",").some(part => {
          const [key, operator, expected] = part.split("."); return operator === "eq" && row[key] === expected;
        }));
      }
      if (state.changedAt === table) state.org = "B";
      resolve({ data: op.calls.some(([method]) => method === "maybeSingle") ? rows[0] ?? null : rows, error: null });
    };
    return chain;
  },
} }));
import { useUpdatePartnerFinancialSettings, useFinancialSettingsPartners } from "@/hooks/useB2BFinanceiro";
const row = () => ({ ...emptyPartnerSettings("P"), id: "S", updated_at: "2026-10-23T20:00:00Z", default_payment_method: "AUDIT-AR-20260922 - Sem transferencia" });
function setup(listEnabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { hook: renderHook(() => ({ mutation: useUpdatePartnerFinancialSettings(), partners: useFinancialSettingsPartners(listEnabled) }), { wrapper }), client };
}
beforeEach(() => { Object.assign(state, { org: "A", roles: ["administrador"], ready: true, ownPartner: null,
  orgActive: true, owner: "A", partner: true, partnerActive: true, rows: 1, duplicate: false,
  rpcError: null, methodActive: true, changedAt: "", operations: [] }); });
describe("P1 RPC promovida — SDK simulado, NÃO JWT/RLS hosted", () => {
  for (const path of ["owner", "ownorg"] as const) {
    it(`lista e salva ${path} autorizado com CAS integral servidor`, async () => {
      if (path === "ownorg") { state.owner = "B"; state.ownPartner = "P"; }
      const { hook, client } = setup(); const baseline = row();
      await waitFor(() => expect(hook.result.current.partners.data?.map(p => p.id)).toEqual(["P"]));
      await act(async () => hook.result.current.mutation.mutateAsync({ draft: { ...baseline, payment_terms_days: 12 }, baseline }));
      const rpc = state.operations.find(op => op.table === "rpc_update_partner_financial_settings");
      const args = rpc?.calls[0]?.[1] as Record<string, unknown>;
      expect(args.p_expected).toEqual(baseline); expect(args.p_partner_id).toBe("P");
      expect(args.p_values).toMatchObject({ payment_terms_days: 12, billing_trigger: "na_entrega", default_payment_method: baseline.default_payment_method });
      expect(state.operations.some(op => op.table === "partner_financial_settings")).toBe(false);
      hook.unmount(); client.clear();
    });
  }
  for (const denial of ["tenantB", "ownorgForeign", "inactiveOrg", "inactivePartner", "missingPartner"] as const) {
    it(`nega lista e mutação: ${denial}`, async () => {
      if (denial === "tenantB") state.org = "B";
      if (denial === "ownorgForeign") { state.owner = "B"; state.ownPartner = "OTHER"; }
      if (denial === "inactiveOrg") state.orgActive = false;
      if (denial === "inactivePartner") state.partnerActive = false;
      if (denial === "missingPartner") state.partner = false;
      const { hook, client } = setup();
      await waitFor(() => expect(hook.result.current.partners.isFetched).toBe(true));
      expect(hook.result.current.partners.data ?? []).toEqual([]);
      await act(async () => { await expect(hook.result.current.mutation.mutateAsync({ draft: row(), baseline: row() }))
        .rejects.toThrow(denial === "inactiveOrg" ? "financial_context_unavailable" : "financial_partner_unavailable"); });
      expect(state.operations.some(op => op.table === "rpc_update_partner_financial_settings")).toBe(false);
      hook.unmount(); client.clear();
    });
  }
  for (const roles of [["parceiro_b2b"], ["parceiro_b2b_tecnico"], ["cliente_produtor"],
    ["administrador", "parceiro_b2b"], ["administrativo"]]) {
    it(`não abre configuração interna a ${roles.join("+")} mesmo ownorg`, async () => {
      state.roles = roles; state.ownPartner = "P";
      const { hook, client } = setup();
      expect(state.operations).toEqual([]);
      await act(async () => { await expect(hook.result.current.mutation.mutateAsync({ draft: row(), baseline: row() })).rejects.toThrow("financial_context_unavailable"); });
      expect(state.operations).toEqual([]); hook.unmount(); client.clear();
    });
  }
  it("denegação RPC permanece autoritativa mesmo com precheck owner válido", async () => {
    state.rpcError = { code: "42501", message: "C2P1_FORBIDDEN" };
    const { hook, client } = setup();
    await act(async () => { await expect(hook.result.current.mutation.mutateAsync({ draft: row(), baseline: row() })).rejects.toMatchObject({ code: "42501" }); });
    hook.unmount(); client.clear();
  });
  it("ausência usa p_expected NULL e conflito servidor não sobrescreve", async () => {
    state.duplicate = true; const { hook, client } = setup();
    await act(async () => { await expect(hook.result.current.mutation.mutateAsync({ draft: row(), baseline: null })).rejects.toMatchObject({ message: "settings_conflict" }); });
    const rpc = state.operations.find(op => op.table === "rpc_update_partner_financial_settings");
    expect((rpc?.calls[0]?.[1] as Record<string, unknown>).p_expected).toBeNull();
    expect(state.operations.filter(op => op.table === "rpc_update_partner_financial_settings")).toHaveLength(1);
    hook.unmount(); client.clear();
  });
  it("zero linhas não vira sucesso silencioso", async () => {
    state.rows = 0; const { hook, client } = setup();
    await act(async () => { await expect(hook.result.current.mutation.mutateAsync({ draft: row(), baseline: row() })).rejects.toThrow("settings_conflict"); });
    hook.unmount(); client.clear();
  });
  for (const invalid of ["pix", "inactive"] as const) {
    it(`método ${invalid} não chega à RPC`, async () => {
      if (invalid === "inactive") state.methodActive = false;
      const { hook, client } = setup();
      await act(async () => { await expect(hook.result.current.mutation.mutateAsync({ draft: { ...row(), default_payment_method: invalid === "pix" ? "pix" : row().default_payment_method }, baseline: row() })).rejects.toThrow("payment_method_invalid"); });
      expect(state.operations.some(op => op.table === "rpc_update_partner_financial_settings")).toBe(false);
      hook.unmount(); client.clear();
    });
  }
  for (const table of ["organizations", "partner_accounts", "payment_methods"]) {
    it(`troca tenant durante ${table} impede escrita`, async () => {
      state.changedAt = table; const { hook, client } = setup(false);
      await act(async () => { await expect(hook.result.current.mutation.mutateAsync({ draft: row(), baseline: row() })).rejects.toThrow("financial_context_changed"); });
      expect(state.operations.some(op => op.table === "rpc_update_partner_financial_settings")).toBe(false);
      hook.unmount(); client.clear();
    });
  }
});
