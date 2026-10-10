import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportShell } from "@/components/financeiro/relatorios/ReportShell";
import RelatorioMensal from "@/pages/financeiro/relatorios/RelatorioMensal";

const state = vi.hoisted(() => ({
  auth: { user: { id: "A", email: "" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["financeiro"], loading: false, error: null as string | null },
  rpc: vi.fn(), invoke: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc, functions: { invoke: state.invoke } } }));
vi.mock("sonner", () => ({ toast: { error: state.error, success: state.success, warning: state.warning } }));
type Response = { data: unknown; error: { message: string } | null };
function deferred() {
  let resolve: (value: Response) => void = () => {};
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}
const defaults = { from: "2026-10-01", to: "2026-10-09" };
function element(reportType = "monthly") {
  return <ReportShell title="Relatório financeiro" reportType={reportType} defaultFilters={defaults}
    renderFilters={(filters, set) => <input aria-label="Cliente filtro" value={String(filters.customer_id ?? "")} onChange={(e) => set({ ...filters, customer_id: e.target.value })} />}
    renderPreview={(data) => <div>{JSON.stringify(data)}</div>} />;
}
function change(kind: string) {
  if (kind === "identity") { state.auth.user.id = "B"; state.auth.profile.user_id = "B"; }
  if (kind === "tenant" || kind === "aba") state.auth.profile.organization_id = "OB";
  if (kind === "readiness") state.auth.loading = true;
  if (kind === "authError") state.auth.error = "falha interna de autenticação";
}
beforeEach(() => {
  Object.assign(state.auth, { user: { id: "A", email: "" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["financeiro"], loading: false, error: null });
  vi.clearAllMocks(); state.rpc.mockReset(); state.invoke.mockReset();
  state.rpc.mockResolvedValue({ data: ["PREVIA-A"], error: null });
  state.invoke.mockResolvedValue({ data: null, error: null });
  vi.spyOn(window, "print").mockImplementation(() => {});
  vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function settle(pending: ReturnType<typeof deferred>, response: Response) {
  await act(async () => { pending.resolve(response); await pending.promise; });
}
async function generate() { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Gerar prévia" })); }); }

describe("ReportShell — sessão real do hook / RPC e Edge mockados", () => {
  for (const kind of ["identity", "tenant", "aba", "readiness", "authError", "reportType"]) {
    it(`descarta resultado tardio e filtros sensíveis em ${kind}`, async () => {
      const pending = deferred(); state.rpc.mockReturnValueOnce(pending.promise);
      const view = render(element());
      fireEvent.change(screen.getByLabelText("Cliente filtro"), { target: { value: "CLIENTE-A" } });
      await generate(); change(kind); view.rerender(element(kind === "reportType" ? "payables" : "monthly"));
      if (kind === "aba") { state.auth.profile.organization_id = "OA"; view.rerender(element()); }
      expect(screen.getByLabelText("Cliente filtro")).toHaveValue("");
      await settle(pending, { data: ["VAZAMENTO-A"], error: null });
      expect(screen.queryByText(/VAZAMENTO-A/)).toBeNull();
      expect(screen.queryByText(/Gerado em:/)).toBeNull();
      expect(screen.queryByText(/Filtros aplicados:/)).toBeNull();
    });
    it(`limpa prévia já concluída em ${kind}`, async () => {
      const view = render(element()); await generate(); expect(screen.getByText(/PREVIA-A/)).toBeTruthy();
      change(kind); view.rerender(element(kind === "reportType" ? "payables" : "monthly"));
      if (kind === "aba") { state.auth.profile.organization_id = "OA"; view.rerender(element()); }
      expect(screen.queryByText(/PREVIA-A/)).toBeNull();
    });
  }
  for (const kind of ["identity", "tenant", "aba", "readiness", "authError", "reportType"]) {
    it(`exportação tardia não abre arquivo nem libera pedido novo em ${kind}`, async () => {
      const old = deferred(), next = deferred(); state.invoke.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
      const view = render(element()); fireEvent.click(screen.getByRole("button", { name: "PDF" }));
      change(kind); view.rerender(element(kind === "reportType" ? "payables" : "monthly"));
      if (kind === "aba") { state.auth.profile.organization_id = "OA"; view.rerender(element()); }
      if (kind === "readiness") { state.auth.loading = false; view.rerender(element()); }
      if (kind === "authError") { state.auth.error = null; view.rerender(element()); }
      fireEvent.click(screen.getByRole("button", { name: "Excel" }));
      expect(state.invoke).toHaveBeenCalledTimes(2);
      await settle(old, { data: { url: "arquivo-ficticio" }, error: null });
      expect(window.open).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "CSV" })).toBeDisabled();
      await settle(next, { data: null, error: { message: "falha nova" } });
      expect(screen.getByRole("button", { name: "CSV" })).not.toBeDisabled();
    });
  }
  it("não aceita finally ou erro de geração antiga no pedido novo", async () => {
    const old = deferred(), next = deferred(); state.rpc.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const view = render(element()); await generate(); state.auth.profile.organization_id = "OB"; view.rerender(element());
    await generate(); expect(state.rpc).toHaveBeenCalledTimes(2);
    await settle(old, { data: null, error: { message: "erro antigo" } });
    expect(state.error).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Gerar prévia" })).toBeDisabled();
    await settle(next, { data: ["PREVIA-B"], error: null }); expect(screen.getByText(/PREVIA-B/)).toBeTruthy();
  });
  it("não rotula nem exporta/imprime resultado antigo com filtros editados", async () => {
    const pending = deferred(); state.rpc.mockReturnValueOnce(pending.promise); render(element());
    fireEvent.change(screen.getByLabelText("Cliente filtro"), { target: { value: "APLICADO" } }); await generate();
    fireEvent.change(screen.getByLabelText("Cliente filtro"), { target: { value: "EDITADO" } });
    await settle(pending, { data: ["PREVIA-A"], error: null });
    const label = screen.getByText(/Filtros aplicados:/); expect(label).toHaveTextContent("APLICADO"); expect(label).not.toHaveTextContent("EDITADO");
    expect(state.rpc.mock.calls[0][1].customer_id).toBe("APLICADO");
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" })); expect(window.print).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "CSV" })); });
    expect(state.invoke.mock.calls[0][1].body.filters.customer_id).toBe("EDITADO");
  });
  it("erro atual remove prévia/metadados anteriores e permite repetir", async () => {
    const raw = "permission denied for private_tenant_table sensitive-id";
    render(element()); await generate(); state.rpc.mockResolvedValueOnce({ data: null, error: { message: raw } });
    await generate(); expect(screen.queryByText(/PREVIA-A/)).toBeNull(); expect(screen.queryByText(/Gerado em:/)).toBeNull();
    const safe = "Não foi possível gerar a prévia. Verifique seu acesso e tente novamente.";
    expect(screen.getByRole("alert")).toHaveTextContent(safe);
    expect(state.error).toHaveBeenCalledWith(safe);
    expect(screen.queryByText(raw)).toBeNull(); expect(state.error).not.toHaveBeenCalledWith(raw);
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeDisabled();
    await generate(); expect(screen.getByText(/PREVIA-A/)).toBeTruthy(); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("mostra loading e vazio como estados distintos", async () => {
    const pending = deferred(); state.rpc.mockReturnValueOnce(pending.promise); render(element()); await generate();
    expect(screen.getByRole("status")).toHaveTextContent(/Gerando/);
    await settle(pending, { data: [], error: null }); expect(screen.getByRole("status")).toHaveTextContent(/Nenhum/);
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeDisabled();
  });
  for (const loss of ["loading", "inactive", "mismatch", "roles", "tenant", "authError"]) {
    it(`bloqueia gerar/exportar/imprimir com sessão inapta ${loss}`, async () => {
      const view = render(element()); await generate();
      if (loss === "loading") state.auth.loading = true;
      if (loss === "inactive") state.auth.profile.ativo = false;
      if (loss === "mismatch") state.auth.profile.user_id = "OUTRO";
      if (loss === "roles") state.auth.roles = [];
      if (loss === "tenant") state.auth.profile.organization_id = "";
      if (loss === "authError") state.auth.error = "erro auth com perfil anterior persistente";
      view.rerender(element());
      for (const name of ["Gerar prévia", "PDF", "Excel", "CSV", "Imprimir"]) {
        const button = screen.getByRole("button", { name }); expect(button).toBeDisabled(); fireEvent.click(button);
      }
      expect(state.rpc).toHaveBeenCalledTimes(1); expect(state.invoke).not.toHaveBeenCalled(); expect(window.print).not.toHaveBeenCalled();
    });
  }
  it("lock síncrono impede geração e exportação duplicadas/cruzadas", async () => {
    const pending = deferred(); state.rpc.mockReturnValueOnce(pending.promise); render(element());
    const button = screen.getByRole("button", { name: "Gerar prévia" });
    act(() => { fireEvent.click(button); fireEvent.click(button); fireEvent.click(screen.getByRole("button", { name: "PDF" })); });
    expect(state.rpc).toHaveBeenCalledTimes(1); expect(state.invoke).not.toHaveBeenCalled();
    await settle(pending, { data: ["PREVIA-A"], error: null });
    const exp = deferred(); state.invoke.mockReturnValueOnce(exp.promise);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "CSV" })); fireEvent.click(screen.getByRole("button", { name: "PDF" })); fireEvent.click(button); });
    expect(state.invoke).toHaveBeenCalledTimes(1); expect(state.rpc).toHaveBeenCalledTimes(1);
  });
  it("desmontagem descarta respostas de geração e exportação", async () => {
    const old = deferred(); state.rpc.mockReturnValueOnce(old.promise);
    const view = render(element()); await generate(); view.unmount();
    await settle(old, { data: ["ANTIGO"], error: null });
    const exp = deferred(); state.invoke.mockReturnValueOnce(exp.promise);
    const next = render(element()); fireEvent.click(screen.getByRole("button", { name: "PDF" })); next.unmount();
    await settle(exp, { data: { url: "arquivo-ficticio" }, error: null });
    expect(window.open).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
  });
  it("rejeição atual não prende lock e mantém erro explícito", async () => {
    state.rpc.mockRejectedValueOnce(new Error("rede indisponível")); render(element()); await generate();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível gerar a prévia. Verifique seu acesso e tente novamente.");
    expect(state.error).not.toHaveBeenCalledWith("rede indisponível"); await generate();
    expect(screen.getByText(/PREVIA-A/)).toBeTruthy();
  });
  it("recuperação de auth.error não revive resultado nem finally anterior", async () => {
    const old = deferred(), next = deferred();
    state.rpc.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const view = render(element());
    fireEvent.change(screen.getByLabelText("Cliente filtro"), { target: { value: "SENSIVEL" } });
    await generate(); state.auth.error = "auth falhou"; view.rerender(element());
    expect(screen.getByRole("status")).toHaveTextContent("Sessão indisponível");
    state.auth.error = null; view.rerender(element());
    expect(screen.getByLabelText("Cliente filtro")).toHaveValue("");
    await generate(); await settle(old, { data: ["ANTIGO-ERROR"], error: null });
    expect(screen.queryByText(/ANTIGO-ERROR/)).toBeNull();
    expect(screen.getByRole("button", { name: "Gerar prévia" })).toBeDisabled();
    await settle(next, { data: ["RECUPERADO"], error: null });
    expect(screen.getByText(/RECUPERADO/)).toBeTruthy();
  });
  it("recuperação de auth.error exige nova geração após limpar prévia concluída", async () => {
    const view = render(element()); await generate();
    state.auth.error = "auth falhou"; view.rerender(element());
    state.auth.error = null; view.rerender(element());
    expect(screen.queryByText(/PREVIA-A/)).toBeNull();
    expect(screen.queryByText(/Gerado em:/)).toBeNull();
    expect(screen.queryByText(/Filtros aplicados:/)).toBeNull();
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeDisabled();
    await generate(); expect(screen.getByText(/PREVIA-A/)).toBeTruthy();
  });
});

