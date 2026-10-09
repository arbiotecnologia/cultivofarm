import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  status: "reprovado", canEdit: false, version: 15, from: vi.fn(), rpc: vi.fn(), update: vi.fn(), insert: vi.fn(), remove: vi.fn(),
  success: vi.fn(), error: vi.fn(), mode: "ok",
  auth: { user: { id: "fake-actor" }, profile: { id: "fake-profile", user_id: "fake-actor", organization_id: "fake-org", ativo: true }, role: "consultor_tecnico", roles: ["consultor_tecnico"], loading: false },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/hooks/useSystemConfig", () => ({ useSystemConfig: () => ({ config: {} }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useObjetivosVisita", () => ({ useObjetivosVisita: () => ({ data: [] }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useParams: () => ({ id: "fake-visit" }), useSearchParams: () => [new URLSearchParams(), vi.fn()], Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/visita/CheckinCard", () => ({ CheckinCard: () => null, CheckinObservacoes: () => null }));
vi.mock("@/components/visita/EvidenciasTabs", () => ({ EvidenciasTabs: () => null }));
vi.mock("@/components/visita/CondutaCard", () => ({ CondutaCard: () => null, CONDUTA_DEFAULT: {} }));
vi.mock("@/components/visita/EncerramentoCard", () => ({ EncerramentoCard: () => null, ENCERRAMENTO_DEFAULT: { proximoPasso: "encerrar_atendimento", osItens: [], monitoramentoItens: [] } }));
vi.mock("@/components/visita/ProblemaSelector", () => ({ ProblemaSelector: () => <input aria-label="Problema fictício" /> }));
vi.mock("@/components/visita/AprovacaoCard", () => ({ AprovacaoCard: () => null }));
vi.mock("@/components/visita/VisitaTimeline", () => ({ VisitaTimeline: () => null }));
vi.mock("@/components/visita/roteiro/RoteiroVisita", () => ({ RoteiroVisita: () => null }));
vi.mock("@/components/visita/EnviarPdfVisitaDialog", () => ({ EnviarPdfVisitaDialog: () => null }));
vi.mock("@/components/shared/RecomendacaoChat", () => ({ RecomendacaoChat: () => null }));
import VisitaTecnica from "@/pages/VisitaTecnica";
import { VisitaStatusBanner } from "@/components/visita/VisitaStatusBanner";
import { PlanoMonitoramentoEditor } from "@/components/visita/PlanoMonitoramentoEditor";
import { TalhaoRecomendacaoCard } from "@/components/portal/TalhaoRecomendacaoCard";
import { useAtendimentosTecnicos } from "@/hooks/useAtendimentosTecnicos";

const clients: QueryClient[] = [];
function mount(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.status = "reprovado"; mocks.canEdit = false; mocks.version = 15; mocks.mode = "ok";
  mocks.auth.role = "consultor_tecnico"; mocks.auth.roles = ["consultor_tecnico"];
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "rpc_listar_atendimentos_tecnicos_v1"
    ? { items: [{ id: "fake-visit", kind: "visita", status: "reprovado", can_edit: true, proxima_acao: "Revisar e reenviar" }] }
    : { registro: { id: "fake-visit" }, status: mocks.status, version: mocks.version, permissions: { can_edit: mocks.canEdit, can_approve: false } } }));
  mocks.from.mockImplementation((table: string) => {
    let writing = false;
    const visit = { id: "fake-visit", status: mocks.status, version: mocks.version, objetivo_visita: "Objetivo fictício", data_vistoria: "2026-10-09", cliente_id: "fake-client", fazenda_id: "fake-farm", talhao_id: "fake-field", cultura_id: "fake-crop", necessidade_intervencao: "monitorar", proxima_acao_recomendada: "encerrar_atendimento" };
    const response = () => ({ data: writing && mocks.mode === "empty" ? null : table === "registros_consultor" ? visit : [], error: writing && mocks.mode === "error" ? { message: "version_conflict" } : null });
    const builder = {
      select: () => builder, eq: () => builder, ilike: () => builder, limit: () => builder,
      order: () => Promise.resolve(response()), single: () => Promise.resolve(response()), maybeSingle: () => Promise.resolve(response()),
      update: (...args: unknown[]) => { writing = true; mocks.update(...args); return builder; },
      insert: (...args: unknown[]) => { writing = true; mocks.insert(...args); return builder; },
      delete: (...args: unknown[]) => { writing = true; mocks.remove(...args); return builder; },
      then: (resolve: (value: unknown) => void) => Promise.resolve(response()).then(resolve),
    }; return builder;
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); });

