import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { __resetOfflineDbForTests, getAllPendingRecomendacoes, savePendingRecomendacao, type PendingRecomendacao } from "@/lib/offlineDb";

const state = vi.hoisted(() => ({ user: "A", org: "TA", epoch: 0, remote: false, conflict: false,
  deferWrite: null as Promise<void> | null, deferRead: null as Promise<void> | null,
  writeStarted: false, readStarted: false, concurrent: false,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user ? { id: state.user } : null,
  profile: { user_id: state.user, organization_id: state.org, ativo: true }, roles: ["consultor_tecnico"], loading: false }) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({ ready: !!state.user, capture: () => {
  const epoch = state.epoch; const actor = state.user; const org = state.org;
  return () => !!state.user && state.epoch === epoch && state.user === actor && state.org === org;
} }) }));
vi.mock("@/hooks/useTenantCatalogVisibility", () => ({ useTenantCatalogScope: () => state.user ? { userId: state.user, organizationId: state.org } : null }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useParams: () => ({ id: "remote-explicit" }), useSearchParams: () => [new URLSearchParams("step=5")] }));
vi.mock("@/hooks/useUnsavedChanges", () => ({ useUnsavedChanges: vi.fn() }));
vi.mock("@/hooks/useObjetivosVisita", () => ({ useObjetivosVisita: () => ({ data: [] }) }));
vi.mock("@/pages/app/wizard/WizardCheckinStep", () => ({ default: () => null }));
vi.mock("@/pages/app/wizard/WizardCampoStep", () => ({ default: () => null }));
vi.mock("@/pages/app/wizard/WizardDiagnosticoStep", () => ({ default: () => null }));
vi.mock("@/pages/app/wizard/WizardAnexosStep", () => ({ default: () => <div>Anexos abertos</div> }));
vi.mock("@/pages/app/wizard/WizardRevisaoStep", () => ({ default: () => null }));
vi.mock("@/components/visita/AcompanhamentoVisita", () => ({ AcompanhamentoVisita: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: state.user } }, error: null }) },
  rpc: async (name: string, args: any) => {
    if (name === "rpc_upsert_recomendacao_visita") {
      state.writeStarted = true;
      if (state.deferWrite) await state.deferWrite;
      if (state.conflict) return { data: null, error: { message: "version_conflict" } };
      state.remote = true;
      if (state.concurrent) await savePendingRecomendacao(entry({ updatedAt: "2", payload: { recomendacao_tecnica: "Edição mais nova" } }));
      return { data: { id: "rec", versao: 1, client_uuid: args.p_client_uuid }, error: null };
    }
    const owns = state.user === "A" && state.org === "TA";
    const data = { registro: { id: "remote-explicit" }, status: "rascunho", version: 1,
      permissions: { can_edit: owns, can_view: owns, is_editable_status: true },
      recomendacoes: owns && state.remote ? [remoteRow] : [] };
    if (state.remote && state.deferRead) { state.readStarted = true; await state.deferRead; }
    return { data, error: null };
  },
  from: (table: string) => {
    const owns = state.user === "A" && state.org === "TA";
    let selected = "*";
    const result = () => ({ data: table === "profiles" ? { user_id: state.user, organization_id: state.org, ativo: true }
      : table === "registros_consultor" ? { id: "remote-explicit", cultura_id: "crop", status: "rascunho" }
      : table === "registros_consultor_recomendacoes" ? (owns && state.remote ? selected === "id" ? { id: "rec" } : [remoteRow] : selected === "id" ? null : [])
      : ["visitas_checkin", "visitas_campo", "visita_diagnosticos"].includes(table) ? { id: "persisted" } : [], error: null });
    const read = async () => {
      const snapshot = result();
      if (table === "registros_consultor_recomendacoes" && state.remote && state.deferRead) { state.readStarted = true; await state.deferRead; }
      return snapshot;
    };
    const builder = { select: (value: string) => { selected = value; return builder; }, eq: () => builder,
      limit: () => builder, order: () => builder, abortSignal: () => builder,
      maybeSingle: read, then: (resolve: any, reject: any) => read().then(resolve, reject) };
    return builder;
  },
} }));
import { useOfflineSync } from "@/hooks/useOfflineSync";
import MobileVisitaWizard from "@/pages/app/MobileVisitaWizard";
const remoteRow = { id: "rec", client_uuid: "idempotent-rec", versao: 1, recomendacao_tecnica: "Recomendação sincronizada A", encaminhar_para_os: false };
const entry = (patch: Partial<PendingRecomendacao> = {}): PendingRecomendacao => ({ clientUuid: "idempotent-rec", localRegistroId: "local",
  remoteRegistroId: "remote-explicit", ownerUserId: "A", ownerOrganizationId: "TA", versionContract: "expected_v1",
  payload: { recomendacao_tecnica: "Rascunho A", encaminhar_para_os: false }, versao: 1, updatedAt: "1", syncStatus: "pending_sync", ...patch });
