import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResaleOsAvailabilityPanel } from "@/components/comercial/ResaleOsAvailabilityPanel";
import { retainResaleOsAttempt } from "@/lib/authz/resaleOsAttemptStore";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: {
    user: { id: "10000000-0000-4000-8000-000000000004" },
    profile: { user_id: "10000000-0000-4000-8000-000000000004", organization_id: "10000000-0000-4000-8000-000000000005", ativo: true, senha_provisoria: false },
    roles: ["administrador"], loading: false, authzReady: true, authzEpoch: 0, checkAuthzAccess: () => true,
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));

const orderId = "10000000-0000-4000-8000-000000000001";
const itemId = "10000000-0000-4000-8000-000000000002";
const osId = "10000000-0000-4000-8000-000000000003";
const scope = { scope: "scope-A", actor: state.auth.user.id, tenant: state.auth.profile.organization_id };
const intent = { orderId, itemId, observed: "2026-11-08T21:12:00Z" };
const available = { contract: "B2B_RESALE_OS_AVAILABILITY_V1", order_id: orderId, actor_id: scope.actor, organization_id: scope.tenant, observed_updated_at: intent.observed, available: true, items: [{ order_item_id: itemId, os_id: null, create_available: true }] };
const ack = { ok: true, replay: false, contract: "B2B_RESALE_OS_V1", order_id: orderId, order_item_id: itemId, os_id: osId };

function panel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><ResaleOsAvailabilityPanel orderId={orderId} actorScope="scope-A" /></QueryClientProvider>);
  return { ...view, client };
}
beforeEach(() => { cleanup(); window.sessionStorage.clear(); state.rpc.mockReset(); });

describe("painel integrado ao detalhe canônico — transporte sintético", () => {
  it("reader ausente mantém painel fechado e nunca chama writer", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "reader absent" } });
    const view = panel();
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("rpc_b2b_resale_os_availability_v1", { p_order_id: orderId }));
    expect(screen.queryByRole("button", { name: /Preparar OS/ })).toBeNull();
    expect(state.rpc.mock.calls.every(([name]) => name === "rpc_b2b_resale_os_availability_v1")).toBe(true);
    view.client.clear();
  });
  it("reader positivo habilita um clique, ACK exato e nova leitura", async () => {
    let current: unknown = available;
    state.rpc.mockImplementation((name: string) => {
      if (name === "rpc_b2b_resale_os_availability_v1") return Promise.resolve({ data: current, error: null });
      current = { ...available, items: [{ order_item_id: itemId, os_id: osId, create_available: false }] };
      return Promise.resolve({ data: ack, error: null });
    });
    const view = panel();
    fireEvent.click(await screen.findByRole("button", { name: "Preparar OS de revenda" }));
    await screen.findByText(/OS preparada/);
    const writes = state.rpc.mock.calls.filter(([name]) => name === "rpc_b2b_resale_os_create_v1");
    expect(writes).toHaveLength(1);
    expect(writes[0][1].p_request_key).toBeTruthy();
    expect(window.sessionStorage.length).toBe(0);
    view.client.clear();
  });
  it("incerteza + remount não reenvia; clique manual reutiliza a mesma chave", async () => {
    let current: unknown = available;
    let fail = true;
    state.rpc.mockImplementation((name: string) => {
      if (name === "rpc_b2b_resale_os_availability_v1") return Promise.resolve({ data: current, error: null });
      if (fail) { fail = false; return Promise.resolve({ data: null, error: { message: "lost" } }); }
      current = { ...available, items: [{ order_item_id: itemId, os_id: osId, create_available: false }] };
      return Promise.resolve({ data: { ...ack, replay: true }, error: null });
    });
    const first = panel();
    fireEvent.click(await screen.findByRole("button", { name: "Preparar OS de revenda" }));
    await screen.findByText(/Resultado não confirmado/);
    const firstKey = state.rpc.mock.calls.find(([name]) => name === "rpc_b2b_resale_os_create_v1")?.[1].p_request_key;
    first.unmount(); first.client.clear();
    const second = panel();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar preparo anterior" }));
    await screen.findByText(/OS preparada/);
    const writes = state.rpc.mock.calls.filter(([name]) => name === "rpc_b2b_resale_os_create_v1");
    expect(writes).toHaveLength(2);
    expect(writes[1][1].p_request_key).toBe(firstKey);
    second.client.clear();
  });
  it("reload com OS já persistida reconcilia pela leitura e faz zero writer", async () => {
    retainResaleOsAttempt(scope, intent, "request-key-0001");
    state.rpc.mockResolvedValue({ data: { ...available, items: [{ order_item_id: itemId, os_id: osId, create_available: false }] }, error: null });
    const view = panel();
    await screen.findByText(/Preparo anterior confirmado pela leitura da OS/);
    expect(state.rpc.mock.calls.every(([name]) => name === "rpc_b2b_resale_os_availability_v1")).toBe(true);
    expect(window.sessionStorage.length).toBe(0);
    view.client.clear();
  });
  it("troca de escopo invalida retenção e não apresenta ação antiga", async () => {
    retainResaleOsAttempt(scope, intent, "request-key-0001");
    state.rpc.mockResolvedValue({ data: available, error: null });
    const view = panel();
    await screen.findByRole("button", { name: "Confirmar preparo anterior" });
    view.rerender(<QueryClientProvider client={view.client}><ResaleOsAvailabilityPanel orderId={orderId} actorScope="scope-epoch-2" /></QueryClientProvider>);
    await screen.findByRole("button", { name: "Preparar OS de revenda" });
    expect(screen.queryByRole("button", { name: "Confirmar preparo anterior" })).toBeNull();
    expect(state.rpc.mock.calls.every(([name]) => name === "rpc_b2b_resale_os_availability_v1")).toBe(true);
    view.client.clear();
  });
});
