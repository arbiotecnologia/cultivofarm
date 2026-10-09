import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), save: vi.fn(), update: vi.fn(), remove: vi.fn(), invalidate: vi.fn(), online: true,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }), useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("@/hooks/useOfflineSync", () => ({ useOnlineStatus: () => mocks.online }));
vi.mock("@/lib/offlineDb", () => ({
  savePendingCampo: mocks.save, updatePendingCampo: mocks.update, removePendingCampo: mocks.remove,
  getPendingCampoByRegistro: async () => null,
}));
import WizardCampoStep from "@/pages/app/wizard/WizardCampoStep";
const props = { localRegistroId: "local-fake", remoteRegistroId: "remote-fake", clienteId: null, clientUuid: "client-fake", locked: false };
beforeEach(() => {
  vi.clearAllMocks(); mocks.online = true;
  mocks.save.mockResolvedValue(undefined); mocks.update.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined); mocks.invalidate.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("falha online preserva pendência e não avança", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "version_conflict" } });
  const done = vi.fn(); render(<WizardCampoStep {...props} onDone={done} />);
  fireEvent.change(screen.getByLabelText("Fase fenológica"), { target: { value: "V4" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar e avançar" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("local-fake", expect.objectContaining({ syncStatus: "sync_error" })));
  expect(done).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
});
it("offline autorizado salva localmente e avança sem RPC", async () => {
  mocks.online = false; const done = vi.fn(); render(<WizardCampoStep {...props} onDone={done} />);
  fireEvent.change(screen.getByLabelText("Fase fenológica"), { target: { value: "V4" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar e avançar" }));
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(mocks.save).toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("autosave e salvar ficam serializados e segundo write usa versão retornada", async () => {
  vi.useFakeTimers();
  let finish: ((value: unknown) => void) | undefined;
  mocks.rpc.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
    .mockResolvedValueOnce({ data: { versao: 2 }, error: null });
  const done = vi.fn(); render(<WizardCampoStep {...props} onDone={done} />);
  await act(async () => { await Promise.resolve(); });
  fireEvent.change(screen.getByLabelText("Fase fenológica"), { target: { value: "V4" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Fase fenológica"), { target: { value: "V5" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar e avançar" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar e avançar" }));
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  await act(async () => { finish?.({ data: { versao: 1 }, error: null }); await vi.advanceTimersByTimeAsync(0); });
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_versao: 1, p_payload: { fase_fenologica: "V5" } });
  expect(done).toHaveBeenCalledTimes(1);
  expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["wizard-campo-flag", "remote-fake"] });
  expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["visita-workspace", "remote-fake"] });
});
it("falha no armazenamento local não avança", async () => {
  mocks.save.mockRejectedValue(new Error("storage unavailable"));
  const done = vi.fn(); render(<WizardCampoStep {...props} onDone={done} />);
  fireEvent.change(screen.getByLabelText("Fase fenológica"), { target: { value: "V4" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar e avançar" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalled());
  expect(done).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
});