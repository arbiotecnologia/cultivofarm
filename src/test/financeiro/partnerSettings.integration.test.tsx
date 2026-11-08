import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPartnerSettings, type PartnerSettings } from "@/lib/financeiro/partnerSettings";
const state = vi.hoisted(() => ({
  auth: { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false },
    roles: ["administrador"], role: "administrador", loading: false, authzReady: true, authzEpoch: 0 },
  row: null as PartnerSettings | null, holdReads: false, pendingReads: [] as Array<() => void>,
  holdRpc: false, pendingRpc: null as (() => void) | null, rpcError: false,
  rpcCalls: [] as Array<Record<string, unknown>>, readCount: 0,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "or", "order", "limit", "maybeSingle"]) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => {
      if (table === "partner_financial_settings") {
        state.readCount += 1; const snapshot = state.row ? { ...state.row } : null;
        const finish = () => resolve({ data: snapshot, error: null });
        if (state.holdReads) state.pendingReads.push(finish); else finish();
      } else if (table === "organizations") resolve({ data: { id: state.auth.profile.organization_id, partner_account_id: null }, error: null });
      else if (table === "partner_accounts") resolve({ data: { id: "P" }, error: null });
      else if (table === "payment_methods") resolve({ data: [{ id: "M", name: "AUDIT-AR-20260922 - Sem transferencia", active: true }], error: null });
      else resolve({ data: [], error: null });
    };
    return chain;
  },
  rpc: (name: string, args: Record<string, unknown>) => {
    if (name !== "rpc_update_partner_financial_settings") throw new Error("unexpected_rpc");
    state.rpcCalls.push(args);
    return new Promise(resolve => {
      const finish = () => {
        if (state.rpcError || JSON.stringify(args.p_expected) !== JSON.stringify(state.row)) {
          resolve({ data: null, error: { code: "40001", message: "settings_conflict" } }); return;
        }
        state.row = { ...state.row, ...(args.p_values as PartnerSettings), partner_id: "P", id: "S", updated_at: "2026-10-23T21:18:08.481422+00:00" };
        resolve({ data: { ...state.row }, error: null });
      };
      if (state.holdRpc) state.pendingRpc = finish; else finish();
    });
  },
} }));
// Only control primitives are simplified; dialog, hooks, scope fences and QueryClient are real.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: any) => <select value={value} onChange={e => onValueChange(e.target.value)} disabled={disabled}><option value="" />{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value, disabled }: any) => <option value={value} disabled={disabled}>{children}</option>,
}));
import { PartnerFinancialSettingsDialog } from "@/pages/financeiro/FinanceiroB2B";
import { Button } from "@/components/ui/button";
const method = "AUDIT-AR-20260922 - Sem transferencia";
const legacy = (): PartnerSettings => ({ ...emptyPartnerSettings("P"), id: "S", updated_at: "2026-10-23T21:00:00Z", default_payment_method: "pix",
  billing_trigger: "na_entrega", payment_terms_days: 7, auto_generate_receivable: true });
