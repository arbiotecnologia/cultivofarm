import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { useReprogramarMonitoramento, REPROGRAMACAO_ORIGEM_INDISPONIVEL } from "@/hooks/useReprogramarMonitoramento";
import { useVincularOrigemAlerta, ORIGEM_INDISPONIVEL } from "@/hooks/useOrigemAlertaAgronomico";
import { OrigemAlertaAgronomico } from "@/components/visita/OrigemAlertaAgronomico";

const s = vi.hoisted(() => ({ rpc: vi.fn(), ready: true, actor: "A", epoch: 0 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => s.rpc(...a) } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: s.actor }, profile: { user_id: s.actor, organization_id: s.actor, ativo: true }, roles: ["gestor"], loading: false, authzReady: s.ready, authzEpoch: s.epoch, checkAuthzAccess: () => s.ready }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ALERTA = "11111111-1111-4111-8111-111111111111";
const VISITA = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";
const AT = "2026-10-27T10:00:00.123456+00:00";
const alerta = { id: ALERTA, tipo_alerta: "praga", nivel_risco: "alto", status: "monitoramento", data_vencimento: "2026-11-01", updated_at: AT, descricao: null, registro_origem_id: null };
const wrap = () => { const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>; };
beforeEach(() => { s.rpc.mockReset(); s.ready = true; s.actor = "A"; s.epoch = 0; });

const v2 = (o: Record<string, unknown> = {}) => ({ success: true, alerta_id: ALERTA, data_anterior: "2026-11-01", nova_data: "2026-11-20",
  registro_origem_id: VISITA, visita_atualizada: true, visit_version: 4, alerta_updated_at: "2026-10-27T10:00:01.000001+00:00", request_id: KEY, ...o });
const args = { id: ALERTA, date: "2026-11-20", expectedUpdatedAt: AT, origemId: VISITA, expectedVisitVersion: 3, requestId: KEY };

it("alerta com origem usa somente v2 com CAS de alerta (microssegundos) e versão da visita", async () => {
  s.rpc.mockResolvedValue({ data: v2(), error: null });
  const h = renderHook(() => useReprogramarMonitoramento(), { wrapper: wrap() });
  await act(async () => { await h.result.current.mutateAsync(args); });
  expect(s.rpc).toHaveBeenCalledExactlyOnceWith("rpc_reprogramar_monitoramento_v2", { p_alerta_id: ALERTA, p_nova_data: "2026-11-20",
    p_expected_alert_updated_at: AT, p_expected_visit_version: 3, p_request_id: KEY });
});
it("visita finalizada: envelope sem atualização mantém a mesma versão", async () => {
  s.rpc.mockResolvedValue({ data: v2({ visita_atualizada: false, visit_version: 3 }), error: null });
  const h = renderHook(() => useReprogramarMonitoramento(), { wrapper: wrap() });
  await act(async () => { await h.result.current.mutateAsync(args); });
});
it.each([[{ visit_version: 3 }], [{ registro_origem_id: ALERTA }], [{ request_id: VISITA }], [{ extra: 1 }], [{ visita_atualizada: "sim" }]])("envelope v2 inválido %j não confirma", async o => {
  s.rpc.mockResolvedValue({ data: v2(o), error: null });
  const h = renderHook(() => useReprogramarMonitoramento(), { wrapper: wrap() });
  await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow("não confirmada"); });
  expect(s.rpc).toHaveBeenCalledTimes(1);
});
it.each([null, 0, 1.5])("versão de visita %s nega antes do envio", async v => {
  const h = renderHook(() => useReprogramarMonitoramento(), { wrapper: wrap() });
  await act(async () => { await expect(h.result.current.mutateAsync({ ...args, expectedVisitVersion: v as number })).rejects.toThrow("alterado"); });
  expect(s.rpc).not.toHaveBeenCalled();
});
it("v2 ausente não cai para v1 nem escrita direta", async () => {
  s.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } });
  const h = renderHook(() => useReprogramarMonitoramento(), { wrapper: wrap() });
  await act(async () => { await expect(h.result.current.mutateAsync(args)).rejects.toThrow(REPROGRAMACAO_ORIGEM_INDISPONIVEL); });
  expect(s.rpc).toHaveBeenCalledTimes(1); expect(s.rpc.mock.calls[0][0]).toBe("rpc_reprogramar_monitoramento_v2");
});
it("cliente antigo (v1) recebendo PT428 exibe mensagem segura", async () => {
  s.rpc.mockResolvedValue({ data: null, error: { code: "PT428", message: "monitoring_reschedule_requires_current_client" } });
  const h = renderHook(() => useReprogramarMonitoramento(), { wrapper: wrap() });
  await act(async () => { await expect(h.result.current.mutateAsync({ id: ALERTA, date: "2026-11-20", expectedUpdatedAt: AT })).rejects.toThrow(REPROGRAMACAO_ORIGEM_INDISPONIVEL); });
  expect(s.rpc.mock.calls[0][0]).toBe("rpc_reprogramar_monitoramento_v1");
});

