import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), save: vi.fn(), update: vi.fn(), remove: vi.fn(), pending: vi.fn(), online: true,
  remoteRow: null as unknown,
  scope: { userId: "user-a", organizationId: "org-a" } as { userId: string; organizationId: string } | null,
}));
const chain = () => {
  const c: Record<string, unknown> = {};
  c.select = () => c; c.eq = () => c; c.order = async () => ({ data: [], error: null });
  c.maybeSingle = async () => ({ data: mocks.remoteRow });
  return c;
};
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: () => chain() } }));
vi.mock("@/hooks/useOfflineSync", () => ({ useOnlineStatus: () => mocks.online }));
vi.mock("@/hooks/useTenantCatalogVisibility", () => ({
  useTenantCatalogScope: () => mocks.scope,
  useTenantSelection: () => ({ isSuccess: true, isFetching: false, data: { rows: [], total: 0 } }),
}));
vi.mock("@/lib/offlineDb", () => ({
  savePendingCampo: mocks.save, updatePendingCampo: mocks.update, removePendingCampo: mocks.remove,
  getPendingCampoByRegistro: mocks.pending,
}));
import WizardCampoStep from "@/pages/app/wizard/WizardCampoStep";
import { campoOwnedBy, isCampoConflict, parseCampoResult } from "@/lib/visita/campoContract";

