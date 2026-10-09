import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: { user: { id: "actor-fake" }, profile: { user_id: "actor-fake", ativo: true, organization_id: "org-fake" }, roles: ["administrador"], role: "administrador", loading: false },
  workspace: { status: "enviado_aprovacao", version: 5, permissions: { can_approve: true } },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
import { TechnicalDecisionActions, VisitaStatusBanner } from "@/components/visita/VisitaStatusBanner";
import { useFluxoVisitaTecnica } from "@/hooks/useFluxoVisitaTecnica";

const clients: QueryClient[] = [];
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.roles = ["administrador"]; mocks.auth.loading = false; mocks.auth.profile.ativo = true;
  mocks.workspace = { status: "enviado_aprovacao", version: 5, permissions: { can_approve: true } };
  mocks.rpc.mockImplementation(async (name: string) => name === "rpc_get_visita_workspace"
    ? { data: { ...mocks.workspace }, error: null }
    : { data: name === "rpc_liberar_recomendacao_produtor" ? { success: true, version: 6 } : { ok: true, version: 6 }, error: null });
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });
function mount(node = <TechnicalDecisionActions registroId="visit-fake" />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return { client, invalidate };
}
const decisions = [
  ["Aprovar recomendação", "rpc_liberar_recomendacao_produtor", false],
  ["Solicitar ajuste", "rpc_solicitar_ajuste_visita", true],
  ["Reprovar recomendação", "rpc_reprovar_visita", true],
] as const;

it.each(decisions)("confirma %s via RPC canônica e invalida somente após sucesso", async (label, rpc, reason) => {
  const { client, invalidate } = mount();
  client.setQueryData(["atendimentos-tecnicos", "inactive"], 1);
  client.setQueryData(["atendimentos-tecnicos-resumo"], 2);
  client.setQueryData(["visita-aprovacoes", "visit-fake"], []);
  client.setQueryData(["unrelated"], 7);
  fireEvent.click(await screen.findByRole("button", { name: label }));
  expect(mocks.rpc.mock.calls.filter(([name]) => name === rpc)).toHaveLength(0);
  if (reason) {
    expect(screen.getByRole("button", { name: "Confirmar decisão" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: " Motivo fictício " } });
  }
  expect(invalidate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar decisão" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(mocks.rpc).toHaveBeenCalledWith(rpc, reason
    ? { p_registro_id: "visit-fake", p_expected_version: 5, p_motivo: "Motivo fictício" }
    : { p_registro_id: "visit-fake" });
  for (const key of ["visita-workspace", "visita-status-log", "visita-aprovacoes", "visita-timeline"]) {
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [key, "visit-fake"] });
  }
  expect(client.getQueryState(["atendimentos-tecnicos", "inactive"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["atendimentos-tecnicos-resumo"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["visita-aprovacoes", "visit-fake"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["unrelated"])?.isInvalidated).toBe(false);
});

it.each(decisions)("cancelar %s não grava", async (label, rpc) => {
  mount(); fireEvent.click(await screen.findByRole("button", { name: label }));
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(mocks.rpc.mock.calls.some(([name]) => name === rpc)).toBe(false);
});

it.each(decisions)("duplo clique em %s produz uma única chamada", async (label, rpc, reason) => {
  const original = mocks.rpc.getMockImplementation();
  let finish: ((value: unknown) => void) | undefined;
  mocks.rpc.mockImplementation((name, args) => name === rpc ? new Promise((resolve) => { finish = resolve; }) : original?.(name, args));
  mount(); fireEvent.click(await screen.findByRole("button", { name: label }));
  if (reason) fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Motivo fictício" } });
  const button = screen.getByRole("button", { name: "Confirmar decisão" });
  act(() => { fireEvent.click(button); fireEvent.click(button); });
  await waitFor(() => expect(mocks.rpc.mock.calls.filter(([name]) => name === rpc)).toHaveLength(1));
  expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await act(async () => { finish?.({ data: rpc === "rpc_liberar_recomendacao_produtor" ? { success: true } : { ok: true }, error: null }); });
});

it.each(["successfalse", "version_conflict", "rejected"])("falha %s preserva diálogo/motivo e reconsulta sem invalidação de sucesso", async (mode) => {
  const original = mocks.rpc.getMockImplementation();
  mocks.rpc.mockImplementation((name, args) => {
    if (name === "rpc_get_visita_workspace") return original?.(name, args);
    if (mode === "rejected") return Promise.reject(new Error("falha de transporte"));
    return Promise.resolve(mode === "successfalse" ? { data: { success: false }, error: null } : { data: null, error: { message: "version_conflict" } });
  });
  const { invalidate } = mount();
  fireEvent.click(await screen.findByRole("button", { name: mode === "successfalse" ? "Aprovar recomendação" : "Solicitar ajuste" }));
  if (mode !== "successfalse") fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Motivo preservado" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar decisão" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  if (mode !== "successfalse") expect(screen.getByLabelText("Motivo")).toHaveValue("Motivo preservado");
  expect(invalidate).not.toHaveBeenCalled();
  await waitFor(() => expect(mocks.rpc.mock.calls.filter(([name]) => name === "rpc_get_visita_workspace").length).toBeGreaterThanOrEqual(3));
});

it.each([
  ["consultor_tecnico", "enviado_aprovacao", true], ["administrador", "finalizado", true],
  ["gestor", "aprovado", true], ["administrador", "enviado_aprovacao", false],
])("nega papel/status/permissão %s/%s/%s", async (role, status, canApprove) => {
  mocks.auth.roles = [role]; mocks.workspace.status = status; mocks.workspace.permissions.can_approve = canApprove;
  mount(); await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: "Aprovar recomendação" })).toBeNull();
  expect(mocks.rpc.mock.calls.every(([name]) => name === "rpc_get_visita_workspace")).toBe(true);
});

it("reabre análise admin/aprovado6 para enviado7 sem callback de edição e sem OS", async () => {
  mocks.workspace.status = "aprovado"; mocks.workspace.version = 6;
  const onReopen = vi.fn();
  mount(<VisitaStatusBanner registroId="visit-fake" status="aprovado" isEditing={false} canReopen={true} onReopen={onReopen} onSave={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Reabrir análise" }));
  expect(screen.getByRole("button", { name: "Confirmar decisão" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Reanalisar parecer" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar decisão" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(mocks.rpc).toHaveBeenCalledWith("rpc_reabrir_visita", { p_registro_id: "visit-fake", p_expected_version: 6, p_motivo: "Reanalisar parecer" });
  expect(onReopen).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Editar visita" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Gerar OS de Produção" })).toBeNull();
});

it.each(["gestor", "consultor_tecnico"])("reabertura indisponível para %s", async (role) => {
  mocks.auth.roles = [role]; mocks.workspace.status = "aprovado";
  mount(<TechnicalDecisionActions registroId="visit-fake" mode="reabrir" />);
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: "Reabrir análise" })).toBeNull();
});

it("hook liberar atual invalida parecer e resumo após resposta success true", async () => {
  function DirectCaller() {
    const hook = useFluxoVisitaTecnica();
    return <button onClick={() => { void hook.liberarRecomendacaoParaProdutor("visit-fake"); }}>Executar teste</button>;
  }
  const { invalidate } = mount(<DirectCaller />);
  fireEvent.click(screen.getByRole("button", { name: "Executar teste" }));
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["visita-aprovacoes", "visit-fake"] }));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["atendimentos-tecnicos-resumo"] });
});