import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  auth: { user: { id: "actor-A" } as { id: string } | null, profile: { user_id: "actor-A", organization_id: "org-A", ativo: true }, roles: ["consultor_tecnico"], loading: false },
  status: "aprovado", objective: "Objetivo remoto", rpc: vi.fn(), from: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useParams: () => ({ id: "fake-visit" }), useSearchParams: () => [new URLSearchParams()] }));
vi.mock("@/hooks/useOfflineSync", () => ({ useOnlineStatus: () => true }));
vi.mock("@/hooks/useUnsavedChanges", () => ({ useUnsavedChanges: vi.fn() }));
vi.mock("@/hooks/useObjetivosVisita", () => ({ useObjetivosVisita: () => ({ data: [] }) }));
vi.mock("@/pages/app/wizard/WizardCheckinStep", () => ({ default: () => null }));
vi.mock("@/pages/app/wizard/WizardCampoStep", () => ({ default: () => null }));
vi.mock("@/pages/app/wizard/WizardDiagnosticoStep", () => ({ default: () => null }));
vi.mock("@/pages/app/wizard/WizardRecomendacaoStep", () => ({ default: () => null }));
vi.mock("@/pages/app/wizard/WizardAnexosStep", () => ({ default: () => null }));
vi.mock("@/pages/app/wizard/WizardRevisaoStep", () => ({ default: () => null }));
import MobileVisitaWizard from "@/pages/app/MobileVisitaWizard";
import { useVisitaWorkspace } from "@/hooks/useVisitaWorkspace";
import { useVisitasTecnicasLista } from "@/hooks/useVisitasTecnicasLista";
import { useAtendimentosTecnicos, useAtendimentosResumo } from "@/hooks/useAtendimentosTecnicos";

const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnMount: false, refetchOnWindowFocus: false } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
function age(client: QueryClient) {
  client.getQueryCache().getAll().forEach(q => {
    if (q.state.data !== undefined) client.setQueryData(q.queryKey, q.state.data, { updatedAt: Date.now() - 60_000 });
  });
}
beforeEach(() => {
  mocks.auth.user = { id: "actor-A" }; Object.assign(mocks.auth.profile, { user_id: "actor-A", organization_id: "org-A", ativo: true });
  mocks.auth.loading = false; mocks.auth.roles = ["consultor_tecnico"]; mocks.status = "aprovado"; mocks.objective = "Objetivo remoto";
  vi.clearAllMocks(); focusManager.setFocused(true);
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "rpc_get_visita_workspace"
    ? { status: mocks.status, version: mocks.status === "aprovado" ? 6 : 8, permissions: { can_edit: mocks.status === "rascunho", is_editable_status: mocks.status === "rascunho" } }
    : name === "rpc_resumo_atendimentos_tecnicos_v1" ? { em_andamento: mocks.status === "rascunho" ? 2 : 0, concluidos: mocks.status === "rascunho" ? 0 : 1 }
    : { items: [{ id: "fake-visit", status: mocks.status }], total: 1 }, error: null }));
  mocks.from.mockImplementation((table: string) => {
    const result = { data: table === "registros_consultor" ? { id: "fake-visit", status: mocks.status, objetivo_visita: mocks.objective, cultura_id: "fake-crop" } : [], error: null };
    const builder = { select: () => builder, eq: () => builder, limit: () => builder, order: () => Promise.resolve(result), maybeSingle: () => builder, abortSignal: () => Promise.resolve(result), then: (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
    return builder;
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); focusManager.setFocused(undefined); });

it("remount stale do wizard aprovado6→rascunho8 libera edição sem reload e sem writes", async () => {
  const { client, wrapper } = setup();
  const first = render(<MobileVisitaWizard />, { wrapper });
  await waitFor(() => expect(screen.getByLabelText("Objetivo da visita *")).toHaveValue("Objetivo remoto"));
  expect(screen.getByLabelText("Objetivo da visita *")).toBeDisabled();
  first.unmount(); mocks.status = "rascunho"; age(client);
  render(<MobileVisitaWizard />, { wrapper });
  await waitFor(() => expect(screen.getByLabelText("Objetivo da visita *")).toBeEnabled());
  expect(mocks.rpc.mock.calls.every(([name]) => name.startsWith("rpc_get"))).toBe(true);
});

it("foco stale atualiza workspace sem substituir campo sujo em edição", async () => {
  mocks.status = "rascunho";
  const { client, wrapper } = setup(); render(<MobileVisitaWizard />, { wrapper });
  await waitFor(() => expect(screen.getByLabelText("Objetivo da visita *")).toHaveValue("Objetivo remoto"));
  fireEvent.change(screen.getByLabelText("Objetivo da visita *"), { target: { value: "Minha edição pendente" } });
  mocks.objective = "Alteração remota"; mocks.status = "aprovado"; age(client);
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
  await waitFor(() => expect(screen.getByLabelText("Objetivo da visita *")).toBeDisabled());
  expect(screen.getByLabelText("Objetivo da visita *")).toHaveValue("Minha edição pendente");
});

it.each([useVisitaWorkspace, useVisitasTecnicasLista, useAtendimentosTecnicos, useAtendimentosResumo])("consulta técnica revalida remount stale sem alterar defaults", async (hook) => {
  const { client, wrapper } = setup();
  const useRead = () => hook === useVisitaWorkspace ? useVisitaWorkspace("fake-visit") : hook();
  const first = renderHook(useRead, { wrapper }); await waitFor(() => expect(first.result.current.data).toBeDefined());
  const count = mocks.rpc.mock.calls.length; first.unmount(); mocks.status = "rascunho"; age(client);
  const next = renderHook(useRead, { wrapper });
  await waitFor(() => expect(mocks.rpc.mock.calls.length).toBeGreaterThan(count));
  await waitFor(() => expect(next.result.current.isFetching).toBe(false));
  expect(client.getDefaultOptions().queries?.refetchOnMount).toBe(false);
});

it.each(["identity", "tenant", "roles", "logout", "inactive", "loading"])("workspace oculta sessão antiga e rejeita promessa tardia em %s", async change => {
  const { client, wrapper } = setup(); const h = renderHook(() => useVisitaWorkspace("fake-visit"), { wrapper });
  await waitFor(() => expect(h.result.current.data?.status).toBe("aprovado"));
  let resolve: ((v: unknown) => void) | undefined;
  mocks.rpc.mockImplementation(() => new Promise(r => { resolve = r; }));
  await act(async () => { void h.result.current.refetch(); });
  const oldResolve = resolve;
  if (change === "identity") { mocks.auth.user = { id: "actor-B" }; mocks.auth.profile.user_id = "actor-B"; }
  if (change === "tenant") mocks.auth.profile.organization_id = "org-B";
  if (change === "roles") mocks.auth.roles = ["gestor"];
  if (change === "logout") mocks.auth.user = null;
  if (change === "inactive") mocks.auth.profile.ativo = false;
  if (change === "loading") mocks.auth.loading = true;
  h.rerender(); expect(h.result.current.data).toBeUndefined();
  await act(async () => { oldResolve?.({ data: { status: "aprovado" }, error: null }); });
  expect(h.result.current.data).toBeUndefined();
});