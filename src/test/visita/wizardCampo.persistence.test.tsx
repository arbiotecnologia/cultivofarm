import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// Real QueryClient + real IndexedDB (fake-indexeddb) + real useStorageAccessScope.
// Only the transport (supabase) and the auth snapshot are simulated.
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), lookup: vi.fn(), online: true,
  auth: {
    user: { id: "user-a" } as { id: string } | null,
    profile: { user_id: "user-a", organization_id: "org-a", ativo: true } as Record<string, unknown> | null,
    roles: ["consultor_tecnico"], loading: false, authzReady: true, authzEpoch: 0,
  },
}));
const chain = () => {
  const c: Record<string, unknown> = {};
  c.select = () => c; c.eq = () => c; c.order = async () => ({ data: [], error: null });
  c.maybeSingle = () => mocks.lookup();
  return c;
};
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: () => chain() } }));
vi.mock("@/hooks/useOfflineSync", () => ({ useOnlineStatus: () => mocks.online }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/hooks/useTenantCatalogVisibility", () => ({
  useTenantSelection: () => ({ isSuccess: true, isFetching: false, data: { rows: [], total: 0 } }),
}));
// Radix Select portals/poppers schedule async updates outside act; tests never interact with
// selects, so a static stub keeps act warnings out without changing component behavior.
vi.mock("@/components/ui/select", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return { Select: Pass, SelectTrigger: Pass, SelectValue: () => null, SelectContent: () => null, SelectItem: () => null };
});
import WizardCampoStep from "@/pages/app/wizard/WizardCampoStep";
import { isCampoConflict, parseCampoResult } from "@/lib/visita/campoContract";
import { claimPendingCampo, finishPendingCampo, getPendingCampoByRegistro, savePendingCampo } from "@/lib/offlineDb";

const REMOTE = "11111111-1111-4111-8111-111111111111";
const CU = "22222222-2222-4222-8222-222222222222";
const ROW_ID = "33333333-3333-4333-8333-333333333333";
const env = (versao: number, extra: Record<string, unknown> = {}) =>
  ({ id: ROW_ID, registro_consultor_id: REMOTE, versao, client_uuid: CU, replayed: false, ...extra });
let n = 0; let local = "";
let qc: QueryClient;
const ui = (el: ReactElement) => <QueryClientProvider client={qc}>{el}</QueryClientProvider>;
const props = () => ({ localRegistroId: local, remoteRegistroId: REMOTE, clienteId: null, clientUuid: CU, locked: false });
beforeEach(() => {
  vi.clearAllMocks(); mocks.online = true; n += 1; local = `local-${n}`;
  mocks.auth.user = { id: "user-a" }; mocks.auth.profile = { user_id: "user-a", organization_id: "org-a", ativo: true };
  mocks.auth.roles = ["consultor_tecnico"]; mocks.auth.authzEpoch = 0; mocks.auth.authzReady = true;
  mocks.lookup.mockResolvedValue({ data: null, error: null });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); cleanup(); vi.useRealTimers(); });
const fase = () => screen.getByLabelText("Fase fenológica") as HTMLInputElement;
const typeFase = (v: string) => { act(() => { fireEvent.change(fase(), { target: { value: v } }); }); };
const advance = () => fireEvent.click(screen.getByRole("button", { name: "Salvar e avançar" }));
const deferred = <T,>() => { let resolve!: (v: T) => void; const p = new Promise<T>((r) => { resolve = r; }); return { p, resolve }; };

