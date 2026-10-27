import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import type { ReactNode } from "react";

type Row = Record<string, unknown>;
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), navigate: vi.fn(), online: true,
  registro: null as unknown as Row,
  registroError: null as null | { code: string; message: string },
  countErrors: {} as Record<string, { code: string; message: string } | undefined>,
  countNull: {} as Record<string, boolean>,
  auth: null as unknown as Row,
  reads: 0,
}));
// Real QueryClient; only the transport is simulated.
vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const result = () => {
      if (table === "registros_consultor") {
        mocks.reads += 1;
        return mocks.registroError ? { data: null, error: mocks.registroError } : { data: { ...mocks.registro }, error: null };
      }
      if (mocks.countErrors[table]) return { count: null, error: mocks.countErrors[table] };
      return { count: mocks.countNull[table] ? null : 1, error: null };
    };
    for (const m of ["select", "eq", "neq"]) q[m] = () => q;
    q.maybeSingle = async () => result();
    q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, ko);
    return q;
  };
  return { supabase: { rpc: mocks.rpc, from: (t: string) => chain(t) } };
});
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/useOfflineSync", () => ({ useOnlineStatus: () => mocks.online }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
import WizardRevisaoStep from "@/pages/app/wizard/WizardRevisaoStep";

const authFor = (user: string, org: string, roles = ["consultor_tecnico"]) => ({
  user: { id: user }, profile: { user_id: user, organization_id: org, ativo: true }, roles, loading: false, authzReady: true, authzEpoch: 0,
});
const envelope = (name: string, version = 4, id = "visit-fake") => ({ data: { id, status: name === "rpc_finalizar_visita_v2" ? "finalizado" : "enviado_aprovacao", version }, error: null });
const props = { remoteRegistroId: "visit-fake", locked: false };
let client: QueryClient;
const wrap = (ui: ReactNode) => <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
const mount = (ui: ReactNode = <WizardRevisaoStep {...props} />) => {
  const r = render(wrap(ui));
  return { ...r, rerender: (next: ReactNode) => r.rerender(wrap(next)) };
};
const ready = (name: string) => screen.findByRole("button", { name }, { timeout: 2000 });

beforeEach(() => {
  vi.clearAllMocks(); mocks.online = true; mocks.reads = 0;
  mocks.registro = { id: "visit-fake", status: "rascunho", version: 3, cultura_id: "crop-fake" };
  mocks.registroError = null; mocks.countErrors = {}; mocks.countNull = {};
  mocks.auth = authFor("actor-a", "org-a");
  mocks.rpc.mockImplementation(async (name: string) => envelope(name));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); });

