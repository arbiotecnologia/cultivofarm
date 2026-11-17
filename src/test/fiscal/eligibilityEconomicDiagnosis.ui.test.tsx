import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), profile: { organization_id: "local-company", ativo: true } }));
vi.mock("@/integrations/supabase/client", () => ({ SUPABASE_URL: "https://swzpzcwiasxmjutrmvkm.supabase.co", supabase: { rpc: mocks.rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ profile: mocks.profile, user: { id: "local-user" } }) }));
import Page from "@/pages/fiscal/DiagnosticoElegibilidade";
import { summarize } from "@/lib/fiscal/eligibilityDiagnostic";
const ID = "11111111-2222-4333-8444-555555555555";
const data = (available: boolean, commercial = true, credit = true) => ({ eligible: false, reasons: [{ code: "C2_ACCOUNTING_PENDING" }], economicDiagnosis: {
  available, commercial_explicit: commercial, credit_explicit: credit, operational_commercial_registered: false, accounting_pending: true, operational_blocked: true,
} });
async function consult() {
  fireEvent.change(screen.getByLabelText("UUID"), { target: { value: ID } });
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  await waitFor(() => expect(screen.getByTestId("result-2-args")).toBeInTheDocument());
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("dois eixos sem autoridade implícita", () => {
  it.each([[true, false], [false, true], [true, true], [false, false]])("econômico %s/%s não altera o eixo operacional", async (commercial, credit) => {
    mocks.rpc.mockResolvedValue({ data: data(true, commercial, credit), error: null });
    render(<Page />); await consult();
    for (const name of ["2-args", "3-args(_current_invoice_id=null)"]) {
      const result = within(screen.getByTestId(`result-${name}`));
      expect(result.getByText(`Comercial explícita vigente: ${commercial ? "sim" : "não"} · Crédito explícito vigente: ${credit ? "sim" : "não"}`)).toBeInTheDocument();
      expect(result.getByText(/Comercial registrada no pedido: não · Pendência contábil: sim · Bloqueio operacional: sim/)).toBeInTheDocument();
      expect(result.getByText(/Faturamento bloqueado/)).toBeInTheDocument();
    }
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it("revogação na releitura não apresenta aprovação antiga nem pendência inventada", async () => {
    mocks.rpc.mockResolvedValue({ data: data(true), error: null });
    render(<Page />); await consult();
    mocks.rpc.mockResolvedValue({ data: data(false), error: null });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    await waitFor(() => expect(screen.getAllByText(/Diagnóstico indisponível; não comprova ausência nem pendência/)).toHaveLength(2));
    expect(screen.queryByText(/Comercial explícita vigente: sim/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Faturamento bloqueado/)).toHaveLength(2);
  });
  it("sem campo novo preserva leitor antigo sem inferir pendência econômica", () => {
    expect(summarize("2-args", "PARTNER_ORDER", ID, { eligible: false }, null).economicDiagnosis).toBeNull();
    expect(summarize("2-args", "PARTNER_ORDER", ID, data(false), null).economicDiagnosis?.commercialExplicit).toBeNull();
  });
  it("revogação de contexto retira resultados e cerca resposta tardia", async () => {
    mocks.rpc.mockResolvedValue({ data: data(true), error: null });
    const view = render(<Page />); await consult();
    mocks.profile = { organization_id: "local-company", ativo: false };
    view.rerender(<Page />);
    expect(screen.queryByTestId("result-2-args")).not.toBeInTheDocument();
    mocks.profile = { organization_id: "local-company", ativo: true };
  });
});