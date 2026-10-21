import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { __resetOfflineDbForTests, savePendingRecomendacao, getAllPendingRecomendacoes, removePendingRecomendacao, updatePendingRecomendacao, type PendingRecomendacao } from "@/lib/offlineDb";
import { recomendacaoExpectedVersion, recomendacaoValidationError, REC_ENUM_OPTIONS } from "@/lib/visita/recomendacaoContract";
const state = vi.hoisted(() => ({ user: "A", org: "TA", valid: true, allowed: true, conflict: false, calls: [] as [string, any][], defer: null as Promise<void> | null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: state.user } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: state.user, organization_id: state.org, ativo: true }, error: null }) }) }) }),
  rpc: async (name: string, args: any) => {
    state.calls.push([name, args]);
    if (state.defer) await state.defer;
    if (name === "rpc_get_visita_workspace") return { data: { registro: { id: args.p_registro_id }, permissions: { can_edit: state.allowed } }, error: null };
    return { data: { id: "rec", versao: args.p_expected_versao, client_uuid: args.p_client_uuid }, error: state.conflict ? { message: "version_conflict" } : null };
  },
} }));
import { syncRecomendacao } from "@/lib/visita/syncRecomendacao";
const actor = { userId: "A", organizationId: "TA" };
const entry = (patch: Partial<PendingRecomendacao> = {}): PendingRecomendacao => ({
  clientUuid: "rec-client", localRegistroId: "local", remoteRegistroId: "explicit-remote",
  ownerUserId: "A", ownerOrganizationId: "TA", versionContract: "expected_v1",
  versao: 1, payload: { recomendacao_tecnica: "Fictícia", objetivo_recomendacao: "preventivo", encaminhar_para_os: false },
  updatedAt: "original", syncStatus: "pending_sync", ...patch,
});
beforeEach(async () => { Object.assign(state, { user: "A", org: "TA", valid: true, allowed: true, conflict: false, calls: [], defer: null }); await __resetOfflineDbForTests(); });
describe("contrato mínimo de recomendação", () => {
  it("criação envia 1", () => expect(recomendacaoExpectedVersion(null)).toBe(1));
  it("edição envia versão existente, não sucessora", () => expect(recomendacaoExpectedVersion({ versao: 7, isPending: false })).toBe(7));
  it("editar nova pendência mantém 1", () => expect(recomendacaoExpectedVersion({ versao: 1, isPending: true })).toBe(1));
  for (const field of Object.keys(REC_ENUM_OPTIONS) as (keyof typeof REC_ENUM_OPTIONS)[]) {
    it(`${field}: rejeita texto livre sem normalizar`, () => expect(recomendacaoValidationError({ [field]: "controle_praga" })).not.toBeNull());
    for (const [value] of REC_ENUM_OPTIONS[field]) it(`${field}: aceita ${value}`, () => expect(recomendacaoValidationError({ [field]: value })).toBeNull());
  }
  it("campos opcionais vazios continuam válidos", () => expect(recomendacaoValidationError({ objetivo_recomendacao: "", estrategia_manejo: null })).toBeNull());
  it("visita remota sem mapping exige workspace e envia ID explícito", async () => {
    await syncRecomendacao(entry(), actor, "explicit-remote", () => state.valid);
    expect(state.calls.map(c => c[0])).toEqual(["rpc_get_visita_workspace", "rpc_upsert_recomendacao_visita"]);
    expect(state.calls[1][1]).toMatchObject({ p_registro_id: "explicit-remote", p_expected_versao: 1 });
  });
  it("preserva conflito e não reconsulta versão para sobrescrever", async () => {
    state.conflict = true;
    await expect(syncRecomendacao(entry({ versao: 4 }), actor, "explicit-remote", () => state.valid)).rejects.toMatchObject({ message: "version_conflict" });
    expect(state.calls).toHaveLength(2);
  });
  for (const patch of [{ ownerUserId: "B" }, { ownerOrganizationId: "TB" }, { ownerUserId: undefined }, { versionContract: undefined }] as Partial<PendingRecomendacao>[]) {
    it(`não adota fila ${JSON.stringify(patch)}`, async () => {
      await expect(syncRecomendacao(entry(patch), actor, "explicit-remote", () => true)).rejects.toThrow();
      expect(state.calls).toHaveLength(0);
    });
  }
  it("UUID sozinho não autoriza", async () => {
    state.allowed = false;
    await expect(syncRecomendacao(entry(), actor, "explicit-remote", () => true)).rejects.toThrow("forbidden_visita");
    expect(state.calls).toHaveLength(1);
  });
  it("sem ID remoto mantém bloqueio explícito", async () => {
    await expect(syncRecomendacao(entry(), actor, null, () => true)).rejects.toThrow("parent_unresolved"); expect(state.calls).toHaveLength(0);
  });
  for (const change of ["logout", "tenant", "epoch"]) it(`${change} durante prova impede envio tardio`, async () => {
    let release = () => {}; state.defer = new Promise<void>(r => { release = r; });
    const promise = syncRecomendacao(entry(), actor, "explicit-remote", () => state.valid);
    await vi.waitFor(() => expect(state.calls).toHaveLength(1));
    if (change === "logout") state.user = ""; else if (change === "tenant") state.org = "TB"; else state.valid = false;
    release(); await expect(promise).rejects.toThrow("context_changed"); expect(state.calls).toHaveLength(1);
  });
  it("CAS não remove nem altera edição posterior", async () => {
    await savePendingRecomendacao(entry());
    await savePendingRecomendacao(entry({ updatedAt: "new", payload: { recomendacao_tecnica: "Novo rascunho" } }));
    await removePendingRecomendacao("rec-client", "original");
    await updatePendingRecomendacao("rec-client", { syncStatus: "sync_error" }, "original");
    expect(await getAllPendingRecomendacoes()).toEqual([expect.objectContaining({ updatedAt: "new", syncStatus: "pending_sync" })]);
  });
});