const props = { localRegistroId: "local-fake", remoteRegistroId: "remote-fake", clienteId: null, clientUuid: "client-fake", locked: false };
let qc: QueryClient;
const ui = (el: ReactElement) => <QueryClientProvider client={qc}>{el}</QueryClientProvider>;
beforeEach(() => {
  vi.clearAllMocks(); mocks.online = true; mocks.remoteRow = null;
  mocks.scope = { userId: "user-a", organizationId: "org-a" };
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(qc, "invalidateQueries");
  mocks.save.mockResolvedValue(undefined); mocks.update.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined); mocks.pending.mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const typeFase = (v: string) => fireEvent.change(screen.getByLabelText("Fase fenológica"), { target: { value: v } });
const advance = () => fireEvent.click(screen.getByRole("button", { name: "Salvar e avançar" }));

it("PT409 vira conflito local: sem avanço, sem remoção e sem nova tentativa automática", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "version_conflict" } });
  const done = vi.fn(); render(ui(<WizardCampoStep {...props} onDone={done} />));
  typeFase("V4"); advance();
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("local-fake", expect.objectContaining({ syncStatus: "conflict" })));
  expect(await screen.findByText("Conflito — recarregue a visita")).toBeTruthy();
  expect(done).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("falha genérica fica sync_error e preserva pendência", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "network" } });
  const done = vi.fn(); render(ui(<WizardCampoStep {...props} onDone={done} />));
  typeFase("V4"); advance();
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("local-fake", expect.objectContaining({ syncStatus: "sync_error" })));
  expect(done).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
});
it("offline autorizado salva localmente com dono e avança sem RPC", async () => {
  mocks.online = false; const done = vi.fn(); render(ui(<WizardCampoStep {...props} onDone={done} />));
  typeFase("V4"); advance();
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "user-a", ownerOrganizationId: "org-a", versao: 0 }));
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("contrato inicial: CAS 0 sem linha, depois usa a versão retornada (N, N+1)", async () => {
  vi.useFakeTimers();
  let finish: ((value: unknown) => void) | undefined;
  mocks.rpc.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
    .mockResolvedValueOnce({ data: { versao: 2, registro_consultor_id: "remote-fake" }, error: null });
  const done = vi.fn(); render(ui(<WizardCampoStep {...props} onDone={done} />));
  await act(async () => { await Promise.resolve(); });
  typeFase("V4");
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_versao: 0 });
  typeFase("V5"); advance(); advance();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  await act(async () => { finish?.({ data: { versao: 1, registro_consultor_id: "remote-fake" }, error: null }); await vi.advanceTimersByTimeAsync(0); });
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_versao: 1, p_payload: { fase_fenologica: "V5" } });
  expect(done).toHaveBeenCalledTimes(1);
  expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["wizard-campo-flag", "remote-fake"] });
});
it("resposta sem versão válida não inventa versão nem limpa pendência", async () => {
  mocks.rpc.mockResolvedValue({ data: {}, error: null });
  const done = vi.fn(); render(ui(<WizardCampoStep {...props} onDone={done} />));
  typeFase("V4"); advance();
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("local-fake", expect.objectContaining({ syncStatus: "sync_error" })));
  expect(mocks.remove).not.toHaveBeenCalled(); expect(done).not.toHaveBeenCalled();
});
it("resposta tardia de outro ator não é adotada e o novo ator começa limpo", async () => {
  let finish: ((value: unknown) => void) | undefined;
  mocks.rpc.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const done = vi.fn(); const view = render(ui(<WizardCampoStep {...props} onDone={done} />));
  typeFase("V4"); advance();
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
  mocks.scope = { userId: "user-b", organizationId: "org-a" };
  view.rerender(ui(<WizardCampoStep {...props} onDone={done} />));
  await act(async () => { finish?.({ data: { versao: 1, registro_consultor_id: "remote-fake" }, error: null }); await Promise.resolve(); });
  expect(mocks.remove).not.toHaveBeenCalled(); expect(done).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Fase fenológica") as HTMLInputElement).value).toBe("");
  mocks.rpc.mockResolvedValueOnce({ data: { versao: 1, registro_consultor_id: "remote-fake" }, error: null });
  typeFase("B1"); advance();
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_versao: 0 });
  expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ ownerUserId: "user-b" }));
});
it("rascunho local de outro ator ou legado sem dono não é hidratado", async () => {
  mocks.pending.mockResolvedValue({ localRegistroId: "local-fake", payload: { fase_fenologica: "ALHEIO" }, versao: 3, syncStatus: "pending_sync", ownerUserId: "user-x", ownerOrganizationId: "org-a" });
  render(ui(<WizardCampoStep {...props} remoteRegistroId={null} onDone={vi.fn()} />));
  await waitFor(() => expect(mocks.pending).toHaveBeenCalled());
  await act(async () => { await Promise.resolve(); });
  expect((screen.getByLabelText("Fase fenológica") as HTMLInputElement).value).toBe("");
});
it("falha no armazenamento local não avança", async () => {
  mocks.save.mockRejectedValue(new Error("storage unavailable"));
  const done = vi.fn(); render(ui(<WizardCampoStep {...props} onDone={done} />));
  typeFase("V4"); advance();
  await waitFor(() => expect(mocks.update).toHaveBeenCalled());
  expect(done).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("contrato: versão exata, dono exato, PT409 detectado", () => {
  expect(parseCampoResult({ versao: 1 }, 0, "r")).toBe(1);
  expect(parseCampoResult({ versao: 4, registro_consultor_id: "r" }, 3, "r")).toBe(4);
  for (const [d, e] of [[{ versao: 5 }, 3], [{ versao: 1 }, 1], [{}, 0], [{ versao: "2" }, 1], [{ versao: 2, registro_consultor_id: "x" }, 1]] as const)
    expect(() => parseCampoResult(d, e, "r")).toThrow("invalid_response");
  expect(campoOwnedBy({ ownerUserId: "u", ownerOrganizationId: "o" }, { userId: "u", organizationId: "o" })).toBe(true);
  expect(campoOwnedBy({}, { userId: "u", organizationId: "o" })).toBe(false);
  expect(campoOwnedBy({ ownerUserId: "u", ownerOrganizationId: "p" }, { userId: "u", organizationId: "o" })).toBe(false);
  expect(isCampoConflict({ code: "PT409" })).toBe(true);
  expect(isCampoConflict({ code: "42501", message: "sem_permissao" })).toBe(false);
});
