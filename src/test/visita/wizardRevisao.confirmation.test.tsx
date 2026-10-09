import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), navigate: vi.fn(), invalidate: vi.fn(), online: true,
  registro: { status: "rascunho", version: 3, cultura_id: "crop-fake" },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === "wizard-revisao-registro" ? mocks.registro : { checkin: 1, campo: 1, diagnosticos: 1, recomendacoes: 1, anexos: 0 }, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/useOfflineSync", () => ({ useOnlineStatus: () => mocks.online }));
import WizardRevisaoStep from "@/pages/app/wizard/WizardRevisaoStep";
const props = { remoteRegistroId: "visit-fake", locked: false };
beforeEach(() => {
  vi.clearAllMocks(); mocks.online = true;
  mocks.registro = { status: "rascunho", version: 3, cultura_id: "crop-fake" };
  mocks.invalidate.mockResolvedValue(undefined);
  mocks.rpc.mockResolvedValue({ error: null });
});
afterEach(cleanup);
it.each(["rascunho", "finalizado"])("abrir/cancelar %s não chama RPC", (status) => {
  mocks.registro.status = status;
  render(<WizardRevisaoStep {...props} />);
  fireEvent.click(screen.getByRole("button", { name: status === "rascunho" ? "Finalizar visita" : "Enviar para aprovação" }));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  expect(mocks.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
  ["rascunho", "Finalizar visita", "Confirmar finalização", "rpc_finalizar_visita_v2"],
  ["finalizado", "Enviar para aprovação", "Confirmar envio", "rpc_enviar_visita_aprovacao"],
])("confirma %s uma única vez com versão 3", async (status, opener, confirm, rpc) => {
  mocks.registro.status = status;
  let finish: ((value: unknown) => void) | undefined;
  mocks.rpc.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<WizardRevisaoStep {...props} />);
  fireEvent.click(screen.getByRole("button", { name: opener }));
  const button = screen.getByRole("button", { name: confirm });
  act(() => { fireEvent.click(button); fireEvent.click(button); });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledWith(rpc, { p_registro_id: "visit-fake", p_expected_version: 3 });
  expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  await act(async () => { finish?.({ error: null }); });
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/app/atendimentos"));
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
it.each(["resolved", "rejected"])("erro %s mantém diálogo e permite retry explícito", async (mode) => {
  if (mode === "resolved") mocks.rpc.mockResolvedValueOnce({ error: { message: "version_conflict" } });
  else mocks.rpc.mockRejectedValueOnce(new Error("Servidor temporariamente indisponível"));
  render(<WizardRevisaoStep {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Finalizar visita" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar finalização" }));
  const dialog = screen.getByRole("alertdialog");
  await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent(mode === "resolved" ? "Versão desatualizada" : "Servidor temporariamente indisponível"));
  expect(mocks.navigate).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar finalização" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Confirmar finalização" }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
});
it("status atualizado enquanto confirmação está aberta impede RPC", () => {
  const { rerender } = render(<WizardRevisaoStep {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Finalizar visita" }));
  mocks.registro.status = "aprovado";
  rerender(<WizardRevisaoStep {...props} />);
  expect(screen.getByRole("button", { name: "Confirmar finalização" })).toBeDisabled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("bloqueio de edição e offline não oferecem finalização ativa", () => {
  const { rerender } = render(<WizardRevisaoStep {...props} locked />);
  expect(screen.queryByRole("button", { name: "Finalizar visita" })).toBeNull();
  mocks.online = false;
  rerender(<WizardRevisaoStep {...props} />);
  expect(screen.getByRole("button", { name: "Finalizar visita" })).toBeDisabled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});