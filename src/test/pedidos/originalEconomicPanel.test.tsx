import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const s = vi.hoisted(() => ({ rpc: vi.fn(), role: "financeiro" }));
const ID = "11111111-2222-4333-8444-555555555555";
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "local-fin" }, profile: { user_id: "local-fin", organization_id: "arbio-synthetic", ativo: true }, role: s.role, roles: [s.role], loading: false, authzReady: true, authzEpoch: 0, checkAuthzAccess: () => true }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => { const p = s.rpc(...args); return Object.assign(p, { abortSignal: () => p }); } } }));
vi.mock("@/hooks/usePartnerOrdersAdmin", () => ({ usePartnerOrdersAdmin: () => ({ data: [{ id: "11111111-2222-4333-8444-555555555555", numero: "PB-AR-BIO-FICTICIO", status: "em_analise_comercial", total: 20, created_at: "2026-11-12", partner_accounts: { razao_social: "AR Bio fictícia" }, c2_external_origin_snapshot: { contract: "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1", accounting_validated: false } }], actorScope: "synthetic", actorReady: true }) }));
vi.mock("@/hooks/usePartnerOrders", () => ({ usePartnerOrderItems: () => ({ data: [] }) }));
vi.mock("@/hooks/usePartnerUnreadMessages", () => ({ useUnreadCountsByOrder: () => ({ data: {} }) }));
vi.mock("@/hooks/useOrdersSlaMap", () => ({ useOrdersSlaMap: () => ({ data: new Map() }) }));
vi.mock("@/hooks/useInternalOrderEntry", () => ({ useInternalOrderEntry: () => ({ ready: false }) }));
vi.mock("@/hooks/useB2BFinanceiro", () => ({ usePartnerCredit: () => ({ data: null }), useApproveB2BCredit: () => ({ isPending: false }) }));
vi.mock("@/hooks/usePartnerOrderActions", () => ({ useApprovePartnerOrder: () => ({}), useRejectPartnerOrder: () => ({}), useSetDeliveryDate: () => ({}), useUpdateCommercialNotes: () => ({}), useRequestPartnerOrderItems: () => ({}) }));
vi.mock("@/components/comercial/CommercialOrderEntry", () => ({ CommercialOrderEntry: () => null }));
vi.mock("@/components/comercial/CommercialOwnerOrdersSection", () => ({ CommercialOwnerOrdersSection: () => null }));
vi.mock("@/components/comercial/OrderMessagesPanel", () => ({ OrderMessagesPanel: () => null }));
vi.mock("@/components/comercial/PaymentTermsSection", () => ({ PaymentTermsSection: () => null }));
vi.mock("@/components/comercial/ResaleOsAvailabilityPanel", () => ({ ResaleOsAvailabilityPanel: () => null }));
vi.mock("@/components/comercial/ResponderCotacaoDialog", () => ({ ResponderCotacaoDialog: () => null }));
vi.mock("@/components/portal-parceiro/TimelinePedidoDialog", () => ({ TimelinePedidoDialog: () => null }));
vi.mock("@/components/pedidos/PromoteAccountingPendingButton", () => ({ PromoteAccountingPendingButton: () => null }));
import Page from "@/pages/comercial/PedidosB2B";
const hash = "a".repeat(32);
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("carteira real monta os dois eixos econômicos com blocked/eligible preservados", async () => {
  s.rpc.mockImplementation((name: string) => Promise.resolve({ error: null, data: name === "fn_fiscal_invoice_eligibility"
    ? { orderId: ID, eligible: false, reasons: [{ code: "C2_ACCOUNTING_PENDING" }], economicDiagnosis: { available: true, commercial_explicit: true, credit_explicit: true, operational_blocked: true } }
    : { contract: "C2_PILOT_ECON_STATE_V1", order_id: ID, available: true, pilot_enabled: true, operational_blocked: true, fiscal_blocked: true, billing_blocked: true, shipping_blocked: true, evidence: null, evidence_block_reason: null,
      approvals: ["commercial", "credit"].map(kind => ({ kind, approved_by: kind, actor_role: kind === "commercial" ? "gestor_comercial" : "financeiro", approved_at: "2026-11-12T02:48:00Z", evidence_hash: hash })),
      can_approve_commercial: false, can_approve_credit: false, forecast: { forecast_id: "unique-f", state: "aguardando_fiscal", total_amount: 20, due_dates_estimated: true } } }));
  render(<MemoryRouter initialEntries={["/comercial/pedidos-b2b"]}><QueryClientProvider client={new QueryClient()}><Page /></QueryClientProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
  await screen.findByTestId("c2-pilot-economic");
  await waitFor(() => expect(screen.getByTestId("accounting-pending-notice")).toHaveTextContent("Aprovações comercial e de crédito concluídas. Liberação operacional para faturamento pendente."));
  const panel = within(screen.getByTestId("c2-pilot-economic"));
  expect(panel.getByTestId("c2-pilot-commercial")).toHaveTextContent("gestor_comercial");
  expect(panel.getByTestId("c2-pilot-credit")).toHaveTextContent("financeiro");
  expect(panel.getByTestId("c2-pilot-forecast")).toHaveTextContent("20,00");
  expect(panel.queryByRole("button")).toBeNull();
  expect(screen.queryByText(/Aprovação, decisão de crédito, cobrança/)).toBeNull();
  expect(s.rpc.mock.calls.some(c => c[0] === "fn_fiscal_invoice_eligibility" && c[1]._source_id === ID)).toBe(true);
  expect(s.rpc.mock.calls.every(c => ["fn_fiscal_invoice_eligibility", "c2_pilot_economic_state_v1"].includes(c[0]))).toBe(true);
});