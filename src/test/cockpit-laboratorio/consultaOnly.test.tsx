import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import CockpitLaboratorio from "@/pages/CockpitLaboratorio";
import { COCKPIT_LIST_RPC, COCKPIT_QUERY_PREFIXES, useCockpitQuery } from "@/hooks/useCockpitQuery";

const { auth, rpc, from, operational } = vi.hoisted(() => ({ auth: { current: {} as Record<string, unknown> }, rpc: vi.fn(), from: vi.fn(), operational: vi.fn(() => { throw new Error("operational_child_mounted"); }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth.current }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from } }));
vi.mock("@/hooks/useEsteiraLaboratorio", () => ({ useEsteiraLaboratorio: operational }));
vi.mock("@/hooks/useMetricasOperacionais", () => ({ useMetricasOperacionais: operational }));
vi.mock("@/components/cockpit/RegistrarCQDialog", () => ({ RegistrarCQDialog: operational }));
vi.mock("@/components/cockpit/GerarLoteDialog", () => ({ GerarLoteDialog: operational }));
vi.mock("@/components/cockpit/RegistrarEnvaseDialog", () => ({ RegistrarEnvaseDialog: operational }));
vi.mock("@/components/cockpit/ReservarEstoqueDialog", () => ({ ReservarEstoqueDialog: operational }));
vi.mock("@/components/cockpit/ProducaoResumoTab", () => ({ ProducaoResumoTab: operational }));
vi.mock("@/components/cockpit/PendenciasInconsistenciasTab", () => ({ PendenciasInconsistenciasTab: operational }));
function actor(user = "A", tenant = "AR") { return { user: { id: user }, profile: { user_id: user, organization_id: tenant, ativo: true }, roles: ["administrador"], loading: false }; }
const response = (name: string, total = 1) => ({ data: { items: [{ os_id: name, numero_os: name, origem_os: "onfarm", status_esteira_oficial: "aguardando", volume_solicitado_l: null }], total_count: total }, error: null });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
  return { client, wrapper };
}
describe("consulta Cockpit efetiva — Auth/transporte simulados", () => {
  beforeEach(() => { vi.clearAllMocks(); auth.current = actor(); rpc.mockImplementation(() => ({ abortSignal: async () => response("OS-A", 51) })); });
  it("executes exclusively list RPC on load, refresh, filtering and pagination; no operational mounts", async () => {
    const { wrapper, client } = setup(); const view = render(<CockpitLaboratorio />, { wrapper });
    await screen.findByText("OS-A");
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() => expect(rpc.mock.calls.at(-1)?.[1].p_offset).toBe(50));
    await waitFor(() => expect(screen.getByRole("button", { name: "Atualizar consulta" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Atualizar consulta" }));
    await waitFor(() => expect(rpc.mock.calls.length).toBeGreaterThanOrEqual(3));
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar OS" }), { target: { value: "micro" } });
    await waitFor(() => expect(rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_busca: "micro", p_offset: 0, p_limit: 50 }));
    expect(new Set(rpc.mock.calls.map(call => call[0]))).toEqual(new Set([COCKPIT_LIST_RPC]));
    expect(from).not.toHaveBeenCalled(); expect(operational).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount(); client.clear();
  });
  it("late A is aborted and never displayed in B; scope remount resets search/page", async () => {
    let finish: ((value: ReturnType<typeof response>) => void) | undefined; let signalA: AbortSignal | undefined;
    rpc.mockImplementation(() => { const user = (auth.current.user as { id: string }).id; return { abortSignal: (signal: AbortSignal) => { if (user === "A") { signalA = signal; return new Promise(resolve => { finish = resolve; }); } return Promise.resolve(response("OS-B")); } }; });
    const { client, wrapper } = setup(); const view = render(<CockpitLaboratorio />, { wrapper });
    await waitFor(() => expect(finish).toBeDefined());
    auth.current = actor("B", "FSF"); view.rerender(<CockpitLaboratorio />);
    await screen.findByText("OS-B"); expect(signalA?.aborted).toBe(true);
    await act(async () => { finish?.(response("A-SECRET")); });
    expect(screen.queryByText("A-SECRET")).toBeNull();
    expect(client.getQueryCache().getAll().some(q => JSON.stringify(q.queryKey).includes('"AR"'))).toBe(false);
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar OS" }), { target: { value: "private" } });
    auth.current = actor("C", "AR"); view.rerender(<CockpitLaboratorio />);
    expect(screen.getByRole("textbox", { name: "Buscar OS" })).toHaveValue("");
    view.unmount(); client.clear();
  });
  it.each(["logout", "loading", "inactive", "no-tenant", "roles-revoked"])("%s immediately clears actual list and blocks requests/refetch", async state => {
    const { wrapper, client } = setup(); const view = render(<CockpitLaboratorio />, { wrapper }); await screen.findByText("OS-A");
    if (state === "logout") auth.current = { user: null, profile: null, roles: [], loading: false };
    if (state === "loading") auth.current = { ...actor(), loading: true };
    if (state === "inactive") auth.current = { ...actor(), profile: { user_id: "A", organization_id: "AR", ativo: false } };
    if (state === "no-tenant") auth.current = actor("A", "");
    if (state === "roles-revoked") auth.current = { ...actor(), roles: [] };
    const calls = rpc.mock.calls.length; view.rerender(<CockpitLaboratorio />);
    expect(screen.queryByText("OS-A")).toBeNull(); expect(screen.getByRole("button", { name: "Atualizar consulta" })).toBeDisabled();
    await waitFor(() => expect(client.getQueryCache().getAll().filter(q => q.queryKey[0] === "cockpit-laboratorio")).toHaveLength(0));
    expect(rpc).toHaveBeenCalledTimes(calls); view.unmount(); client.clear();
  });
  it.each(COCKPIT_QUERY_PREFIXES)("reader %s cannot opt into list mode with wrong RPC key, even manual refetch", async prefix => {
    const { wrapper, client } = setup(); const request = vi.fn(async () => "forbidden");
    const hook = renderHook(() => useCockpitQuery({ queryKey: [prefix, "rpc_bi_esteira_resumo"], reader: "listRPC", queryFn: request }), { wrapper });
    await act(async () => { await hook.result.current.refetch(); }); expect(request).not.toHaveBeenCalled(); hook.unmount(); client.clear();
  });
  it("enabled=false blocks manual refetch of the permitted list key", async () => {
    const { wrapper, client } = setup(); const request = vi.fn(async () => "forbidden");
    const hook = renderHook(() => useCockpitQuery({ queryKey: ["cockpit-laboratorio", COCKPIT_LIST_RPC], reader: "listRPC", enabled: false, queryFn: request }), { wrapper });
    await act(async () => { await hook.result.current.refetch(); }); expect(request).not.toHaveBeenCalled(); hook.unmount(); client.clear();
  });
  it("contained RPC error renders safely without any fallback", async () => {
    rpc.mockImplementation(() => ({ abortSignal: async () => ({ data: null, error: { code: "42501", message: "private detail" } }) }));
    const { wrapper, client } = setup(); const view = render(<CockpitLaboratorio />, { wrapper }); await screen.findByRole("alert");
    expect(screen.queryByText("private detail")).toBeNull(); expect(from).not.toHaveBeenCalled(); expect(operational).not.toHaveBeenCalled(); view.unmount(); client.clear();
  });
});