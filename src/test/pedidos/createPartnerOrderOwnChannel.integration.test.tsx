// Integração real de cache: leitor useMyCommercialOrders montado com cache quente
// + useCreatePartnerOrder. Após sucesso canônico, a invalidação escopada dispara
// nova RPC de leitura e a lista passa de 1 para 2 pedidos — sem reload, sem polling.
// Transporte sintético; Auth simulada — não é prova JWT/RLS hosted.
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: {
    user: { id: "A" } as { id: string } | null,
    profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false },
    roles: ["parceiro_b2b"], loading: false,
  },
  serverOrders: [
    { id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b", numero: "PB-001029", status: "em_analise_comercial", created_at: "2026-10-26T15:00:00+00:00" },
  ] as Array<{ id: string; numero: string; status: string; created_at: string }>,
  pendingCreate: [] as Array<(v: unknown) => void>,
  reads: 0,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string) => {
      if (name === "get_my_commercial_orders_projection") {
        state.reads += 1;
        return Promise.resolve({ data: { partner_id: PARTNER, orders: state.serverOrders }, error: null });
      }
      if (name === "create_partner_order_secure") return new Promise((resolve) => state.pendingCreate.push(resolve));
      throw new Error(`Unexpected RPC: ${name}`);
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "stub" } }) }) }) }),
  },
}));

import { useMyCommercialOrders } from "@/hooks/useMyCommercialOrders";
import { useCreatePartnerOrder } from "@/hooks/useCreatePartnerOrder";

const PARTNER = "33333333-3333-4333-8333-333333333333";
const INPUT = {
  partner_id: PARTNER,
  items: [{ item_id: "i1", item_tipo: "produto" as const, product_id: "p1", nome: "INS4", quantidade: 1, preco_unitario: 1, desconto_percentual: 0, subtotal: 1, unidade_pedido: "litro" as const }],
  expected_cart_hash: "hash-ok",
  idempotency_key: "idem-int-1",
  requested_delivery_date: "2026-11-05",
};

function Probe() {
  const orders = useMyCommercialOrders(PARTNER);
  const create = useCreatePartnerOrder();
  return (
    <div>
      <ul>{(orders.data ?? []).map((o) => <li key={o.id}>{o.numero}</li>)}</ul>
      <button onClick={() => create.mutate(INPUT)}>enviar</button>
    </div>
  );
}

describe("canal próprio integrado: lista 1 -> catálogo/sucesso -> lista 2 (sem reload)", () => {
  beforeEach(() => {
    state.auth = { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["parceiro_b2b"], loading: false };
    state.serverOrders = [{ id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b", numero: "PB-001029", status: "em_analise_comercial", created_at: "2026-10-26T15:00:00+00:00" }];
    state.pendingCreate = []; state.reads = 0; vi.clearAllMocks();
  });

  it("leitor montado relê via nova RPC e mostra os 2 pedidos após sucesso canônico", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    render(<Probe />, { wrapper });
    // Cache quente: lista inicial com 1 pedido (1 leitura).
    await screen.findByText("PB-001029");
    expect(state.reads).toBe(1);
    expect(screen.queryByText("PB-001030")).toBeNull();

    // Sucesso canônico: servidor passa a ter PB-001030; resolve o create pendente.
    state.serverOrders = [...state.serverOrders, { id: "405ff73f-1667-43a3-a41c-56d9500dfd8b", numero: "PB-001030", status: "em_analise_comercial", created_at: "2026-10-26T16:00:00+00:00" }];
    act(() => { screen.getByRole("button", { name: "enviar" }).click(); });
    await waitFor(() => expect(state.pendingCreate).toHaveLength(1));
    await act(async () => { state.pendingCreate[0]({ data: { id: "405ff73f-1667-43a3-a41c-56d9500dfd8b", numero: "PB-001030", total: 1 }, error: null }); });

    // A invalidação escopada atinge a query ATIVA do leitor => refetch (nova RPC) e lista com 2.
    await screen.findByText("PB-001030");
    await waitFor(() => expect(state.reads).toBeGreaterThanOrEqual(2));
    expect(screen.getByText("PB-001029")).toBeTruthy();
    qc.clear();
  });

  it("escopo muda (A->B) antes da resposta: leitor de A desmonta dados e nenhuma releitura de B é disparada pelo sucesso tardio", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const view = render(<Probe />, { wrapper });
    await screen.findByText("PB-001029");
    act(() => { screen.getByRole("button", { name: "enviar" }).click(); });
    await waitFor(() => expect(state.pendingCreate).toHaveLength(1));
    // Troca de ator antes da resposta.
    state.auth = { ...state.auth, user: { id: "B" }, profile: { ...state.auth.profile, user_id: "B", organization_id: "OB" } };
    view.rerender(<Probe />);
    const readsBefore = state.reads;
    await act(async () => { state.pendingCreate[0]({ data: { id: "x", numero: "PB-X", total: 1 }, error: null }); });
    // Sucesso tardio não invalida nada: nenhuma leitura extra originada pelo create.
    expect(state.reads).toBe(readsBefore);
    qc.clear();
  });
});
