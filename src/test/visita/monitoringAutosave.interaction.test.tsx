import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), writes: [] as any[], version: 2, observations: "", diagnostics: [] as any[], queries: 0, diagnosticRead: null as null | Promise<any>, heldWrite: null as null | Promise<void> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: s.from, rpc: (...args: any[]) => { const promise = s.rpc(...args); return Object.assign(promise, { abortSignal: () => promise }); } } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, profile: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ativo: true }, role: "consultor_tecnico", roles: ["consultor_tecnico"], authzReady: true, loading: false }) }));
vi.mock("@/hooks/useSystemConfig", () => ({ useSystemConfig: () => ({ config: {} }) }));
vi.mock("@/hooks/useObjetivosVisita", () => ({ useObjetivosVisita: () => ({ data: [] }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useParams: () => ({ id: "11111111-1111-4111-8111-111111111111" }), useSearchParams: () => [new URLSearchParams(), vi.fn()], Link: ({ children }: any) => <span>{children}</span> }));
// Only unrelated readers replaced; real page, workspace, editor, CondutaCard and autosave effects run.
vi.mock("@/components/visita/CheckinCard", () => ({ CheckinCard: () => null, CheckinObservacoes: () => null }));
vi.mock("@/components/visita/EvidenciasTabs", () => ({ EvidenciasTabs: () => null }));
vi.mock("@/components/visita/AprovacaoCard", () => ({ AprovacaoCard: () => null }));
vi.mock("@/components/visita/VisitaTimeline", () => ({ VisitaTimeline: () => null }));
vi.mock("@/components/visita/roteiro/RoteiroVisita", () => ({ RoteiroVisita: () => null }));
vi.mock("@/components/visita/EnviarPdfVisitaDialog", () => ({ EnviarPdfVisitaDialog: () => null }));
import VisitaTecnica from "@/pages/VisitaTecnica";
import { serializeConduta, parseConduta } from "@/lib/condutaSerializer";
import { CONDUTA_DEFAULT } from "@/components/visita/CondutaCard";
import { monitoringBlock } from "@/lib/visita/preserveMonitoringPlan";
const id = "11111111-1111-4111-8111-111111111111";
const block = "[PLANO DE MONITORAMENTO]\nItens: Nutrição, Estande\nFrequência: 14 dias\nGatilhos: Avaliar vigor\nPróxima Avaliação: 2026-11-05\n[FIM DO PLANO]";
function record() { return { id, status: "rascunho", version: s.version, observacoes_tecnicas: s.observations, data_proxima_visita: "2026-11-05", objetivo_visita: "Vigor", data_vistoria: "2026-10-27", cliente_id: id, fazenda_id: id, talhao_id: id, cultura_id: id, necessidade_intervencao: "monitorar", proxima_acao_recomendada: "emitir_recomendacao" }; }
let qc: QueryClient;
function mount() { qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={qc}><VisitaTecnica /></QueryClientProvider>); }
async function settle() { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); }
async function elapse() { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); await act(async () => { await vi.advanceTimersByTimeAsync(3200); }); vi.useRealTimers(); await settle(); }
beforeEach(() => {
  vi.clearAllMocks(); s.writes = []; s.version = 2; s.queries = 0; s.diagnostics = []; s.diagnosticRead = null; s.heldWrite = null;
  s.observations = serializeConduta("Descrição preservada", { ...CONDUTA_DEFAULT, recomendacaoPreliminar: "Conduta original" }) + "\n\n" + block;
  s.rpc.mockImplementation(async (name: string, args: any) => {
    if (name === "rpc_salvar_plano_monitoramento_visita_v1") {
      expect(args.p_expected_version).toBe(s.version);
      s.version++; s.observations = s.observations.replace(block, block.replace("2026-11-05", args.p_plano.next_date));
      return { error: null, data: { ok: true, registro_id: id, version: s.version, plano: args.p_plano, request_id: args.p_request_id, aviso_id: "22222222-2222-4222-8222-222222222222", data_referencia: args.p_plano.next_date } };
    }
    return { error: null, data: { registro: record(), version: s.version, status: "rascunho", permissions: { can_view: true, can_edit: true }, monitoramento: [] } };
  });
  s.from.mockImplementation((table: string) => {
    let payload: any = null; let deleting = false; const filters: Record<string, any> = {};
    const response = () => {
      if (table === "registros_consultor" && payload) {
        s.writes.push({ payload, version: filters.version });
        if (filters.version !== s.version) return { data: null, error: { code: "PGRST116", message: "version_conflict" } };
        s.version++; s.observations = payload.observacoes_tecnicas;
        return { data: { id, version: s.version }, error: null };
      }
      if (table === "visita_diagnosticos") return !deleting && !payload && s.diagnosticRead ? s.diagnosticRead : { data: deleting || payload ? [] : s.diagnostics, error: null };
      return { data: table === "registros_consultor" ? record() : [], error: null };
    };
    const getResponse = () => table === "registros_consultor" && payload && s.heldWrite ? s.heldWrite.then(response) : Promise.resolve(response());
    const b: any = { select: () => b, eq: (k: string, v: any) => { filters[k] = v; return b; }, order: getResponse, single: getResponse, maybeSingle: getResponse, update: (p: any) => { payload = p; return b; }, insert: (p: any) => { payload = p; return b; }, delete: () => { deleting = true; return b; }, then: (resolve: any) => getResponse().then(resolve) }; return b;
  });
});
afterEach(() => { cleanup(); qc?.clear(); vi.useRealTimers(); });
it("abrir página real com plano e conduta não grava após hidratação nem após novo workspace", async () => {
  mount(); await waitFor(() => expect(screen.getAllByPlaceholderText("Anotações gerais da visita")[0]).toHaveValue("Conduta original")); await settle();
  await elapse(); expect(s.writes).toEqual([]); expect(s.version).toBe(2); expect(monitoringBlock(s.observations)).toBe(block);
  await act(async () => { await qc.invalidateQueries({ queryKey: ["visita-workspace", id] }); });
  await elapse(); expect(s.writes).toEqual([]); expect(s.version).toBe(2);
});
it("edição real de conduta autosalva com CAS observado e mantém plano exato, descrição e conduta", async () => {
  mount(); await waitFor(() => expect(screen.getAllByPlaceholderText("Anotações gerais da visita")[0]).toHaveValue("Conduta original")); await settle();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fireEvent.change(screen.getAllByPlaceholderText("Anotações gerais da visita")[0], { target: { value: "Conduta editada" } });
  await elapse(); await waitFor(() => expect(s.writes).toHaveLength(1));
  expect(s.writes[0].version).toBe(2); expect(monitoringBlock(s.observations)).toBe(block);
  expect(parseConduta(s.observations).conduta?.recomendacaoPreliminar).toBe("Conduta editada"); expect(s.observations).toContain("Descrição preservada");
  await elapse(); expect(s.writes).toHaveLength(1);
});
it("salvar plano -> onUpdate/refetch não dispara autosave de hidratação", async () => {
  mount(); await waitFor(() => expect(screen.getAllByRole("button", { name: "Editar Plano" })[0]).not.toBeDisabled()); await settle();
  fireEvent.click(screen.getAllByRole("button", { name: "Editar Plano" })[0]);
  const input = screen.getByRole("dialog").querySelector('input[type="date"]'); if (!input) throw new Error("date input missing");
  fireEvent.change(input, { target: { value: "2026-11-06" } }); fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); await settle(); await elapse();
  expect(s.version).toBe(3); expect(s.writes).toEqual([]); expect(s.observations).toContain("2026-11-06");
});
it("autosave armado antes do plano não adota versão refetchada nem perde bloco após RPC", async () => {
  mount(); await waitFor(() => expect(screen.getAllByPlaceholderText("Anotações gerais da visita")[0]).toHaveValue("Conduta original")); await settle();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fireEvent.change(screen.getAllByPlaceholderText("Anotações gerais da visita")[0], { target: { value: "Edição ainda não enviada" } });
  vi.useRealTimers();
  fireEvent.click(screen.getAllByRole("button", { name: "Editar Plano" })[0]);
  const input = screen.getByRole("dialog").querySelector('input[type="date"]'); if (!input) throw new Error("date input missing");
  fireEvent.change(input, { target: { value: "2026-11-07" } }); fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); await settle(); await elapse();
  expect(s.writes).toEqual([]); expect(s.version).toBe(3); expect(s.observations).toContain("2026-11-07");
  expect(screen.getAllByPlaceholderText("Anotações gerais da visita")[0]).toHaveValue("Edição ainda não enviada"); expect(screen.getByRole("alert")).toHaveTextContent("Sua edição foi mantida");
});
it("diagnósticos atrasados e novo envelope mesma revisão não armam autosave de hidratação", async () => {
  let finish: (value: any) => void = () => {};
  s.diagnosticRead = new Promise(r => { finish = r; });
  mount(); await waitFor(() => expect(screen.getAllByPlaceholderText("Anotações gerais da visita")[0]).toHaveValue("Conduta original"));
  await elapse(); expect(s.writes).toEqual([]);
  await act(async () => { await qc.invalidateQueries({ queryKey: ["visita-workspace", id] }); });
  await act(async () => { finish({ data: [{ id, problema: "Baixa vitalidade", descricao: "Descrição preservada", severidade: "medio" }], error: null }); });
  await elapse(); expect(s.writes).toEqual([]); expect(s.version).toBe(2); expect(monitoringBlock(s.observations)).toBe(block);
});
it("falha de diagnósticos mantém erro visível e impede autosave parcial", async () => {
  s.diagnosticRead = Promise.resolve({ data: null, error: { message: "network" } });
  mount(); await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os diagnósticos"));
  fireEvent.change(screen.getAllByPlaceholderText("Anotações gerais da visita")[0], { target: { value: "Não enviar" } });
  await elapse(); expect(s.writes).toEqual([]); expect(s.version).toBe(2);
});
it("autosave já em voo perde CAS após RPC, sem adotar revisão nova nem apagar plano", async () => {
  let finish: () => void = () => {};
  s.heldWrite = new Promise<void>(r => { finish = r; });
  mount(); await waitFor(() => expect(screen.getAllByPlaceholderText("Anotações gerais da visita")[0]).toHaveValue("Conduta original")); await settle();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fireEvent.change(screen.getAllByPlaceholderText("Anotações gerais da visita")[0], { target: { value: "Envio atrasado" } }); await elapse();
  expect(s.writes).toEqual([]);
  fireEvent.click(screen.getAllByRole("button", { name: "Editar Plano" })[0]);
  const input = screen.getByRole("dialog").querySelector('input[type="date"]'); if (!input) throw new Error("date input missing");
  fireEvent.change(input, { target: { value: "2026-11-08" } }); fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await act(async () => { finish(); }); await settle();
  expect(s.writes).toHaveLength(1); expect(s.writes[0].version).toBe(2); expect(s.version).toBe(3);
  expect(s.observations).toContain("2026-11-08"); expect(screen.getByRole("alert")).toBeTruthy();
});