function App() { const sync = useOfflineSync(); return <><button onClick={() => void sync.syncAll()}>Sincronizar</button><MobileVisitaWizard /></>; }
let client: QueryClient;
beforeEach(async () => {
  Object.assign(state, { user: "A", org: "TA", epoch: 0, remote: false, conflict: false, deferWrite: null, deferRead: null, writeStarted: false, readStarted: false, concurrent: false });
  Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  await __resetOfflineDbForTests();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
});
afterEach(() => { cleanup(); client.clear(); });
async function mount() {
  const ui = () => <QueryClientProvider client={client}><App /></QueryClientProvider>;
  const view = render(ui());
  await waitFor(() => expect(screen.getByText(/Nenhuma recomendação ainda/)).toBeTruthy());
  expect(screen.getByRole("button", { name: "6 Anexos" })).toBeDisabled();
  await savePendingRecomendacao(entry());
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  return { ...view, rerenderApp: () => view.rerender(ui()) };
}
it("Sincronizar atualiza o wizard aberto, workspace e flag após RPC/CAS, liberando etapa6 sem reload", async () => {
  await mount(); fireEvent.click(screen.getByRole("button", { name: "Sincronizar" }));
  await waitFor(() => expect(screen.getByText("Recomendação sincronizada A")).toBeTruthy());
  await waitFor(() => expect(screen.getByRole("button", { name: "6 Anexos" })).toBeEnabled());
  expect(await getAllPendingRecomendacoes()).toEqual([]);
  expect(client.getQueryCache().findAll({ queryKey: ["visita-workspace"] })[0]?.state.data).toMatchObject({ recomendacoes: [{ id: "rec" }] });
  expect(screen.queryByText("pendente")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "6 Anexos" }));
  expect(screen.getByText("Anexos abertos")).toBeTruthy();
});
it("CAS perdido preserva edição mais nova e não invalida consultas nem libera etapa6", async () => {
  await mount(); state.concurrent = true;
  const invalidation = vi.spyOn(client, "invalidateQueries");
  fireEvent.click(screen.getByRole("button", { name: "Sincronizar" }));
  await waitFor(() => expect(state.remote).toBe(true));
  await waitFor(async () => expect(await getAllPendingRecomendacoes()).toEqual([expect.objectContaining({ updatedAt: "2" })]));
  expect(invalidation).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "6 Anexos" })).toBeDisabled();
});
it("conflito mantém pendência e consultas sem invalidação", async () => {
  await mount(); state.conflict = true; const invalidation = vi.spyOn(client, "invalidateQueries");
  fireEvent.click(screen.getByRole("button", { name: "Sincronizar" }));
  await waitFor(async () => expect(await getAllPendingRecomendacoes()).toEqual([expect.objectContaining({ syncStatus: "sync_error", versao: 1 })]));
  expect(invalidation).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "6 Anexos" })).toBeDisabled();
});
it.each(["actor", "tenant", "logout"])("%s durante RPC impede invalidação do cache anterior", async change => {
  const view = await mount(); let release = () => {}; state.deferWrite = new Promise<void>(r => { release = r; });
  const invalidation = vi.spyOn(client, "invalidateQueries");
  fireEvent.click(screen.getByRole("button", { name: "Sincronizar" }));
  await waitFor(() => expect(state.writeStarted).toBe(true));
  if (change === "actor") state.user = "B"; else if (change === "tenant") state.org = "TB"; else state.user = "";
  view.rerenderApp(); await act(async () => { release(); });
  await waitFor(async () => expect(await getAllPendingRecomendacoes()).toHaveLength(1));
  expect(invalidation).not.toHaveBeenCalled(); expect(screen.queryByText("Recomendação sincronizada A")).toBeNull();
  if (change === "logout") expect(screen.queryByRole("button", { name: "6 Anexos" })).toBeNull();
  else expect(screen.getByRole("button", { name: "6 Anexos" })).toBeDisabled();
});
it("troca de ator durante refetch rejeita bytes tardios e não publica cache de A em B", async () => {
  const view = await mount(); let release = () => {}; state.deferRead = new Promise<void>(r => { release = r; });
  fireEvent.click(screen.getByRole("button", { name: "Sincronizar" }));
  await waitFor(() => expect(state.readStarted).toBe(true));
  expect(await getAllPendingRecomendacoes()).toEqual([]);
  state.user = "B"; view.rerenderApp(); await act(async () => { release(); });
  await waitFor(() => expect(screen.getByRole("button", { name: "6 Anexos" })).toBeDisabled());
  expect(screen.queryByText("Recomendação sincronizada A")).toBeNull();
  const recommendationData = client.getQueryCache().findAll({ queryKey: ["wizard-rec"] }).map(q => q.state.data);
  expect(recommendationData.some(data => Array.isArray(data) && data.some(row => row.id === "rec"))).toBe(false);
});