it.each(["rascunho", "finalizado"])("abrir/cancelar %s não chama RPC", async (status) => {
  mocks.registro.status = status;
  mount();
  fireEvent.click(await ready(status === "rascunho" ? "Finalizar visita" : "Enviar para aprovação"));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
  ["rascunho", "Finalizar visita", "Confirmar finalização", "rpc_finalizar_visita_v2"],
  ["finalizado", "Enviar para aprovação", "Confirmar envio", "rpc_enviar_visita_aprovacao"],
])("confirma %s uma única vez com versão 3 e envelope exato", async (status, opener, confirm, rpc) => {
  mocks.registro.status = status;
  let finish: ((value: unknown) => void) | undefined;
  mocks.rpc.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  mount();
  fireEvent.click(await ready(opener));
  const button = screen.getByRole("button", { name: confirm });
  act(() => { fireEvent.click(button); fireEvent.click(button); });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledWith(rpc, { p_registro_id: "visit-fake", p_expected_version: 3 });
  expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await act(async () => { finish?.(envelope(rpc)); });
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/app/atendimentos"));
});
it.each(["resolved", "rejected"])("erro %s mantém diálogo e permite retry explícito", async (mode) => {
  if (mode === "resolved") mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "version_conflict" } });
  else mocks.rpc.mockRejectedValueOnce(new Error("Servidor temporariamente indisponível"));
  mount();
  fireEvent.click(await ready("Finalizar visita"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar finalização" }));
  await waitFor(() => expect(within(screen.getByRole("alertdialog")).getByRole("alert")).toHaveTextContent(mode === "resolved" ? "Versão desatualizada" : "Servidor temporariamente indisponível"));
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar finalização" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Confirmar finalização" }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
});
it("sucesso invalida consultas ativas da lista sem cache global", async () => {
  mocks.registro.status = "finalizado";
  const listKey = ["atendimentos-tecnicos", { aba: "todos" }];
  client.setQueryData(listKey, { status: "finalizado" });
  client.setQueryData(["unrelated"], 42);
  const listFetch = vi.fn(async () => ({ status: "enviado_aprovacao" }));
  const unsubscribe = new QueryObserver(client, { queryKey: listKey, queryFn: listFetch, staleTime: 30_000 }).subscribe(() => undefined);
  try {
    mount();
    fireEvent.click(await ready("Enviar para aprovação"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar envio" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/app/atendimentos"));
    expect(listFetch).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(["unrelated"])?.isInvalidated).toBe(false);
  } finally { unsubscribe(); }
});
it.each([
  ["null", null], ["zero", 0], ["NaN", Number.NaN], ["Infinity", Number.POSITIVE_INFINITY], ["fracionário", 3.5],
  ["negativo", -1], ["string", "3"], ["unsafe", Number.MAX_SAFE_INTEGER + 1],
])("CAS %s não despacha", async (_label, version) => {
  mocks.registro = { id: "visit-fake", status: "finalizado", version, cultura_id: "crop-fake" };
  mount();
  fireEvent.click(await ready("Enviar para aprovação"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar envio" }));
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([
  ["sem envelope", { data: null, error: null }],
  ["id errado", envelope("rpc_enviar_visita_aprovacao", 4, "visit-other")],
  ["status errado", { data: { id: "visit-fake", status: "finalizado", version: 4 }, error: null }],
  ["versão errada", envelope("rpc_enviar_visita_aprovacao", 5)],
])("resultado %s não confirma sucesso nem navega", async (_l, result) => {
  mocks.registro.status = "finalizado";
  mocks.rpc.mockResolvedValueOnce(result);
  mount();
  fireEvent.click(await ready("Enviar para aprovação"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar envio" }));
  await waitFor(() => expect(within(screen.getByRole("alertdialog")).getByRole("alert")).toHaveTextContent("Não foi possível confirmar"));
  expect(mocks.navigate).not.toHaveBeenCalled();
});
it("registro em cache seguido de 403 no refetch esconde dados e ações e oferece reconsulta", async () => {
  mocks.registro.status = "finalizado";
  mount();
  await ready("Enviar para aprovação");
  mocks.registroError = { code: "42501", message: "permission denied" };
  await act(async () => { await client.refetchQueries({ queryKey: ["wizard-revisao-registro"] }); });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Enviar para aprovação" })).toBeNull());
  expect(screen.queryByText("Resumo da visita")).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível confirmar os dados atuais");
  mocks.registroError = null;
  fireEvent.click(screen.getByRole("button", { name: "Consultar novamente" }));
  await ready("Enviar para aprovação");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(["visitas_checkin", "visitas_campo", "visita_diagnosticos", "registros_consultor_recomendacoes", "registros_consultor_arquivos"])(
  "erro na contagem %s não vira 0 nem libera ações", async (table) => {
  mocks.registro.status = "finalizado";
  mocks.countErrors[table] = { code: "42501", message: "permission denied" };
  mount();
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível confirmar"));
  expect(screen.queryByRole("button", { name: "Enviar para aprovação" })).toBeNull();
  expect(screen.queryByText("Check-in")).toBeNull();
});
it("contagem sem número (null) não é apresentada como 0", async () => {
  mocks.countNull.visita_diagnosticos = true;
  mount();
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Finalizar visita" })).toBeNull();
});
it("registro com id divergente não habilita ações", async () => {
  mocks.registro = { id: "visit-other", status: "finalizado", version: 3, cultura_id: "crop-fake" };
  mount();
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Enviar para aprovação" })).toBeNull();
});
it("sessão não pronta não lê nem mostra ações", async () => {
  mocks.auth = { ...authFor("actor-a", "org-a"), authzReady: false };
  mount();
  expect(screen.getByRole("alert")).toHaveTextContent("Sessão alterada");
  expect(mocks.reads).toBe(0);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("sessão muda para não pronta após carregar: dados em cache e ações somem", async () => {
  mocks.registro.status = "finalizado";
  const { rerender } = mount();
  await ready("Enviar para aprovação");
  mocks.auth = { ...authFor("actor-a", "org-a"), authzReady: false };
  rerender(<WizardRevisaoStep {...props} />);
  expect(screen.queryByRole("button", { name: "Enviar para aprovação" })).toBeNull();
  expect(screen.queryByText("Resumo da visita")).toBeNull();
});
it.each([["ator", () => authFor("actor-b", "org-a")], ["tenant", () => authFor("actor-a", "org-b")], ["roles", () => authFor("actor-a", "org-a", ["gestor"])]])(
  "troca de %s com RPC pendente: resultado descartado, nova identidade lê de novo e não herda pending", async (_l, next) => {
  mocks.registro.status = "finalizado";
  let finish: ((v: unknown) => void) | undefined;
  mocks.rpc.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
  const { rerender } = mount();
  fireEvent.click(await ready("Enviar para aprovação"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar envio" }));
  const readsBefore = mocks.reads;
  mocks.auth = next();
  rerender(<WizardRevisaoStep {...props} />);
  await waitFor(() => expect(mocks.reads).toBeGreaterThan(readsBefore));
  fireEvent.click(await ready("Enviar para aprovação"));
  await act(async () => { finish?.(envelope("rpc_enviar_visita_aprovacao")); });
  expect(mocks.navigate).not.toHaveBeenCalled();
  const confirm = screen.getByRole("button", { name: "Confirmar envio" });
  expect(confirm).not.toBeDisabled();
  fireEvent.click(confirm);
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
});
it("RPC antigo pendente que falha após troca de visita não altera a nova UI", async () => {
  mocks.registro.status = "finalizado";
  let fail: ((e: unknown) => void) | undefined;
  mocks.rpc.mockImplementationOnce(() => new Promise((_r, j) => { fail = j; }));
  const { rerender } = mount();
  fireEvent.click(await ready("Enviar para aprovação"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar envio" }));
  mocks.registro = { id: "visit-two", status: "finalizado", version: 7, cultura_id: "crop-fake" };
  rerender(<WizardRevisaoStep remoteRegistroId="visit-two" locked={false} />);
  fireEvent.click(await ready("Enviar para aprovação"));
  await act(async () => { fail?.(new Error("version_conflict")); });
  expect(screen.queryByText("Versão desatualizada. Recarregue a visita e tente novamente.")).toBeNull();
  expect(screen.getByRole("button", { name: "Confirmar envio" })).not.toBeDisabled();
});
it("troca de ator durante invalidação não navega nem mostra sucesso", async () => {
  mocks.registro.status = "finalizado";
  mount();
  fireEvent.click(await ready("Enviar para aprovação"));
  let release: (() => void) | undefined;
  const spy = vi.spyOn(client, "invalidateQueries").mockImplementation(() => new Promise<void>((r) => { release = r; }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar envio" }));
  await waitFor(() => expect(spy).toHaveBeenCalled());
  mocks.auth = authFor("actor-b", "org-b");
  await act(async () => { client.setQueryData(["noop"], 1); });
  cleanup();
  await act(async () => { release?.(); });
  expect(mocks.navigate).not.toHaveBeenCalled();
});
it("status atualizado enquanto confirmação está aberta impede RPC", async () => {
  mount();
  fireEvent.click(await ready("Finalizar visita"));
  mocks.registro.status = "aprovado";
  await act(async () => { await client.refetchQueries({ queryKey: ["wizard-revisao-registro"] }); });
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar finalização" })).toBeDisabled());
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("bloqueio de edição e offline não oferecem finalização ativa", async () => {
  const { rerender } = mount(<WizardRevisaoStep {...props} locked />);
  await waitFor(() => expect(screen.getByText("Resumo da visita")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Finalizar visita" })).toBeNull();
  mocks.online = false;
  rerender(<WizardRevisaoStep {...props} />);
  expect(await ready("Finalizar visita")).toBeDisabled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