describe("RelatorioMensal concreto — datas civis e contrato RPC mockado", () => {
  it.each([
    ["2026-10-10T01:44:00Z", "2026-10-01", "2026-10-09"],
    ["2026-11-01T01:00:00Z", "2026-10-01", "2026-10-31"],
    ["2026-11-01T03:00:00Z", "2026-11-01", "2026-11-01"],
  ])("usa dia São Paulo em %s", async (instant, from, to) => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(instant));
    render(<RelatorioMensal />);
    expect(screen.getByLabelText("De *")).toHaveValue(from);
    expect(screen.getByLabelText("Até *")).toHaveValue(to);
    await generate();
    expect(state.rpc).toHaveBeenCalledWith("get_report_monthly_financial", { _from: from, _to: to });
  });
  it("edição gera e exporta somente _from/_to sem chaves divergentes", async () => {
    render(<RelatorioMensal />);
    fireEvent.change(screen.getByLabelText("De *"), { target: { value: "2026-09-02" } });
    fireEvent.change(screen.getByLabelText("Até *"), { target: { value: "2026-09-28" } });
    await generate();
    expect(state.rpc).toHaveBeenCalledWith("get_report_monthly_financial", { _from: "2026-09-02", _to: "2026-09-28" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "CSV" })); });
    expect(state.invoke.mock.calls[0][1].body.filters).toEqual({ _from: "2026-09-02", _to: "2026-09-28" });
  });
});