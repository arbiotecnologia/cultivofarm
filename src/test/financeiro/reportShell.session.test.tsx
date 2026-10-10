import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportShell } from "@/components/financeiro/relatorios/ReportShell";

const state = vi.hoisted(() => ({
  auth: { user: { id: "A", email: "" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["financeiro"], loading: false },
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
}
beforeEach(() => {
  Object.assign(state.auth, { user: { id: "A", email: "" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["financeiro"], loading: false });
  vi.clearAllMocks(); state.rpc.mockReset(); state.invoke.mockReset();
  state.rpc.mockResolvedValue({ data: ["PREVIA-A"], error: null });
  state.invoke.mockResolvedValue({ data: null, error: null });
  vi.spyOn(window, "print").mockImplementation(() => {});
  vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function settle(pending: ReturnType<typeof deferred>, response: Response) {
  await act(async () => { pending.resolve(response); await pending.promise; });
}
async function generate() { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Gerar prévia" })); }); }

describe("ReportShell — sessão real do hook / RPC e Edge mockados", () => {
  for (const kind of ["identity", "tenant", "aba", "readiness", "reportType"]) {
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
  for (const kind of ["identity", "tenant", "aba", "readiness", "reportType"]) {
    it(`exportação tardia não abre arquivo nem libera pedido novo em ${kind}`, async () => {
      const old = deferred(), next = deferred(); state.invoke.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
      const view = render(element()); fireEvent.click(screen.getByRole("button", { name: "PDF" }));
      change(kind); view.rerender(element(kind === "reportType" ? "payables" : "monthly"));
      if (kind === "aba") { state.auth.profile.organization_id = "OA"; view.rerender(element()); }
      if (kind === "readiness") { state.auth.loading = false; view.rerender(element()); }
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
    render(element()); await generate(); state.rpc.mockResolvedValueOnce({ data: null, error: { message: "Acesso negado" } });
    await generate(); expect(screen.queryByText(/PREVIA-A/)).toBeNull(); expect(screen.queryByText(/Gerado em:/)).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Acesso negado"); expect(screen.getByRole("button", { name: "Imprimir" })).toBeDisabled();
    await generate(); expect(screen.getByText(/PREVIA-A/)).toBeTruthy(); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("mostra loading e vazio como estados distintos", async () => {
    const pending = deferred(); state.rpc.mockReturnValueOnce(pending.promise); render(element()); await generate();
    expect(screen.getByRole("status")).toHaveTextContent(/Gerando/);
    await settle(pending, { data: [], error: null }); expect(screen.getByRole("status")).toHaveTextContent(/Nenhum/);
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeDisabled();
  });
  for (const loss of ["loading", "inactive", "mismatch", "roles", "tenant"]) {
    it(`bloqueia gerar/exportar/imprimir com sessão inapta ${loss}`, async () => {
      const view = render(element()); await generate();
      if (loss === "loading") state.auth.loading = true;
      if (loss === "inactive") state.auth.profile.ativo = false;
      if (loss === "mismatch") state.auth.profile.user_id = "OUTRO";
      if (loss === "roles") state.auth.roles = [];
      if (loss === "tenant") state.auth.profile.organization_id = "";
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
    expect(screen.getByRole("alert")).toHaveTextContent("rede indisponível"); await generate();
    expect(screen.getByText(/PREVIA-A/)).toBeTruthy();
  });
});