it("erro 403 na hidratação bloqueia formulário e save (sem cair para rascunho/versão 0); reconsulta sem recarregar", async () => {
  mocks.lookup.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied" } });
  const done = vi.fn(); render(ui(<WizardCampoStep {...props()} onDone={done} />));
  expect(await screen.findByText("Não foi possível confirmar os dados de campo atuais desta visita.")).toBeTruthy();
  expect(screen.queryByLabelText("Fase fenológica")).toBeNull();
  expect(screen.queryByRole("button", { name: "Salvar e avançar" })).toBeNull();
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.lookup.mockResolvedValueOnce({ data: { id: ROW_ID, registro_consultor_id: REMOTE, versao: 4, fase_fenologica: "R1" }, error: null });
  fireEvent.click(screen.getByRole("button", { name: "Reconsultar" }));
  await waitFor(() => expect(fase().value).toBe("R1"));
  mocks.rpc.mockResolvedValueOnce({ data: env(5), error: null });
  typeFase("R2"); advance();
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_versao: 4 });
});

it("linha remota de outra visita ou versão inválida não hidrata o formulário", async () => {
  mocks.lookup.mockResolvedValue({ data: { id: ROW_ID, registro_consultor_id: "outra", versao: 2, fase_fenologica: "X" }, error: null });
  render(ui(<WizardCampoStep {...props()} onDone={vi.fn()} />));
  expect(await screen.findByText("Não foi possível confirmar os dados de campo atuais desta visita.")).toBeTruthy();
  expect(screen.queryByLabelText("Fase fenológica")).toBeNull();
});

it("PT409 marca conflito, não reenfileira no debounce e só salva após revisão explícita sobre a versão atual", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "version_conflict" } });
  const done = vi.fn(); render(ui(<WizardCampoStep {...props()} onDone={done} />));
  await screen.findByLabelText("Fase fenológica");
  typeFase("V4"); advance();
  expect(await screen.findByText("Conflito — revise antes de salvar")).toBeTruthy();
  expect((await getPendingCampoByRegistro(local))?.syncStatus).toBe("conflict");
  vi.useFakeTimers();
  typeFase("V5");
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  vi.useRealTimers();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(fase().value).toBe("V5"); expect(done).not.toHaveBeenCalled();
  mocks.lookup.mockResolvedValueOnce({ data: { id: ROW_ID, registro_consultor_id: REMOTE, versao: 7, fase_fenologica: "S" }, error: null });
  fireEvent.click(screen.getByRole("button", { name: "Reconsultar dados atuais" }));
  const confirm = await screen.findByRole("button", { name: "Salvar meu rascunho sobre a versão 7" });
  mocks.rpc.mockResolvedValueOnce({ data: env(8), error: null });
  fireEvent.click(confirm);
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
  expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_versao: 7, p_payload: { fase_fenologica: "V5" } });
  await waitFor(() => expect(screen.getByText("Salvo")).toBeTruthy());
});

it("resposta tardia após troca de época durante a RPC não é adotada nem limpa a fila", async () => {
  const rpc = deferred<unknown>(); mocks.rpc.mockReturnValueOnce(rpc.p);
  const done = vi.fn(); const view = render(ui(<WizardCampoStep {...props()} onDone={done} />));
  await screen.findByLabelText("Fase fenológica");
  typeFase("V4"); advance();
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
  mocks.auth.authzEpoch = 1;
  await act(async () => { view.rerender(ui(<WizardCampoStep {...props()} onDone={done} />)); await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { rpc.resolve({ data: env(1), error: null }); await new Promise((r) => setTimeout(r, 20)); });
  expect(done).not.toHaveBeenCalled();
  let stored: Awaited<ReturnType<typeof getPendingCampoByRegistro>> = null;
  await act(async () => { stored = await getPendingCampoByRegistro(local); });
  expect(stored?.payload).toMatchObject({ fase_fenologica: "V4" }); // not removed by the late answer
  await screen.findByLabelText("Fase fenológica"); // new scope re-hydrates inside act
});

it("resposta tardia durante invalidations com troca de roles não navega", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: env(1), error: null });
  const inv = deferred<void>();
  const spy = vi.spyOn(qc, "invalidateQueries").mockImplementation(() => inv.p);
  const done = vi.fn(); const view = render(ui(<WizardCampoStep {...props()} onDone={done} />));
  await screen.findByLabelText("Fase fenológica");
  typeFase("V4"); advance();
  await waitFor(() => expect(spy).toHaveBeenCalled());
  mocks.auth.roles = ["consultor_tecnico", "gestor"];
  await act(async () => { view.rerender(ui(<WizardCampoStep {...props()} onDone={done} />)); await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { inv.resolve(); await new Promise((r) => setTimeout(r, 20)); });
  expect(done).not.toHaveBeenCalled();
});

