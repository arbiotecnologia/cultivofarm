import "fake-indexeddb/auto";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetOfflineDbForTests, getPendingCampoByRegistro, savePendingCampo, saveSyncedVisitMapping } from "@/lib/offlineDb";

const s = vi.hoisted(() => ({ rpc: vi.fn(), auth: { user: { id: "A" }, profile: { user_id: "A", organization_id: "AR", ativo: true }, roles: ["consultor_tecnico"], loading: false, authzReady: true, authzEpoch: 0 } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => s.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: s.rpc, auth: { getUser: async () => ({ data: { user: s.auth.user } }) },
  from: (table: string) => { if (table !== "sync_log") throw new Error(`unexpected_table:${table}`); return { insert: async () => ({ error: null }) }; },
} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
import { useOfflineSync } from "@/hooks/useOfflineSync";
const REMOTE = "11111111-1111-4111-8111-111111111111";
const CU = "22222222-2222-4222-8222-222222222222";
const envelope = () => ({ data: { id: "33333333-3333-4333-8333-333333333333", registro_consultor_id: REMOTE, client_uuid: CU, versao: 1, replayed: false }, error: null });
const entry = (patch: Record<string, unknown> = {}) => ({ localRegistroId: "local", remoteRegistroId: REMOTE, clientUuid: CU, payload: { fase_fenologica: "V4" }, versao: 0, updatedAt: "x", syncStatus: "pending_sync" as const, ownerUserId: "A", ownerOrganizationId: "AR", ...patch });
let client: QueryClient;
beforeEach(async () => {
  s.rpc.mockReset(); s.rpc.mockResolvedValue(envelope()); s.auth.authzEpoch = 0; s.auth.profile.organization_id = "AR";
  Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  await __resetOfflineDbForTests(); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); });
function mount() {
  const h = renderHook(() => useOfflineSync(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true }); return h;
}
it("fila Campo completa resolve mapping, despacha contrato único e limpa somente após envelope", async () => {
  await savePendingCampo(entry({ remoteRegistroId: null }));
  await saveSyncedVisitMapping({ localId: "local", clientUuid: CU, remoteId: REMOTE, version: 1, syncedAt: Date.now() });
  const h = mount(); await act(async () => { await h.result.current.syncAll(); });
  expect(s.rpc).toHaveBeenCalledExactlyOnceWith("rpc_salvar_campo_visita", { p_registro_consultor_id: REMOTE, p_client_uuid: CU, p_payload: { fase_fenologica: "V4" }, p_versao: 0 });
  expect(await getPendingCampoByRegistro("local")).toBeNull(); expect(h.result.current.progress.completed).toBe(1);
});
it.each([
  ["outro dono", { ownerUserId: "B" }], ["outro tenant", { ownerOrganizationId: "FSF" }],
  ["sem pai", { remoteRegistroId: null }], ["CAS inválido", { versao: Number.NaN }],
])("%s retém pendência sem RPC", async (_name, patch) => {
  await savePendingCampo(entry(patch)); const h = mount(); await act(async () => { await h.result.current.syncAll(); });
  expect(s.rpc).not.toHaveBeenCalled(); expect(await getPendingCampoByRegistro("local")).not.toBeNull();
});
it.each(["PT409", "42501", "08006"])("%s preserva fila e não repete automaticamente", async code => {
  await savePendingCampo(entry()); s.rpc.mockResolvedValue({ data: null, error: { code, message: code } });
  const h = mount(); await act(async () => { await h.result.current.syncAll(); await h.result.current.syncAll(); });
  expect(s.rpc).toHaveBeenCalledTimes(1);
  expect((await getPendingCampoByRegistro("local"))?.syncStatus).toBe(code === "PT409" ? "conflict" : "sync_error");
});
it.each([{}, { ...envelope().data, registro_consultor_id: CU }, { ...envelope().data, versao: 2 }])("ACK inválido %j mantém pendência", async data => {
  await savePendingCampo(entry()); s.rpc.mockResolvedValue({ data, error: null });
  const h = mount(); await act(async () => { await h.result.current.syncAll(); });
  expect((await getPendingCampoByRegistro("local"))?.syncStatus).toBe("sync_error"); expect(h.result.current.progress.completed).toBe(0);
});
it.each(["epoch", "tenant", "nova revisão"])("%s durante RPC não apaga nem confirma pendência antiga", async mode => {
  await savePendingCampo(entry()); let finish: ((v: ReturnType<typeof envelope>) => void) | undefined;
  s.rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; })); const h = mount(); let pending: Promise<void> | undefined;
  await act(async () => { pending = h.result.current.syncAll(); });
  // IndexedDB is asynchronous: wait until the actual mocked dispatch is reached.
  const { waitFor } = await import("@testing-library/react"); await waitFor(() => expect(s.rpc).toHaveBeenCalledTimes(1));
  if (mode === "nova revisão") await savePendingCampo(entry({ payload: { fase_fenologica: "V5" } }));
  else { if (mode === "epoch") s.auth.authzEpoch++; else s.auth.profile.organization_id = "FSF"; h.rerender(); }
  await act(async () => { finish?.(envelope()); await pending; });
  expect(await getPendingCampoByRegistro("local")).not.toBeNull(); expect(h.result.current.progress.completed).toBe(0);
  if (mode === "nova revisão") expect((await getPendingCampoByRegistro("local"))?.payload).toEqual({ fase_fenologica: "V5" });
});