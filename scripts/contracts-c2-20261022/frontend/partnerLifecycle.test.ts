import { describe, it, expect, vi } from "vitest";
import { buildLifecycleInput, submitLifecycle, type LifecycleInput } from "./partnerLifecycle";
const input: LifecycleInput = { partnerId: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000002", roles: ["parceiro_b2b", "parceiro_b2b_tecnico", "cliente_produtor"], action: "assign", expected: "a".repeat(32), key: "00000000-0000-4000-8000-000000000003", reason: "Revisão autorizada" };
describe("C2 lifecycle candidate, not live authorization", () => {
  it("accepts all three external capabilities without internal manager authority", () => {
    expect(buildLifecycleInput(input).p_roles).toEqual(["cliente_produtor", "parceiro_b2b", "parceiro_b2b_tecnico"]);
  });
  it("rejects internal manager escalation", () => {
    expect(() => buildLifecycleInput({ ...input, roles: ["gestor" as never] })).toThrow("c2_invalid_input");
  });
  it.each(["assign", "revoke_roles", "unlink", "reactivate"] as const)("uses canonical overload for %s and preserves receiver", async action => {
    const client = { rpc: vi.fn(function(this: unknown, name: string, args: Record<string, unknown>) {
      expect(this).toBe(client); expect(name).toBe("link_partner_user"); expect(args.p_action).toBe(action);
      return { abortSignal: async () => ({ data: { ok: true, user_id: input.userId, partner_id: input.partnerId, version: "b".repeat(32), action, reader_activation: false }, error: null }) };
    }) };
    expect((await submitLifecycle(client, { ...input, action }, new AbortController().signal, () => true)).version).toBe("b".repeat(32));
  });
  it.each(["tenant", "logout", "epoch", "old context"])("rejects late success after %s", async () => {
    let current = true;
    let resolve: (v: { data: unknown; error: unknown }) => void = () => {};
    const client = { rpc: () => ({ abortSignal: () => new Promise<{ data: unknown; error: unknown }>(r => { resolve = r; }) }) };
    const result = submitLifecycle(client, input, new AbortController().signal, () => current);
    current = false; resolve({ data: { ok: true }, error: null });
    await expect(result).rejects.toThrow("c2_context_changed");
  });
  it("preserves CAS conflict and does not retry", async () => {
    const error = { code: "40001", message: "c2_version_conflict" };
    const client = { rpc: vi.fn(() => ({ abortSignal: async () => ({ data: null, error }) })) };
    await expect(submitLifecycle(client, input, new AbortController().signal, () => true)).rejects.toBe(error);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not call RPC with expired fence", async () => {
    const client = { rpc: vi.fn() };
    await expect(submitLifecycle(client, input, new AbortController().signal, () => false)).rejects.toThrow("c2_context_changed");
    expect(client.rpc).not.toHaveBeenCalled();
  });
});