it("aba 2 grava rascunho novo enquanto aba 1 envia: cleanup da aba 1 preserva o rascunho novo", async () => {
  const rpc = deferred<unknown>(); mocks.rpc.mockReturnValueOnce(rpc.p);
  const done = vi.fn(); render(ui(<WizardCampoStep {...props()} onDone={done} />));
  await screen.findByLabelText("Fase fenológica");
  typeFase("TAB1"); advance();
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
  await savePendingCampo({ localRegistroId: local, clientUuid: CU, remoteRegistroId: REMOTE, payload: { fase_fenologica: "TAB2" },
    versao: 1, updatedAt: new Date().toISOString(), syncStatus: "pending_sync", ownerUserId: "user-a", ownerOrganizationId: "org-a" });
  await act(async () => { rpc.resolve({ data: env(1), error: null }); await new Promise((r) => setTimeout(r, 20)); });
  const stored = await getPendingCampoByRegistro(local);
  expect(stored?.payload).toMatchObject({ fase_fenologica: "TAB2" });
  expect(stored?.syncStatus).toBe("pending_sync");
  // Finish CAS false: never "Salvo", never advances; revisable notice instead.
  expect(done).not.toHaveBeenCalled();
  expect(screen.queryByText("Salvo")).toBeNull();
  expect(await screen.findByText(/Há um rascunho mais novo desta etapa/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reconsultar dados atuais" })).toBeTruthy();
});

it("descarte obsoleto (nova revisão de outra aba) não esconde conflito nem apaga o novo rascunho", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "version_conflict" } });
  render(ui(<WizardCampoStep {...props()} onDone={vi.fn()} />));
  await screen.findByLabelText("Fase fenológica");
  typeFase("MEU"); advance();
  await screen.findByText("Conflito — revise antes de salvar");
  mocks.lookup.mockResolvedValueOnce({ data: { id: ROW_ID, registro_consultor_id: REMOTE, versao: 3, fase_fenologica: "S" }, error: null });
  fireEvent.click(screen.getByRole("button", { name: "Reconsultar dados atuais" }));
  const discard = await screen.findByRole("button", { name: "Descartar rascunho e usar dados atuais" });
  await savePendingCampo({ localRegistroId: local, clientUuid: CU, remoteRegistroId: REMOTE, payload: { fase_fenologica: "TAB2" },
    versao: 0, updatedAt: new Date().toISOString(), syncStatus: "pending_sync", ownerUserId: "user-a", ownerOrganizationId: "org-a" });
  fireEvent.click(discard);
  expect(await screen.findByText(/Há um rascunho mais novo desta etapa/)).toBeTruthy();
  expect(screen.getByText("Conflito — revise antes de salvar")).toBeTruthy();
  expect(fase().value).toBe("MEU");
  expect((await getPendingCampoByRegistro(local))?.payload).toMatchObject({ fase_fenologica: "TAB2" });
});

it("falso sucesso do baseline ({}) não confirma, não navega e mantém pendência", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: {}, error: null });
  const done = vi.fn(); render(ui(<WizardCampoStep {...props()} onDone={done} />));
  await screen.findByLabelText("Fase fenológica");
  typeFase("V4"); advance();
  await waitFor(() => expect(screen.getByText("Erro ao salvar")).toBeTruthy());
  expect(done).not.toHaveBeenCalled();
  expect((await getPendingCampoByRegistro(local))?.syncStatus).toBe("sync_error");
});