function scope() { return JSON.stringify([true, state.auth.user.id, state.auth.profile.organization_id, [...state.auth.roles].sort(), "b2b-financial", state.auth.authzEpoch]); }
function Harness() {
  const [open, setOpen] = useState(false);
  return <><Button onClick={() => setOpen(true)}>Configurar parceiro</Button>{open && <PartnerFinancialSettingsDialog key={scope()} open partner={{ partner_id: "P", partner_name: "Teste" }} onClose={() => setOpen(false)} />}</>;
}
function setup(cached?: PartnerSettings) {
  // Same mount/stale policy as App.tsx: the hook must override it for this resource.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300000, refetchOnMount: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });
  if (cached) client.setQueryData(["pfs", "P", scope()], cached);
  const view = render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
  return { client, view, key: ["pfs", "P", scope()] };
}
async function open() { fireEvent.click(screen.getByRole("button", { name: "Configurar parceiro" })); }
async function editMethod() {
  await screen.findByLabelText("Prazo (dias)");
  fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: method } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled());
}
beforeEach(() => {
  Object.assign(state.auth, { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["administrador"], role: "administrador", loading: false, authzReady: true, authzEpoch: 0 });
  Object.assign(state, { row: legacy(), holdReads: false, pendingReads: [], holdRpc: false, pendingRpc: null, rpcError: false, rpcCalls: [], readCount: 0 });
});
describe("P1 hook+dialog+QueryClient integrados — SDK sintético, sem DML hosted", () => {
  it("parceiro cadastrado sem settings permanece sem financeiro ao abrir e reabrir", async () => {
    state.row = null;
    const { client, key } = setup(); await open();
    await screen.findByLabelText("Prazo (dias)");
    expect(client.getQueryData(key)).toBeNull();
    expect(state.row).toBeNull();
    expect(state.rpcCalls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(state.rpcCalls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await open(); await screen.findByLabelText("Prazo (dias)");
    expect(state.row).toBeNull();
    expect(state.rpcCalls).toHaveLength(0); client.clear();
  });
  it("settings ausentes só são criadas por salvar explicitamente pelo RPC CAS com expected NULL", async () => {
    state.row = null;
    const { client } = setup(); await open(); await editMethod();
    expect(state.row).toBeNull();
    expect(state.rpcCalls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].p_expected).toBeNull();
    expect(state.rpcCalls[0].p_partner_id).toBe("P");
    expect(state.row).toMatchObject({ partner_id: "P", default_payment_method: method });
    client.clear();
  });
  it("salvar fecha; reabrir mostra retorno canônico e nunca pix do cache anterior", async () => {
    const { client, key } = setup(legacy()); await open(); await editMethod();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(client.getQueryData(key)).toMatchObject({ default_payment_method: method, billing_trigger: "na_entrega", payment_terms_days: 7, updated_at: "2026-10-23T21:18:08.481422+00:00" });
    await open(); await screen.findByLabelText("Prazo (dias)");
    expect(screen.getAllByRole("combobox")[1]).toHaveValue(method);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
    expect(state.rpcCalls).toHaveLength(1); client.clear();
  });
  it("reabertura não congela baseline stale durante a primeira releitura", async () => {
    state.row = { ...legacy(), default_payment_method: method }; state.holdReads = true;
    const { client } = setup(legacy()); await open();
    await waitFor(() => expect(state.pendingReads).toHaveLength(1));
    expect(screen.queryByLabelText("Prazo (dias)")).toBeNull();
    await act(async () => { state.holdReads = false; state.pendingReads.shift()?.(); });
    await screen.findByLabelText("Prazo (dias)");
    expect(screen.getAllByRole("combobox")[1]).toHaveValue(method);
    expect(screen.queryByText(/Seu rascunho foi preservado/)).toBeNull(); client.clear();
  });
  it("cancela leitura antiga pendente no sucesso RPC e ignora resposta velha tardia", async () => {
    const { client, key } = setup(); await open(); await editMethod(); state.holdRpc = true;
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(state.pendingRpc).not.toBeNull());
    state.holdReads = true;
    await act(async () => { void client.refetchQueries({ queryKey: key, exact: true }); });
    await waitFor(() => expect(state.pendingReads).toHaveLength(1)); const old = state.pendingReads.shift();
    await act(async () => { state.holdReads = false; state.pendingRpc?.(); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await act(async () => old?.());
    expect(client.getQueryData(key)).toMatchObject({ default_payment_method: method });
    await open(); await screen.findByLabelText("Prazo (dias)"); expect(screen.getAllByRole("combobox")[1]).toHaveValue(method); client.clear();
  });
  it("aguarda releitura pós-sucesso antes de fechar, sem cache stale", async () => {
    const { client, key } = setup(); await open(); await editMethod(); state.holdRpc = true;
    fireEvent.click(screen.getByRole("button", { name: "Salvar" })); await waitFor(() => expect(state.pendingRpc).not.toBeNull());
    await act(async () => { state.holdReads = true; state.pendingRpc?.(); });
    await waitFor(() => expect(state.pendingReads).toHaveLength(1));
    expect(client.getQueryData(key)).toMatchObject({ default_payment_method: method });
    expect(screen.getByRole("dialog")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    await act(async () => { state.holdReads = false; state.pendingReads.shift()?.(); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); client.clear();
  });
  it("refetch igual preserva edição suja; diferente mantém rascunho e bloqueia CAS", async () => {
    state.row = { ...legacy(), default_payment_method: method }; const { client, key } = setup(); await open();
    fireEvent.change(await screen.findByLabelText("Prazo (dias)"), { target: { value: "12" } });
    await act(async () => { await client.refetchQueries({ queryKey: key, exact: true }); });
    expect(screen.getByLabelText("Prazo (dias)")).toHaveValue(12);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
    state.row = { ...state.row, payment_terms_days: 9 };
    await act(async () => { await client.refetchQueries({ queryKey: key, exact: true }); });
    expect(screen.getByLabelText("Prazo (dias)")).toHaveValue(12);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled(); expect(state.rpcCalls).toHaveLength(0); client.clear();
  });
  it("conflito RPC não atualiza cache nem fecha ou perde edição", async () => {
    const { client, key } = setup(); await open(); await editMethod(); state.rpcError = true;
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText(/Seu rascunho foi preservado/);
    expect(screen.getAllByRole("combobox")[1]).toHaveValue(method);
    expect(client.getQueryData(key)).toMatchObject({ default_payment_method: "pix" });
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled(); expect(state.rpcCalls).toHaveLength(1); client.clear();
  });
  for (const change of ["tenant", "revocation"] as const) {
    it(`${change} durante releitura pós-RPC remove cache antigo e não readota bytes tardios`, async () => {
      const { client, key, view } = setup(); await open(); await editMethod(); state.holdRpc = true;
      fireEvent.click(screen.getByRole("button", { name: "Salvar" })); await waitFor(() => expect(state.pendingRpc).not.toBeNull());
      await act(async () => { state.holdReads = true; state.pendingRpc?.(); });
      await waitFor(() => expect(state.pendingReads).toHaveLength(1));
      expect(client.getQueryData(key)).toMatchObject({ default_payment_method: method });
      const late = state.pendingReads.shift();
      if (change === "tenant") state.auth.profile.organization_id = "OB";
      else state.auth.authzReady = false;
      view.rerender(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
      await act(async () => late?.());
      expect(client.getQueryData(key)).toBeUndefined();
      expect(client.getQueryCache().getAll().some(q => (q.state.data as PartnerSettings | undefined)?.updated_at === "2026-10-23T21:18:08.481422+00:00")).toBe(false);
      client.clear();
    });
  }
  for (const change of ["tenant", "revocation", "epoch"] as const) {
    it(`${change} enquanto RPC pendente impede adoção/invalidação do resultado antigo`, async () => {
      const { client, key, view } = setup(); await open(); await editMethod(); state.holdRpc = true;
      fireEvent.click(screen.getByRole("button", { name: "Salvar" })); await waitFor(() => expect(state.pendingRpc).not.toBeNull());
      if (change === "tenant") state.auth.profile.organization_id = "OB";
      if (change === "revocation") state.auth.authzReady = false;
      if (change === "epoch") state.auth.authzEpoch += 1;
      // New-context reads are held separately: this assertion concerns adoption of the old RPC,
      // not an independently authorized fresh read by the new context.
      state.holdReads = true;
      view.rerender(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
      await act(async () => state.pendingRpc?.());
      const values = client.getQueryCache().getAll().map(q => q.state.data);
      expect(values.some(value => (value as PartnerSettings | undefined)?.updated_at === "2026-10-23T21:18:08.481422+00:00")).toBe(false);
      expect(client.getQueryData(key)).toBeUndefined(); client.clear();
    });
  }
});
