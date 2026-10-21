import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { __resetOfflineDbForTests, savePendingRecomendacao, getAllPendingRecomendacoes, type PendingRecomendacao } from "@/lib/offlineDb";
const state = vi.hoisted(() => ({ user: "A", org: "TA", epoch: 0, calls: [] as [string, any][], conflict: false, defer: null as Promise<void> | null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: state.user }, profile: { user_id: state.user, organization_id: state.org } }) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({ ready: !!state.user, capture: () => {
  const epoch = state.epoch; return () => !!state.user && state.epoch === epoch;
} }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: state.user } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: state.user, organization_id: state.org, ativo: true }, error: null }) }) }) }),
  rpc: async (name: string, args: any) => {
    state.calls.push([name, args]); if (state.defer) await state.defer;
    if (name === "rpc_get_visita_workspace") return { data: { registro: { id: args.p_registro_id }, permissions: { can_edit: true } }, error: null };
    return { data: { id: "rec", versao: 1, client_uuid: args.p_client_uuid }, error: state.conflict ? { message: "version_conflict" } : null };
  },
} }));
import { useOfflineSync } from "@/hooks/useOfflineSync";
const entry = (patch: Partial<PendingRecomendacao> = {}): PendingRecomendacao => ({ clientUuid: "idempotent-rec", localRegistroId: "local",
  remoteRegistroId: "remote-explicit", ownerUserId: "A", ownerOrganizationId: "TA", versionContract: "expected_v1",
  payload: { recomendacao_tecnica: "Sintética", encaminhar_para_os: false }, versao: 1, updatedAt: "1", syncStatus: "pending_sync", ...patch });
beforeEach(async () => { Object.assign(state, { user: "A", org: "TA", epoch: 0, calls: [], conflict: false, defer: null });
  Object.defineProperty(navigator, "onLine", { value: false, configurable: true }); await __resetOfflineDbForTests(); });
function setup() {
  const hook = renderHook(() => useOfflineSync());
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true }); return hook;
}
it("Sincronizar recupera visita já remota sem mapping, mantém UUID e só remove após prova", async () => {
  await savePendingRecomendacao(entry()); const h = setup();
  await act(async () => { await h.result.current.syncAll(); });
  expect(state.calls).toEqual([
    ["rpc_get_visita_workspace", { p_registro_id: "remote-explicit" }],
    ["rpc_upsert_recomendacao_visita", expect.objectContaining({ p_client_uuid: "idempotent-rec", p_expected_versao: 1 })],
  ]);
  expect(await getAllPendingRecomendacoes()).toEqual([]);
});
it("conflito continua na fila com versão e payload originais", async () => {
  state.conflict = true; await savePendingRecomendacao(entry({ versao: 3 })); const h = setup();
  await act(async () => { await h.result.current.syncAll(); });
  expect(await getAllPendingRecomendacoes()).toEqual([expect.objectContaining({ versao: 3, syncStatus: "sync_error", lastSyncError: "version_conflict" })]);
});
it("fila de B e legado sem autoria não são enviados nem reescritos", async () => {
  const foreign = entry({ ownerUserId: "B" }); await savePendingRecomendacao(foreign);
  const h = setup(); await act(async () => { await h.result.current.syncAll(); });
  expect(state.calls).toHaveLength(0); expect(await getAllPendingRecomendacoes()).toEqual([{ ...foreign, syncingAt: null }]);
});
for (const change of ["logout", "tenant", "epoch"]) it(`${change} sem unmount preserva pendência e bloqueia envio tardio`, async () => {
  await savePendingRecomendacao(entry()); let release = () => {}; state.defer = new Promise<void>(r => { release = r; });
  const h = setup(); let running: Promise<void> | undefined;
  act(() => { running = h.result.current.syncAll(); });
  await waitFor(() => expect(state.calls).toHaveLength(1));
  if (change === "logout") state.user = ""; else if (change === "tenant") state.org = "TB"; else state.epoch++;
  h.rerender(); await act(async () => { release(); await running; });
  expect(state.calls).toHaveLength(1);
  expect(await getAllPendingRecomendacoes()).toEqual([expect.objectContaining({ syncStatus: "pending_sync", updatedAt: "1" })]);
});