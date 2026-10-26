import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  COMMERCIAL_OWNER_ORDERS_CONTRACT,
  readCommercialOwnerOrders,
} from "@/lib/comercial/commercialOwnerOrders";

// Transporte sintético apenas; nunca serviços hospedados. Auth simulada — não é prova JWT/RLS.
const state = vi.hoisted(() => ({
  actor: "11111111-1111-4111-8111-111111111111",
  orgA: "22222222-2222-4222-8222-222222222222",
  orgB: "99999999-9999-4999-8999-999999999999",
  org: "22222222-2222-4222-8222-222222222222",
  rpcMode: "allowed" as "allowed" | "denied" | "absent",
  adminRows: [] as unknown[],
  rpc: vi.fn(), table: vi.fn(), writes: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.org, ativo: true, senha_provisoria: false },
  role: "administrador", roles: ["administrador"], loading: false, authzReady: true, authzEpoch: 0,
  checkAuthzAccess: () => true, signOut: vi.fn(),
}) }));
vi.mock("@/hooks/usePartnerUnreadMessages", () => ({ useUnreadCountsByOrder: () => ({ data: {} }) }));
vi.mock("@/hooks/useOrdersSlaMap", () => ({ useOrdersSlaMap: () => ({ data: new Map() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (...args: unknown[]) => state.rpc(...args),
  from: (...args: unknown[]) => state.table(...args),
  channel: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  }, removeChannel: vi.fn(),
} }));

import PedidosB2B from "@/pages/comercial/PedidosB2B";

const ORDER_ROW = {
  id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b",
  numero: "PB-001029",
  status: "em_analise_comercial",
  total: 2,
  created_at: "2026-10-26T15:00:00+00:00",
  requested_delivery_date: "2026-11-05",
  estimated_delivery_date: null,
  partner_id: "33333333-3333-4333-8333-333333333333",
  partner_razao_social: "Parceiro teste4",
  c2_external_origin_snapshot: { contract: "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1", accounting_validated: false },
};

function tableResult(data: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = chain as Record<string, () => typeof chain>;
  for (const m of ["select", "order", "eq", "gte", "lte", "abortSignal", "limit"]) self[m] = () => chain;
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve);
  return chain;
}
function rpcResponse(data: unknown) {
  const promise = Promise.resolve({ data, error: null });
  return Object.assign(promise, { abortSignal: () => promise });
}
function rpcError(code: string, message: string) {
  const promise = Promise.resolve({ data: null, error: { code, message } });
  return Object.assign(promise, { abortSignal: () => promise });
}

beforeEach(() => {
  Object.assign(state, { org: state.orgA, rpcMode: "allowed" as const, adminRows: [] as unknown[] });
  vi.clearAllMocks();
  state.table.mockImplementation((table: string) => {
    if (table === "partner_orders") return tableResult(state.adminRows);
    if (table === "partner_order_items") return tableResult([]);
    throw new Error(`Unexpected table read: ${table}`);
  });
  state.rpc.mockImplementation((name: string) => {
    if (name === "c2_commercial_owner_orders_projection") {
      if (state.rpcMode === "absent") return rpcError("PGRST202", "function not found");
      if (state.rpcMode === "denied") return rpcError("42501", "actor_not_allowed");
      return rpcResponse({ contract: COMMERCIAL_OWNER_ORDERS_CONTRACT, organization_id: state.org, orders: [ORDER_ROW] });
    }
    if (name === "c2_internal_order_entry_capability_v1") return rpcError("PGRST202", "function not found");
    state.writes(name); throw new Error(`Unexpected RPC: ${name}`);
  });
});
afterEach(cleanup);
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><PedidosB2B /></MemoryRouter></QueryClientProvider>);
}

it("parser: envelope válido do mesmo org => allowed; org estrangeiro ou contrato divergente => invalid_response", () => {
  const ok = readCommercialOwnerOrders({ contract: COMMERCIAL_OWNER_ORDERS_CONTRACT, organization_id: state.orgA, orders: [ORDER_ROW] }, state.orgA);
  expect(ok).toMatchObject({ state: "allowed", organizationId: state.orgA });
  expect(readCommercialOwnerOrders({ contract: COMMERCIAL_OWNER_ORDERS_CONTRACT, organization_id: state.orgB, orders: [ORDER_ROW] }, state.orgA)).toEqual({ state: "blocked", reason: "invalid_response" });
  expect(readCommercialOwnerOrders({ contract: "OUTRO", organization_id: state.orgA, orders: [] }, state.orgA)).toEqual({ state: "blocked", reason: "invalid_response" });
  expect(readCommercialOwnerOrders(null, state.orgA)).toEqual({ state: "blocked", reason: "invalid_response" });
});
it("admin A: lista administrativa vazia, mas a carteira da empresa mostra PB-001029 somente leitura com pendência contábil", async () => {
  mount();
  await screen.findByText("Pedidos da carteira da empresa");
  await screen.findByText("PB-001029");
  expect(screen.getByText("Parceiro teste4")).toBeTruthy();
  expect(screen.getByText(/somente leitura/)).toBeTruthy();
  // Lista administrativa continua vazia e nenhuma escrita foi tentada.
  expect(screen.getByText("Nenhum pedido encontrado.")).toBeTruthy();
  expect(state.writes).not.toHaveBeenCalled();
});
it("admin B (org estrangeira): RPC nega com 42501 e nenhuma seção/linha aparece", async () => {
  state.org = state.orgB; state.rpcMode = "denied";
  mount();
  await screen.findByText("Nenhum pedido encontrado.");
  expect(screen.queryByText("Pedidos da carteira da empresa")).toBeNull();
  expect(screen.queryByText("PB-001029")).toBeNull();
  expect(state.writes).not.toHaveBeenCalled();
});
it("contrato não instalado: seção quieta, sem promessa nem erro visível", async () => {
  state.rpcMode = "absent";
  mount();
  await screen.findByText("Nenhum pedido encontrado.");
  expect(screen.queryByText("Pedidos da carteira da empresa")).toBeNull();
  expect(state.writes).not.toHaveBeenCalled();
});
it("lista administrativa com linhas não duplica a seção da carteira", async () => {
  state.adminRows = [{
    id: ORDER_ROW.id, numero: ORDER_ROW.numero, partner_id: ORDER_ROW.partner_id, cliente_id: null,
    origin_simulation_id: null, status: ORDER_ROW.status, subtotal: 2, desconto_total: 0, total: 2,
    observacoes: null, commercial_notes: null, approval_notes: null,
    requested_delivery_date: ORDER_ROW.requested_delivery_date, estimated_delivery_date: null,
    approved_by: null, approved_at: null, ready_for_production: false, created_at: ORDER_ROW.created_at,
    partner_accounts: { razao_social: "Parceiro teste4", nome_fantasia: null },
  }];
  mount();
  // Desktop + mobile renderizam a mesma linha; a seção da carteira não pode aparecer.
  await waitFor(() => expect(screen.getAllByText("PB-001029").length).toBe(2));
  expect(screen.queryByText("Pedidos da carteira da empresa")).toBeNull();
});