it("offline autorizado salva localmente com dono e versão 0 e avança sem RPC", async () => {
  mocks.online = false; const done = vi.fn();
  render(ui(<WizardCampoStep {...props()} remoteRegistroId={null} onDone={done} />));
  await screen.findByLabelText("Fase fenológica");
  typeFase("V4"); advance();
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  const stored = await getPendingCampoByRegistro(local);
  expect(stored).toMatchObject({ ownerUserId: "user-a", ownerOrganizationId: "org-a", versao: 0 });
  expect(typeof stored?.revision).toBe("string");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("rascunho local de outro ator não é hidratado", async () => {
  await savePendingCampo({ localRegistroId: local, payload: { fase_fenologica: "ALHEIO" }, versao: 0, updatedAt: "x",
    syncStatus: "pending_sync", ownerUserId: "user-x", ownerOrganizationId: "org-a" });
  render(ui(<WizardCampoStep {...props()} remoteRegistroId={null} onDone={vi.fn()} />));
  await screen.findByLabelText("Fase fenológica");
  expect(fase().value).toBe("");
});

it("fila IndexedDB: claim/finish por revisão+tentativa; conflito não atinge rascunho substituído; dono exato", async () => {
  const base = { localRegistroId: "q-1", payload: { a: 1 }, versao: 0, updatedAt: "x", syncStatus: "pending_sync" as const,
    ownerUserId: "u", ownerOrganizationId: "o" };
  const r1 = await savePendingCampo(base);
  expect(await claimPendingCampo("q-1", r1, { userId: "u2", organizationId: "o" })).toBeNull();
  const c1 = await claimPendingCampo("q-1", r1, { userId: "u", organizationId: "o" });
  expect(c1).not.toBeNull();
  expect(await claimPendingCampo("q-1", r1, { userId: "u", organizationId: "o" })).toBeNull(); // held
  await savePendingCampo({ ...base, payload: { a: 2 } }); // replaced draft
  expect(await finishPendingCampo(c1!.claim, { patch: { syncStatus: "conflict" } })).toBe(false);
  expect(await finishPendingCampo(c1!.claim, { remove: true })).toBe(false);
  const kept = await getPendingCampoByRegistro("q-1");
  expect(kept?.payload).toEqual({ a: 2 }); expect(kept?.syncStatus).toBe("pending_sync");
});

it("contrato do envelope: identidade completa, CAS seguro >= 0, sem falso sucesso", () => {
  expect(parseCampoResult(env(1), 0, REMOTE, CU)).toEqual({ id: ROW_ID, versao: 1, replayed: false });
  expect(parseCampoResult(env(1, { replayed: true }), 0, REMOTE, CU).replayed).toBe(true);
  expect(parseCampoResult(env(4, { client_uuid: null }), 3, REMOTE, CU).versao).toBe(4);
  const bad: Array<[unknown, number]> = [
    [{}, 0], [{ versao: 1 }, 0], [{ versao: 1, registro_consultor_id: REMOTE }, 0],
    [env(1, { id: "x" }), 0], [env(1, { registro_consultor_id: "x" }), 0], [env(1, { client_uuid: "x" }), 0],
    [env(1, { client_uuid: null }), 0], [env(4, { replayed: true }), 3], [env(4, { replayed: undefined }), 3],
    [env(5), 3], [env(1), 1], [env(0), -1], [env(1), Number.NaN], [env(1), 0.5], [env(1), Infinity], [null, 0], [[], 0],
  ];
  for (const [d, e] of bad) expect(() => parseCampoResult(d, e, REMOTE, CU)).toThrow("invalid_response");
  expect(isCampoConflict({ code: "PT409" })).toBe(true);
  expect(isCampoConflict({ code: "42501", message: "sem_permissao" })).toBe(false);
});