const linkResult = (o: Record<string, unknown> = {}) => ({ ok: true, alerta_id: ALERTA, registro_origem_id: VISITA, tipo_alerta: "praga", alerta_updated_at: "2026-10-27T10:00:01+00:00", visit_version: 3, request_id: KEY, ...o });
it("vínculo envia CAS do alerta e da visita e exige tipo real inalterado", async () => {
  s.rpc.mockResolvedValue({ data: linkResult(), error: null });
  const h = renderHook(() => useVincularOrigemAlerta(VISITA), { wrapper: wrap() });
  await act(async () => { await h.result.current.mutateAsync({ alerta, registroId: VISITA, expectedVisitVersion: 3, requestId: KEY }); });
  expect(s.rpc).toHaveBeenCalledExactlyOnceWith("rpc_vincular_origem_alerta_v1", { p_alerta_id: ALERTA, p_registro_id: VISITA,
    p_expected_alert_updated_at: AT, p_expected_visit_version: 3, p_request_id: KEY });
});
it.each([[{ tipo_alerta: "estresse_hidrico" }], [{ registro_origem_id: ALERTA }], [{ visit_version: 4 }]])("vínculo com retorno %j não confirma", async o => {
  s.rpc.mockResolvedValue({ data: linkResult(o), error: null });
  const h = renderHook(() => useVincularOrigemAlerta(VISITA), { wrapper: wrap() });
  await act(async () => { await expect(h.result.current.mutateAsync({ alerta, registroId: VISITA, expectedVisitVersion: 3, requestId: KEY })).rejects.toThrow("não confirmada"); });
});
it.each([["PT409", "alterados"], ["22023", "mesma fazenda"], ["PT404", "acessar"], ["PGRST202", ORIGEM_INDISPONIVEL]])("vínculo erro %s sem repetir", async (code, msg) => {
  s.rpc.mockResolvedValue({ data: null, error: { code, message: code } });
  const h = renderHook(() => useVincularOrigemAlerta(VISITA), { wrapper: wrap() });
  await act(async () => { await expect(h.result.current.mutateAsync({ alerta, registroId: VISITA, expectedVisitVersion: 3, requestId: KEY })).rejects.toThrow(msg); });
  expect(s.rpc).toHaveBeenCalledTimes(1);
});

function route(link: () => unknown) {
  s.rpc.mockImplementation((fn: string) => fn === "rpc_listar_alertas_vinculaveis_v1" ? Promise.resolve({ data: [alerta], error: null }) : link());
}
it("UI: cancelar não envia; confirmar envia uma vez e notifica a visita", async () => {
  const onUpdate = vi.fn(); route(() => Promise.resolve({ data: linkResult({ request_id: undefined }), error: null }));
  render(<OrigemAlertaAgronomico registroId={VISITA} locked={false} visitVersion={3} onUpdate={onUpdate} />, { wrapper: wrap() });
  fireEvent.click(await screen.findByRole("button", { name: /Vincular/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
  await waitFor(() => expect(screen.queryByText("Vincular alerta a esta visita?")).toBeNull());
  expect(s.rpc.mock.calls.filter(c => c[0] === "rpc_vincular_origem_alerta_v1")).toHaveLength(0);
  s.rpc.mockImplementation((fn: string, a: { p_request_id?: string }) => fn === "rpc_listar_alertas_vinculaveis_v1"
    ? Promise.resolve({ data: [alerta], error: null }) : Promise.resolve({ data: linkResult({ request_id: a.p_request_id }), error: null }));
  fireEvent.click(screen.getByRole("button", { name: /Vincular/ }));
  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Confirmar vínculo" })); });
  await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
  expect(s.rpc.mock.calls.filter(c => c[0] === "rpc_vincular_origem_alerta_v1")).toHaveLength(1);
});
it("UI: visita finalizada/somente leitura não oferece vínculo", async () => {
  route(() => Promise.reject(new Error("must not write")));
  render(<OrigemAlertaAgronomico registroId={VISITA} locked visitVersion={3} onUpdate={() => {}} />, { wrapper: wrap() });
  await screen.findByText(/Nenhum alerta agronômico vinculado/);
  expect(screen.queryByRole("button", { name: /Vincular/ })).toBeNull();
});
it("UI: servidor sem instalação mostra indisponível sem caminho alternativo", async () => {
  s.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "x" } });
  render(<OrigemAlertaAgronomico registroId={VISITA} locked={false} visitVersion={3} onUpdate={() => {}} />, { wrapper: wrap() });
  await screen.findByText(ORIGEM_INDISPONIVEL);
  expect(s.rpc).toHaveBeenCalledTimes(1);
});
it("UI: incerteza mantém a mesma chave na nova confirmação", async () => {
  const keys: string[] = [];
  s.rpc.mockImplementation((fn: string, a: { p_request_id: string }) => {
    if (fn === "rpc_listar_alertas_vinculaveis_v1") return Promise.resolve({ data: [alerta], error: null });
    keys.push(a.p_request_id); return Promise.resolve({ data: null, error: { code: "08006", message: "timeout" } });
  });
  render(<OrigemAlertaAgronomico registroId={VISITA} locked={false} visitVersion={3} onUpdate={() => {}} />, { wrapper: wrap() });
  fireEvent.click(await screen.findByRole("button", { name: /Vincular/ }));
  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Confirmar vínculo" })); });
  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Confirmar vínculo" })); });
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
});
