import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { CancelResidualCandidate, FiscalCancellationResult } from "../../../scripts/b2b-cancellation-policy-20261112/ui/CancelResidualCandidate";
afterEach(() => { cleanup(); rpc.mockReset(); });
const props = { orderId: "11111111-2222-4333-8444-555555555555", observedVersion: 8, residualAmount: 10, scopeKey: "local", available: true, onConfirmed: vi.fn() };
describe("cancelamento candidato inativo", () => {
  it("sem capacidade não monta ação e não despacha", () => {
    render(<CancelResidualCandidate {...props} available={false} />);
    expect(screen.queryByRole("button")).toBeNull(); expect(rpc).not.toHaveBeenCalled();
  });
  it("motivo e CAS vão somente ao endpoint canônico; clique repetido não duplica", async () => {
    rpc.mockResolvedValue({ data: { forecast_id: "local-forecast", version: 9, state: "cancelado_residual" }, error: null });
    render(<CancelResidualCandidate {...props} />);
    expect(screen.getByRole("button")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "decisão comercial" } });
    fireEvent.click(screen.getByRole("button")); fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saldo não faturado cancelado"));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("rpc_b2b_forecast_cancel_residual_v1", { p_order: props.orderId, p_expected_version: 8, p_reason: "decisão comercial" });
  });
  it("erro não confirma nem repete automaticamente", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("PT409") });
    render(<CancelResidualCandidate {...props} />);fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "motivo" } });fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("PT409"));expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])("registro final com pagamento %s não promete estorno/reposição", paid => {
    render(<FiscalCancellationResult result={{ final: true, financialReconciliationRequired: paid }} />);
    expect(screen.getByText(paid ? /Há pagamento; reconciliação/ : /Estoque e devolução permanecem separados/)).toBeInTheDocument();
  });
  it("registro genérico não significa cancelamento final", () => {
    render(<FiscalCancellationResult result={{ state: "REGISTERED" }} />);
    expect(screen.getByText(/não confirmado/)).toBeInTheDocument();
  });
});