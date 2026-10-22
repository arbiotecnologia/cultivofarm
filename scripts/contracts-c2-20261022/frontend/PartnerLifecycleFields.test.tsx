import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({ scope: "actor-A", ready: true, version: "a".repeat(32), roles: ["parceiro_b2b"], conflict: false, rpc: vi.fn() }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => {
  const scope = state.scope;
  return { scope, ready: state.ready, capture: () => () => state.ready && state.scope === scope };
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
import { PartnerLifecycleFields } from "./PartnerLifecycleFields";
const partnerId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const element = () => <QueryClientProvider client={qc}><PartnerLifecycleFields partnerId={partnerId} userId={userId} /></QueryClientProvider>;
  return { qc, element, view: render(element()) };
}
beforeEach(() => {
  cleanup(); state.scope = "actor-A"; state.ready = true; state.version = "a".repeat(32); state.roles = ["parceiro_b2b"]; state.conflict = false;
  state.rpc.mockReset().mockImplementation((name: string, args: Record<string, unknown>) => ({ abortSignal: async () => {
    if (name === "get_partner_user_lifecycle") return { data: { version: state.version, state: { roles: [...state.roles], link: { revoked_at: null } }, history: [], next_cursor: null }, error: null };
    if (state.conflict) return { data: null, error: { code: "40001" } };
    state.roles = args.p_roles as string[]; state.version = "b".repeat(32);
    return { data: { ok: true, user_id: userId, partner_id: partnerId, action: args.p_action, reader_activation: false, version: state.version }, error: null };
  } }));
});
describe("existing editor candidate integration", () => {
  it("selects cumulative roles and reads back confirmed mutation without manual cache invalidation", async () => {
    mount(); await screen.findByRole("button", { name: "Confirmar perfis" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Consultor técnico B2B" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Motivo" }), { target: { value: "Revisão autorizada" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar perfis" }));
    await screen.findByText("Alteração confirmada.");
    expect(state.roles).toEqual(["parceiro_b2b", "parceiro_b2b_tecnico"]);
    expect(state.rpc.mock.calls.filter(c => c[0] === "get_partner_user_lifecycle").length).toBeGreaterThan(1);
    expect(screen.getByRole("checkbox", { name: "Consultor técnico B2B" })).toBeChecked();
  });
  it("CAS conflict offers controlled read and uses the newly confirmed version", async () => {
    state.conflict = true; mount(); await screen.findByRole("button", { name: "Confirmar perfis" });
    fireEvent.change(screen.getByRole("textbox", { name: "Motivo" }), { target: { value: "Revisão autorizada" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar perfis" }));
    await screen.findByRole("button", { name: "Atualizar dados" });
    state.version = "c".repeat(32); state.conflict = false;
    fireEvent.click(screen.getByRole("button", { name: "Atualizar dados" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Atualizar dados" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Confirmar perfis" }));
    await screen.findByText("Alteração confirmada.");
    expect(state.rpc.mock.calls.filter(c => c[0] === "link_partner_user").at(-1)?.[1].p_expected).toBe("c".repeat(32));
  });
  it("actor change during mutation never publishes previous actor success", async () => {
    let resolve: (v: { data: unknown; error: unknown }) => void = () => {};
    const original = state.rpc.getMockImplementation();
    state.rpc.mockImplementation((name, args) => name === "link_partner_user" ? { abortSignal: () => new Promise(r => { resolve = r; }) } : original?.(name, args));
    const { qc, element, view } = mount(); await screen.findByRole("button", { name: "Confirmar perfis" });
    fireEvent.change(screen.getByRole("textbox", { name: "Motivo" }), { target: { value: "Revisão autorizada" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar perfis" }));
    state.scope = "actor-B"; state.roles = ["parceiro_b2b_tecnico"]; view.rerender(element());
    await screen.findByRole("checkbox", { name: "Consultor técnico B2B" });
    resolve({ data: { ok: true, user_id: userId, partner_id: partnerId, version: "b".repeat(32), action: "assign", reader_activation: false }, error: null });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Consultor técnico B2B" })).toBeChecked());
    expect(screen.queryByText("Alteração confirmada.")).not.toBeInTheDocument();
    expect(qc.getQueryCache().getAll().some(q => String(q.queryKey[1]).includes("actor-A"))).toBe(false);
  });
});