import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlanoMonitoramentoEditor } from "@/components/visita/PlanoMonitoramentoEditor";
const s = vi.hoisted(() => ({ rpc: vi.fn(), refetch: vi.fn(), ready: true, actor: "A", version: 8, success: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => ({ abortSignal: () => s.rpc(...args) }) } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: s.actor }, profile: { user_id: s.actor, organization_id: s.actor, ativo: true }, roles: ["consultor_tecnico"], loading: false, authzReady: s.ready }) }));
vi.mock("@/hooks/useVisitaWorkspace", () => ({ useVisitaWorkspace: () => ({ data: { registro: { observacoes_tecnicas: "Notas", data_proxima_visita: "2026-11-01" }, version: s.version, status: "rascunho", permissions: { can_edit: true } }, refetch: s.refetch, isError: false }) }));
vi.mock("sonner", () => ({ toast: { success: s.success, error: s.error } }));
const id = "11111111-1111-4111-8111-111111111111";
const props = { registroId: id, observacoesAtuais: "Texto obsoleto", clienteId: id, fazendaId: id, talhaoId: id, consultorId: id, onUpdate: vi.fn(), readOnly: false };
function renderEditor() {
  const qc = new QueryClient(); const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<PlanoMonitoramentoEditor {...props} />, { wrapper });
}
beforeEach(() => { vi.clearAllMocks(); s.ready = true; s.actor = "A"; s.version = 8; });
afterEach(cleanup);
function openAndEdit() {
  fireEvent.click(screen.getByRole("button", { name: "Editar Plano" }));
  fireEvent.click(screen.getByRole("button", { name: "Nutrição" }));
  fireEvent.click(screen.getByRole("button", { name: "Estande" }));
}
it("componente real usa versão capturada; leitura nova não rebaseia; erro persiste sem limpar", async () => {
  const h = renderEditor(); openAndEdit(); s.version = 9; h.rerender(<PlanoMonitoramentoEditor {...props} />);
  s.rpc.mockResolvedValue({ data: null, error: { code: "PT409" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Seu plano foi mantido"));
  expect(s.rpc.mock.calls[0][1].p_expected_version).toBe(8);
  expect(s.rpc.mock.calls[0][1].p_plano.items).toEqual(["Nutrição", "Estande"]);
  expect(s.refetch).not.toHaveBeenCalled(); expect(s.success).not.toHaveBeenCalled(); expect(props.onUpdate).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it("sucesso contrato canônico fecha e notifica apenas uma vez; cancelamento não envia", async () => {
  renderEditor(); openAndEdit(); fireEvent.click(screen.getByRole("button", { name: "Cancelar" })); expect(s.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Editar Plano" }));
  s.rpc.mockImplementation(async (_: string, a: Record<string, any>) => ({ error: null, data: { ok: true, registro_id: id, version: 9, aviso_id: "22222222-2222-4222-8222-222222222222", data_referencia: a.p_plano.next_date, plano: a.p_plano, request_id: a.p_request_id } }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" })); fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await waitFor(() => expect(s.success).toHaveBeenCalledTimes(1)); expect(s.rpc).toHaveBeenCalledTimes(1); expect(props.onUpdate).toHaveBeenCalledTimes(1); expect(screen.queryByRole("dialog")).toBeNull();
});
it("troca de ator durante envio fecha edição sem falso sucesso/callback", async () => {
  const h = renderEditor(); openAndEdit(); let finish: (v: unknown) => void = () => {};
  s.rpc.mockImplementation(() => new Promise(r => { finish = r; })); fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await waitFor(() => expect(s.rpc).toHaveBeenCalledTimes(1)); s.actor = "B"; h.rerender(<PlanoMonitoramentoEditor {...props} />);
  finish({ data: null, error: null }); await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(s.success).not.toHaveBeenCalled(); expect(props.onUpdate).not.toHaveBeenCalled();
});