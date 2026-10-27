import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlanoMonitoramentoEditor } from "@/components/visita/PlanoMonitoramentoEditor";
const s = vi.hoisted(() => ({ rpc: vi.fn(), refetch: vi.fn(), ready: true, actor: "A", version: 8, status: "rascunho", text: "Notas", success: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => ({ abortSignal: () => s.rpc(...args) }) } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: s.actor }, profile: { user_id: s.actor, organization_id: s.actor, ativo: true }, roles: ["consultor_tecnico"], loading: false, authzReady: s.ready }) }));
vi.mock("@/hooks/useVisitaWorkspace", () => ({ useVisitaWorkspace: () => ({ data: { registro: { observacoes_tecnicas: s.text, data_proxima_visita: "2026-11-01", codigo_visita: "VT-TESTE" }, version: s.version, status: s.status, permissions: { can_edit: true, can_view: true }, monitoramento: [{ registro_consultor_id: "11111111-1111-4111-8111-111111111111", id: "33333333-3333-4333-8333-333333333333", tipo: "plano_monitoramento" }] }, refetch: s.refetch, isError: false }) }));
vi.mock("sonner", () => ({ toast: { success: s.success, error: s.error } }));
const id = "11111111-1111-4111-8111-111111111111";
const props = { registroId: id, observacoesAtuais: "Texto obsoleto", clienteId: id, fazendaId: id, talhaoId: id, consultorId: id, onUpdate: vi.fn(), readOnly: false };
function renderEditor() {
  const qc = new QueryClient(); const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<PlanoMonitoramentoEditor {...props} />, { wrapper });
}
beforeEach(() => { vi.clearAllMocks(); s.ready = true; s.actor = "A"; s.version = 8; s.status = "rascunho"; s.text = "Notas"; });
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
const planText = "[PLANO DE MONITORAMENTO]\nItens: Nutrição, Estande\nFrequência: 14 dias\nGatilhos: Avaliar\nPróxima Avaliação: 2026-11-01\n[FIM DO PLANO]";
it("montagem readonly preserva display do envelope e origem; revogação oculta", () => {
  s.status = "finalizado"; s.text = planText;
  const h = renderEditor();
  expect(screen.getByText("Nutrição")).toBeTruthy(); expect(screen.getByText("Estande")).toBeTruthy();
  expect(screen.getByText(/Aviso desta visita/)).toHaveTextContent("VT-TESTE");
  expect(screen.getByRole("button", { name: "Editar Plano" })).toBeDisabled();
  expect(screen.getByText(/Próxima:/)).not.toHaveTextContent("Não definida");
  s.ready = false; h.rerender(<PlanoMonitoramentoEditor {...props} />);
  expect(screen.queryByText("Nutrição")).toBeNull(); expect(screen.queryByText(/Aviso desta visita/)).toBeNull();
});
it("display não adota draft durante edição nem perde plano por cancelamento", () => {
  s.text = planText; renderEditor();
  fireEvent.click(screen.getByRole("button", { name: "Editar Plano" }));
  fireEvent.click(screen.getByRole("button", { name: "Pragas" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByText("Pragas")).toBeNull(); expect(screen.getByText("Nutrição")).toBeTruthy();
  expect(s.rpc).not.toHaveBeenCalled();
});
it("dois saves consecutivos usam N,N+1 e retornam N+1,N+2 após refresh observado", async () => {
  const h = renderEditor(); openAndEdit();
  s.rpc.mockImplementation(async (_: string, a: Record<string, any>) => ({ error: null, data: { ok: true, registro_id: id, version: a.p_expected_version + 1, aviso_id: "22222222-2222-4222-8222-222222222222", data_referencia: a.p_plano.next_date, plano: a.p_plano, request_id: a.p_request_id } }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" })); await waitFor(() => expect(s.success).toHaveBeenCalledTimes(1));
  // No stale cache reopen before the new observed envelope.
  fireEvent.click(screen.getByRole("button", { name: "Editar Plano" })); expect(screen.queryByRole("dialog")).toBeNull();
  s.version = 9; s.text = planText; h.rerender(<PlanoMonitoramentoEditor {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Editar Plano" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" })); await waitFor(() => expect(s.success).toHaveBeenCalledTimes(2));
  expect(s.rpc.mock.calls.map(c => c[1].p_expected_version)).toEqual([8, 9]);
  expect(s.rpc.mock.calls[0][1].p_request_id).not.toBe(s.rpc.mock.calls[1][1].p_request_id);
});
it("PT409 definitivo: consulta explícita, cancelar preserva, confirmar nova revisão não salva sozinho", async () => {
  const h = renderEditor(); openAndEdit(); s.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" })); await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.getByRole("button", { name: "Salvar Alterações" })).toBeDisabled();
  s.version = 9; h.rerender(<PlanoMonitoramentoEditor {...props} />);
  s.refetch.mockResolvedValue({ isError: false, data: { version: 9, status: "rascunho", permissions: { can_edit: true } } });
  fireEvent.click(screen.getByRole("button", { name: "Reconsultar e revisar" })); await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Cancelar revisão" })); expect(s.rpc).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Reconsultar e revisar" })); await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Confirmar revisão" })); expect(s.rpc).toHaveBeenCalledTimes(1);
  s.rpc.mockImplementationOnce(async (_: string, a: Record<string, any>) => ({ error: null, data: { ok: true, registro_id: id, version: 10, aviso_id: "22222222-2222-4222-8222-222222222222", data_referencia: a.p_plano.next_date, plano: a.p_plano, request_id: a.p_request_id } }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" })); await waitFor(() => expect(s.success).toHaveBeenCalledTimes(1));
  expect(s.rpc.mock.calls[1][1].p_expected_version).toBe(9);
  expect(s.rpc.mock.calls[1][1].p_plano.items).toEqual(["Nutrição", "Estande"]);
  expect(s.rpc.mock.calls[0][1].p_request_id).not.toBe(s.rpc.mock.calls[1][1].p_request_id);
});
it("timeout incerto mantém chave; PT409 posterior não permite nova tentativa/rebase", async () => {
  renderEditor(); openAndEdit(); s.rpc.mockRejectedValueOnce(new Error("timeout"));
  fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" })); await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Reconsultar e revisar" })).toBeNull();
  s.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" })); await waitFor(() => expect(s.rpc).toHaveBeenCalledTimes(2));
  expect(s.rpc.mock.calls[0][1].p_request_id).toBe(s.rpc.mock.calls[1][1].p_request_id);
  expect(screen.queryByRole("button", { name: "Reconsultar e revisar" })).toBeNull();
});
it.each(["version", "actor"])("confirmação da revisão não adota mudança de %s durante diálogo", async change => {
  const h = renderEditor(); openAndEdit(); s.rpc.mockResolvedValue({ data: null, error: { code: "PT409" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" })); await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  s.refetch.mockResolvedValue({ isError: false, data: { version: 8, status: "rascunho", permissions: { can_edit: true } } });
  fireEvent.click(screen.getByRole("button", { name: "Reconsultar e revisar" })); await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
  if (change === "version") s.version = 9; else s.actor = "B";
  h.rerender(<PlanoMonitoramentoEditor {...props} />);
  const confirm = screen.queryByRole("button", { name: "Confirmar revisão" }); if (confirm) fireEvent.click(confirm);
  expect(s.rpc).toHaveBeenCalledTimes(1); expect(s.success).not.toHaveBeenCalled();
  if (change === "version") expect(screen.getByRole("button", { name: "Salvar Alterações" })).toBeDisabled();
  else expect(screen.queryByRole("dialog")).toBeNull();
});