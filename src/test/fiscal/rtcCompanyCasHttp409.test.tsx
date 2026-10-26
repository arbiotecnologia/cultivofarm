import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFiscalRtcCompany, useFiscalRtcItem } from "@/hooks/useFiscalRtc";

const s = vi.hoisted(() => ({ rpc: vi.fn(), actor: "A", org: "OA", roles: ["administrador"], ready: true, epoch: 0 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => s.rpc(...args) } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: s.actor }, session: { user: { id: s.actor } }, profile: { id: s.actor, user_id: s.actor, organization_id: s.org, ativo: true, senha_provisoria: false }, roles: s.roles, loading: false, error: null, authzReady: s.ready, authzEpoch: s.epoch, checkAuthzAccess: () => s.ready }) }));
const configuration = { schema_version: 1, rtc_environment: "HOMOLOGATION" } as const;
const envelope = { configuration, revision: "2026-10-26T23:00:00.000001Z", exists: true };
const changed = { ...configuration, rtc_environment: "NOT_CONFIGURED" } as const;

beforeEach(() => {
  s.actor = "A"; s.org = "OA"; s.roles = ["administrador"]; s.ready = true; s.epoch = 0; s.rpc.mockReset();
  s.rpc.mockResolvedValue({ data: envelope, error: null });
});

describe("RTC — hook real, transporte simulado, sem prova JWT/RLS", () => {
  for (const message of ["FISCAL_CONFLICT", "FISCAL_COMPANY_AMBIGUOUS"]) {
    it(`${message}: preserva revisão/dados, não repete save nem reporta sucesso`, async () => {
      const h = renderHook(() => useFiscalRtcCompany());
      await waitFor(() => expect(h.result.current.revision).toBe(envelope.revision));
      s.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message } });
      let result: unknown;
      await act(async () => { result = await h.result.current.save(changed); });
      expect(result).toEqual({ ok: false });
      expect(h.result.current.revision).toBe(envelope.revision);
      expect(h.result.current.data).toEqual(configuration);
      expect(h.result.current.error).toContain(message === "FISCAL_CONFLICT" ? "alterados por outra pessoa" : "mais de um cadastro");
      expect(s.rpc.mock.calls.filter(c => c[0] === "rpc_fiscal_company_rtc_save")).toEqual([["rpc_fiscal_company_rtc_save", { payload: changed, expected_revision: envelope.revision }]]);
      expect(s.rpc).toHaveBeenCalledTimes(2);
    });
  }
  it("revisão ausente chega NULL ao servidor e PT409 não é sucesso", async () => {
    s.rpc.mockResolvedValueOnce({ data: { ...envelope, revision: "" }, error: null });
    const h = renderHook(() => useFiscalRtcCompany());
    await waitFor(() => expect(h.result.current.data).toEqual(configuration));
    s.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "FISCAL_CONFLICT" } });
    await act(async () => { expect(await h.result.current.save(changed)).toEqual({ ok: false }); });
    expect(s.rpc).toHaveBeenLastCalledWith("rpc_fiscal_company_rtc_save", { payload: changed, expected_revision: null });
    expect(h.result.current.revision).toBe("");
  });
  it("B sem cadastro: PT404 contextual, sem save/retry automático", async () => {
    s.actor = "B"; s.org = "OB";
    s.rpc.mockResolvedValue({ data: null, error: { code: "PT404", message: "FISCAL_COMPANY_NOT_INITIALIZED" } });
    const h = renderHook(() => useFiscalRtcCompany());
    await waitFor(() => expect(h.result.current.error).toContain("Configure a empresa fiscal"));
    expect(h.result.current.data).toBeNull(); expect(s.rpc).toHaveBeenCalledTimes(1);
  });
  it("sucesso tardio A não é adotado por B; revogação impede save", async () => {
    const h = renderHook(() => useFiscalRtcCompany());
    await waitFor(() => expect(h.result.current.data).toEqual(configuration));
    let finish: (v: unknown) => void = () => {};
    s.rpc.mockImplementationOnce(() => new Promise(r => { finish = r; }));
    let pending: Promise<unknown> = Promise.resolve();
    act(() => { pending = h.result.current.save(changed); });
    s.actor = "B"; s.org = "OB"; s.ready = false; h.rerender();
    await act(async () => { finish({ data: { ...envelope, configuration: changed }, error: null }); expect(await pending).toEqual({ ok: false }); });
    expect(h.result.current.data).toBeNull(); expect(h.result.current.revision).toBe("");
    await act(async () => { expect(await h.result.current.save(changed)).toEqual({ ok: false }); });
    expect(s.rpc).toHaveBeenCalledTimes(2);
  });
});

describe("IBS/CBS de serviços globais — autorização existente, hook real", () => {
  for (const kind of ["service", "service_profile"] as const) {
    for (const role of ["administrador", "financeiro"]) it(`${kind}: ${role} não envia escrita global`, async () => {
      s.roles = [role];
      s.rpc.mockResolvedValue({ data: { ...envelope, configuration: { schema_version: 1 } }, error: null });
      const h = renderHook(() => useFiscalRtcItem(kind, "profile-A"));
      await waitFor(() => expect(h.result.current.data).toEqual({ schema_version: 1 }));
      await act(async () => { expect(await h.result.current.save({ schema_version: 1 })).toEqual({ ok: false }); });
      expect(s.rpc).toHaveBeenCalledTimes(1);
    });
    it(`${kind}: Superadmin envia CAS uma vez; PT409 preserva configuração`, async () => {
      s.roles = ["superadmin"];
      s.rpc.mockResolvedValue({ data: { ...envelope, configuration: { schema_version: 1 } }, error: null });
      const h = renderHook(() => useFiscalRtcItem(kind, "profile-A"));
      await waitFor(() => expect(h.result.current.data).toEqual({ schema_version: 1 }));
      s.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "FISCAL_CONFLICT" } });
      await act(async () => { expect(await h.result.current.save({ schema_version: 1 })).toEqual({ ok: false }); });
      expect(s.rpc).toHaveBeenLastCalledWith(kind === "service" ? "rpc_fiscal_service_ibs_cbs_save" : "rpc_fiscal_service_profile_ibs_cbs_save", { [kind === "service" ? "p_service_id" : "p_profile_id"]: "profile-A", payload: { schema_version: 1 }, expected_revision: envelope.revision });
      expect(s.rpc).toHaveBeenCalledTimes(2); expect(h.result.current.revision).toBe(envelope.revision);
    });
    it(`${kind}: revogação durante escrita descarta sucesso e impede replay`, async () => {
      s.roles = ["superadmin"];
      const itemEnvelope = { ...envelope, configuration: { schema_version: 1 } };
      s.rpc.mockResolvedValue({ data: itemEnvelope, error: null });
      const h = renderHook(() => useFiscalRtcItem(kind, "profile-A"));
      await waitFor(() => expect(h.result.current.data).toEqual({ schema_version: 1 }));
      let finish: (v: unknown) => void = () => {};
      s.rpc.mockImplementationOnce(() => new Promise(r => { finish = r; }));
      let pending: Promise<unknown> = Promise.resolve();
      act(() => { pending = h.result.current.save({ schema_version: 1 }); });
      s.ready = false; s.roles = ["financeiro"]; h.rerender();
      await act(async () => { finish({ data: itemEnvelope, error: null }); expect(await pending).toEqual({ ok: false }); });
      expect(h.result.current.data).toBeNull();
      await act(async () => { expect(await h.result.current.save({ schema_version: 1 })).toEqual({ ok: false }); });
      expect(s.rpc).toHaveBeenCalledTimes(2);
    });
  }
});