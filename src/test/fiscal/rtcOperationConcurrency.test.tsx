import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFiscalRtcCompany, useFiscalRtcItem } from "@/hooks/useFiscalRtc";

const s = vi.hoisted(() => ({ rpc: vi.fn(), actor: "A", org: "OA", ready: true, epoch: 0 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => s.rpc(...args) } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: s.actor }, session: { user: { id: s.actor } }, profile: { id: s.actor, user_id: s.actor, organization_id: s.org, ativo: true, senha_provisoria: false }, roles: ["superadmin", "administrador"], loading: false, error: null, authzReady: s.ready, authzEpoch: s.epoch, checkAuthzAccess: () => s.ready }) }));

function deferred() {
  let resolve: (v: unknown) => void = () => {};
  let reject: (v: unknown) => void = () => {};
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => { s.actor = "A"; s.org = "OA"; s.ready = true; s.epoch = 0; s.rpc.mockReset(); });

for (const kind of ["company", "product", "service", "service_profile"] as const) {
  describe(`${kind}: operações reais do hook, Auth/transporte simulados`, () => {
    const original = kind === "company" ? { schema_version: 1 as const, rtc_environment: "HOMOLOGATION" as const } : { schema_version: 1 as const, ibs_rate: 1 };
    const changed = kind === "company" ? { schema_version: 1 as const, rtc_environment: "NOT_CONFIGURED" as const } : { schema_version: 1 as const, ibs_rate: 2 };
    const response = (revision: string, configuration = original) => ({ data: { revision, configuration, exists: true }, error: null });
    async function setup() {
      s.rpc.mockResolvedValue(response("R1"));
      const h = renderHook(() => kind === "company" ? useFiscalRtcCompany() : useFiscalRtcItem(kind, "item-A"));
      await waitFor(() => expect(h.result.current.revision).toBe("R1"));
      return h;
    }

    it("leitura/leitura fora de ordem mantém o envelope mais recente", async () => {
      const h = await setup(); const old = deferred(); const latest = deferred();
      s.rpc.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
      let p1: Promise<void>; let p2: Promise<void>;
      act(() => { p1 = h.result.current.reload(); p2 = h.result.current.reload(); });
      await act(async () => { latest.resolve(response("R2", changed)); await p2; });
      await act(async () => { old.resolve(response("R1")); await p1; });
      expect(h.result.current.revision).toBe("R2"); expect(h.result.current.data).toEqual(changed);
      expect(h.result.current.loading).toBe(false);
    });

    it("reload iniciado antes do save não restaura R1 depois do retorno R2", async () => {
      const h = await setup(); const old = deferred(); s.rpc.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response("R2", changed));
      let read: Promise<void>; act(() => { read = h.result.current.reload(); });
      await act(async () => { expect(await h.result.current.save(changed)).toEqual({ ok: true }); });
      await act(async () => { old.resolve(response("R1")); await read; });
      expect(h.result.current.revision).toBe("R2"); expect(h.result.current.data).toEqual(changed);
      expect(h.result.current.saving).toBe(false); expect(h.result.current.loading).toBe(false);
    });

    it("reload durante save não envia leitura nem descarta o save", async () => {
      const h = await setup(); const save = deferred(); s.rpc.mockReturnValueOnce(save.promise);
      let pending: Promise<unknown>; act(() => { pending = h.result.current.save(changed); });
      await act(async () => { await h.result.current.reload(); });
      expect(s.rpc).toHaveBeenCalledTimes(2); expect(h.result.current.saving).toBe(true);
      await act(async () => { save.resolve(response("R2", changed)); expect(await pending).toEqual({ ok: true }); });
      expect(h.result.current.revision).toBe("R2"); expect(h.result.current.data).toEqual(changed);
    });

    it("duplo save síncrono envia só uma RPC com R1; próximo save usa R2", async () => {
      const h = await setup(); const save = deferred(); s.rpc.mockReturnValueOnce(save.promise);
      let first: Promise<unknown>; let duplicate: Promise<unknown>;
      act(() => { const submit = h.result.current.save; first = submit(changed); duplicate = submit(changed); });
      expect(s.rpc).toHaveBeenCalledTimes(2);
      await act(async () => { expect(await duplicate).toEqual({ ok: false }); save.resolve(response("R2", changed)); expect(await first).toEqual({ ok: true }); });
      s.rpc.mockResolvedValueOnce(response("R3", changed));
      await act(async () => { expect(await h.result.current.save(changed)).toEqual({ ok: true }); });
      expect(s.rpc.mock.calls[2]?.[1]?.expected_revision).toBe("R2");
    });

    it("exceção de save libera sua trava sem perder R1; retry somente manual", async () => {
      const h = await setup(); s.rpc.mockRejectedValueOnce(new Error("network"));
      await act(async () => { expect(await h.result.current.save(changed)).toEqual({ ok: false }); });
      expect(h.result.current.saving).toBe(false); expect(h.result.current.revision).toBe("R1"); expect(h.result.current.data).toEqual(original);
      expect(s.rpc).toHaveBeenCalledTimes(2);
      s.rpc.mockResolvedValueOnce(response("R2", changed));
      await act(async () => { expect(await h.result.current.save(changed)).toEqual({ ok: true }); });
    });

    it("exceção de reload encerra loading e mantém revisão existente", async () => {
      const h = await setup(); s.rpc.mockRejectedValueOnce(new Error("network"));
      await act(async () => { await h.result.current.reload(); });
      expect(h.result.current.loading).toBe(false); expect(h.result.current.revision).toBe("R1");
      expect(h.result.current.data).toEqual(original); expect(h.result.current.error).not.toBeNull();
      expect(s.rpc).toHaveBeenCalledTimes(2);
    });

    it("conflito não rebaseia R1 nem adota reload anterior ou repete escrita", async () => {
      const h = await setup(); const old = deferred(); s.rpc.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "FISCAL_CONFLICT" } });
      let read: Promise<void>; act(() => { read = h.result.current.reload(); });
      await act(async () => { expect(await h.result.current.save(changed)).toEqual({ ok: false }); });
      await act(async () => { old.resolve(response("R0", changed)); await read; });
      expect(h.result.current.revision).toBe("R1"); expect(h.result.current.data).toEqual(original);
      expect(h.result.current.error).not.toBeNull(); expect(s.rpc).toHaveBeenCalledTimes(3);
    });

    it("finally de A revogado não libera save de nova scope nem adota dados de A", async () => {
      const h = await setup(); const old = deferred(); s.rpc.mockReturnValueOnce(old.promise);
      let first: Promise<unknown>; act(() => { first = h.result.current.save(changed); });
      s.ready = false; s.epoch++; h.rerender();
      expect(h.result.current.data).toBeNull(); expect(h.result.current.saving).toBe(false);
      s.actor = "B"; s.org = "OB"; s.ready = true; s.epoch++; s.rpc.mockResolvedValueOnce(response("RB")); h.rerender();
      await waitFor(() => expect(h.result.current.revision).toBe("RB"));
      const next = deferred(); s.rpc.mockReturnValueOnce(next.promise);
      let second: Promise<unknown>; act(() => { second = h.result.current.save(changed); });
      await act(async () => { old.reject(new Error("late A")); expect(await first).toEqual({ ok: false }); });
      expect(h.result.current.saving).toBe(true); expect(h.result.current.revision).toBe("RB");
      await act(async () => { expect(await h.result.current.save(changed)).toEqual({ ok: false }); });
      expect(s.rpc).toHaveBeenCalledTimes(4);
      await act(async () => { next.resolve(response("RB2", changed)); expect(await second).toEqual({ ok: true }); });
      expect(h.result.current.revision).toBe("RB2"); expect(h.result.current.saving).toBe(false);
    });
  });
}