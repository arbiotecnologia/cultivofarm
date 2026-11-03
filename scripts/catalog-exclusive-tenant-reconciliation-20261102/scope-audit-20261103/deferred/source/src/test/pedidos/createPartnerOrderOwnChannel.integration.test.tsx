// Integração com DEFAULTS DE PRODUÇÃO (App.tsx: staleTime 5min, refetchOnMount:false)
// e fluxo real de navegação: o leitor (MeusPedidos) é DESMONTADO ao ir ao catálogo,
// o create acontece sem leitor ativo, e a rota é REMONTADA após o sucesso.
// Prova que a invalidação escopada + refetchOnMount:true do leitor produzem nova
// RPC de leitura e a lista 1 -> 2 sem reload nem polling.
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
      if(name==='partner_payment_condition_capability_v1') return Promise.resolve({data:{contract:'B2B_PAYMENT_CONDITION_V1',actor_id:state.auth.user?.id,organization_id:state.auth.profile.organization_id,partner_id:PARTNER,simulate:true,create:true},error:null});
      if(name==='partner_order_journal_capability_v1') return Promise.resolve({data:null,error:{code:'PGRST202',message:'Could not find public.partner_order_journal_capability_v1'}});
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
const INPUT = { payment_method:'pix' as const,payment_condition_version:1,payment_deadline_days:7,
  partner_id: PARTNER,
  items: [{ item_id: "i1", item_tipo: "produto" as const, product_id: "p1", nome: "INS4", quantidade: 1, preco_unitario: 1, desconto_percentual: 0, subtotal: 1, unidade_pedido: "litro" as const }],
  expected_cart_hash: "hash-ok",
  idempotency_key: "idem-int-1",
  requested_delivery_date: "2026-11-05",
};

/** Defaults idênticos ao QueryClient de produção (src/App.tsx). */
function prodClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5 * 60 * 1000, gcTime: 10 * 60 * 1000, refetchOnWindowFocus: false, refetchOnMount: false, refetchOnReconnect: true, retry: 1 },
      mutations: { retry: false },
    },
  });
}
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

function OrdersList() {
  const orders = useMyCommercialOrders(PARTNER);
  return <ul>{(orders.data ?? []).map((o) => <li key={o.id}>{o.numero}</li>)}</ul>;
}
function CatalogPage() {
  const create = useCreatePartnerOrder();
  return <button onClick={() => create.mutate(INPUT)}>enviar</button>;
}

describe("canal próprio integrado com defaults de produção", () => {
  beforeEach(() => {
    state.auth = { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["parceiro_b2b"], loading: false };
    state.serverOrders = [{ id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b", numero: "PB-001029", status: "em_analise_comercial", created_at: "2026-10-26T15:00:00+00:00" }];
    state.pendingCreate = []; state.reads = 0; vi.clearAllMocks();
  });

  it("fluxo real: lista 1 -> desmonta (catálogo) -> sucesso -> remonta e relê com lista 2", async () => {
    const qc = prodClient();
    // 1) MeusPedidos montado: lista com 1 pedido.
    const view = render(<OrdersList />, { wrapper: wrap(qc) });
    await screen.findByText("PB-001029");
    expect(state.reads).toBe(1);

    // 2) Navega ao catálogo: leitor DESMONTADO (cache fica inativo).
    view.unmount();

    // 3) Create canônico sem leitor ativo; servidor passa a ter PB-001030.
    const cat = render(<CatalogPage />, { wrapper: wrap(qc) });
    act(() => { screen.getByRole("button", { name: "enviar" }).click(); });
    await waitFor(() => expect(state.pendingCreate).toHaveLength(1));
    state.serverOrders = [...state.serverOrders, { id: "405ff73f-1667-43a3-a41c-56d9500dfd8b", numero: "PB-001030", status: "em_analise_comercial", created_at: "2026-10-26T16:00:00+00:00" }];
    await act(async () => { state.pendingCreate[0]({ data: { id: "405ff73f-1667-43a3-a41c-56d9500dfd8b", numero: "PB-001030", total: 1, payment_choice:{payment_method:'pix',payment_condition_version:1,payment_deadline_days:7} }, error: null }); });
    // invalidateQueries com refetchType "active" NÃO relê enquanto o leitor está desmontado.
    expect(state.reads).toBe(1);
    cat.unmount();

    // 4) Volta a MeusPedidos: refetchOnMount:true do leitor relê o cache stale => nova RPC e lista 2.
    render(<OrdersList />, { wrapper: wrap(qc) });
    await screen.findByText("PB-001030");
    await waitFor(() => expect(state.reads).toBe(2));
    expect(screen.getByText("PB-001029")).toBeTruthy();
    qc.clear();
  });

  it("cache fresco (sem invalidação) NÃO relê ao remontar — refetchOnMount:true só age em stale", async () => {
    const qc = prodClient();
    const view = render(<OrdersList />, { wrapper: wrap(qc) });
    await screen.findByText("PB-001029");
    expect(state.reads).toBe(1);
    view.unmount();
    // Sem create/invalidação: remontar dentro do staleTime não gera nova RPC.
    render(<OrdersList />, { wrapper: wrap(qc) });
    await screen.findByText("PB-001029");
    expect(state.reads).toBe(1);
    qc.clear();
  });

  it("escopo muda (A->B) antes da resposta: sucesso tardio não invalida; remontar como B não mostra dados de A", async () => {
    const qc = prodClient();
    const view = render(<OrdersList />, { wrapper: wrap(qc) });
    await screen.findByText("PB-001029");
    view.unmount();
    const cat = render(<CatalogPage />, { wrapper: wrap(qc) });
    act(() => { screen.getByRole("button", { name: "enviar" }).click(); });
    await waitFor(() => expect(state.pendingCreate).toHaveLength(1));
    state.auth = { ...state.auth, user: { id: "B" }, profile: { ...state.auth.profile, user_id: "B", organization_id: "OB" } };
    cat.rerender(<CatalogPage />);
    const readsBefore = state.reads;
    await act(async () => { state.pendingCreate[0]({ data: { id: "x", numero: "PB-X", total: 1, payment_choice:{payment_method:'pix',payment_condition_version:1,payment_deadline_days:7} }, error: null }); });
    cat.unmount();
    // Remonta como B: fence muda, query de B é nova; sucesso tardio de A não invalidou nada.
    render(<OrdersList />, { wrapper: wrap(qc) });
    await waitFor(() => expect(state.reads).toBe(readsBefore + 1)); // leitura inicial de B apenas
    expect(screen.queryByText("PB-001029")).toBeNull();
    qc.clear();
  });
});