it.each([["consultor_tecnico", "reprovado"], ["administrador", "reprovado"], ["consultor_tecnico", "finalizado"], ["administrador", "finalizado"]])("identificação %s/%s fica realmente bloqueada, sem save por teclado", async (role, status) => {
  mocks.auth.role = role; mocks.auth.roles = [role]; mocks.status = status;
  mount(<VisitaTecnica />);
  await waitFor(() => expect(screen.getAllByPlaceholderText("Ex: avaliar pressão de lagartas")[0]).toHaveValue("Objetivo fictício"));
  for (const input of screen.getAllByPlaceholderText("Ex: avaliar pressão de lagartas")) expect(input).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Editar visita" })).toBeNull();
  fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
});
it.each(["finalizado", "reprovado"])("banner %s ignora props antigas que tentam liberar edição local", (status) => {
  const edit = vi.fn(); mount(<VisitaStatusBanner status={status} isEditing canReopen onReopen={edit} onSave={edit} onCancel={edit} />);
  expect(screen.queryByRole("button", { name: /Editar visita|Salvar alterações|Reabrir para edição/ })).toBeNull(); expect(edit).not.toHaveBeenCalled();
});
const monitor = { registroId: "fake-visit", observacoesAtuais: "", dataProximaVisita: "2026-10-15", clienteId: "fake-client", fazendaId: "fake-farm", talhaoId: "fake-field", consultorId: "fake-actor", onUpdate: vi.fn() };
it.each(["reprovado", "finalizado", "aprovado"])("plano %s bloqueia editar/agendar mesmo com prop permissiva", async status => {
  mocks.status = status; mocks.canEdit = true;
  mount(<PlanoMonitoramentoEditor {...monitor} readOnly={false} />);
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Editar Plano" }));
  fireEvent.click(screen.getByRole("button", { name: "Agendamento indisponível" }));
  expect(screen.queryByRole("dialog")).toBeNull(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
});
it("cancelar edição de plano draft não grava", async () => {
  mocks.status = "rascunho"; mocks.canEdit = true;
  mount(<PlanoMonitoramentoEditor {...monitor} readOnly={false} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Editar Plano" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Editar Plano" })); fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(mocks.update).not.toHaveBeenCalled();
});
it.each(["empty", "error"])("plano draft falha %s não informa sucesso nem fecha formulário", async mode => {
  mocks.status = "rascunho"; mocks.canEdit = true; mocks.mode = mode;
  mount(<PlanoMonitoramentoEditor {...monitor} readOnly={false} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Editar Plano" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Editar Plano" })); fireEvent.click(screen.getByRole("button", { name: "Pragas" })); fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled()); expect(mocks.success).not.toHaveBeenCalled(); expect(screen.getByRole("dialog")).toBeTruthy();
});
it("produtor aprovado não pode criar OS nem executar decisão manual", () => {
  mount(<TalhaoRecomendacaoCard registro={{ id: "fake-visit", status: "aprovado" }} recomendacoes={[]} />);
  expect(screen.queryByRole("button", { name: /Aprovar e gerar OS|Aceitar sem aplicar|Recusar/ })).toBeNull();
  expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("lista reprovada não oferece reenvio nem permissões herdadas", async () => {
  function List() { const query = useAtendimentosTecnicos(); return <output>{JSON.stringify(query.data?.items)}</output>; }
  mount(<List />);
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain('"can_edit":false'));
  expect(screen.getByRole("status").textContent).not.toContain("Revisar e reenviar");
});
