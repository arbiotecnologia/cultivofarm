import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({ contexts: ["admin", "technical"], scope: "A", ready: true, preferred: "technical" as string | null, skip: true }));
const rpc = vi.hoisted(() => vi.fn());
const dirty = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "A" }, profile: { nome: "Teste" }, roles: ["gestor", "consultor_tecnico"], signOut: vi.fn() }) }));
vi.mock("@/hooks/useAvailableContexts", () => ({ useAvailableContexts: () => ({ data: { available_contexts: state.contexts, preferred_context: state.preferred, skip_context_selector: state.skip }, ready: state.ready, scope: state.scope, refetch: vi.fn(), isLoading: false, isError: false, isFetching: false }), registerLoginRedirect: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/useUnsavedChanges", () => ({ hasUnsavedChanges: () => dirty.value }));
import Selector from "@/pages/SelecionarPortal";
import { useSwitchPortal } from "@/hooks/useSwitchPortal";
import { automaticPortalContext, PORTAL_CONTEXT_HOME } from "@/lib/portalContext";
import { setActivePortalContext, getActivePortalContext } from "@/lib/activePortalContext";
import { getPortalDisplayLabel } from "@/lib/portalDisplayLabel";
import { resolveEffectiveRouteRole } from "@/lib/navigation/portalRoleContext";
beforeEach(() => { state.contexts = ["admin", "technical"]; state.scope = "A"; state.ready = true; state.preferred = "technical"; state.skip = true; dirty.value = false; rpc.mockReset(); rpc.mockResolvedValue({ data: { ok: true }, error: null }); sessionStorage.clear(); });
function Location() { return <div data-testid="location">{useLocation().pathname}{useLocation().search}</div>; }
function selector(path = "/selecionar-portal?intent=switch") {
 return render(<MemoryRouter initialEntries={[path]}><Location /><Routes><Route path="/selecionar-portal" element={<Selector />} /><Route path="*" element={<div>Destino</div>} /></Routes></MemoryRouter>);
}
it("gestor+técnico escolhe Gestão sem card B2B inventado", async () => {
 selector(); expect(screen.getByRole("button", { name: "Acessar Gestão" })).toBeInTheDocument();
 expect(screen.queryByRole("button", { name: "Acessar Portal Parceiro B2B" })).toBeNull();
 fireEvent.click(screen.getByRole("button", { name: "Acessar Gestão" }));
 await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/dashboard/geral"));
 expect(getActivePortalContext()).toBe("admin"); expect(rpc).toHaveBeenCalledWith("set_my_context_preference", { p_context: "admin", p_remember: true });
});
it("login respeita preferência, intenção manual não", () => {
 expect(automaticPortalContext(["admin", "technical"], "technical", true, false)).toBe("technical");
 expect(automaticPortalContext(["admin", "technical"], "technical", true, true)).toBeNull();
 selector("/selecionar-portal"); expect(screen.getByTestId("location")).toHaveTextContent("/app");
});
for (const [context, home] of [["technical", "/app"], ["admin", "/dashboard/geral"]] as const) {
 it(`papel/contexto único ${context} segue destino existente`, () => {
 state.contexts = [context]; selector(); expect(screen.getByTestId("location")).toHaveTextContent(home); expect(PORTAL_CONTEXT_HOME[context]).toBe(home);
 });
}
it("papel técnico nunca autoriza rota de Gestão por contexto forjado", () => {
 expect(resolveEffectiveRouteRole({ roles: ["consultor_tecnico"], primaryRole: "consultor_tecnico", path: "/dashboard/geral", activeContext: "admin" }).allowed).toBe(false);
 expect(getPortalDisplayLabel({ activeCtx: "admin", primaryRole: "gestor", roles: ["gestor", "consultor_tecnico"] })).toBe("Gestor");
 expect(getPortalDisplayLabel({ activeCtx: "technical", primaryRole: "gestor", roles: ["gestor", "consultor_tecnico"] })).toBe("Consultor Técnico");
});
it("seleção atrasada após tenant A→B→A não navega nem grava contexto", async () => {
 let finish: ((r: unknown) => void) | undefined;
 rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
 const h = selector(); fireEvent.click(screen.getByRole("button", { name: "Acessar Gestão" }));
 state.scope = "B"; h.rerender(<MemoryRouter><Selector /></MemoryRouter>);
 state.scope = "A"; h.rerender(<MemoryRouter><Selector /></MemoryRouter>);
 await act(async () => finish?.({ data: { ok: true }, error: null }));
 expect(getActivePortalContext()).toBeNull();
});
it("duplo clique bloqueado e lock liberado após erro", async () => {
 let finish: ((r: unknown) => void) | undefined;
 rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
 selector(); const button = screen.getByRole("button", { name: "Acessar Gestão" });
 fireEvent.click(button); fireEvent.click(button); expect(rpc).toHaveBeenCalledTimes(1);
 await act(async () => finish?.({ data: null, error: new Error("fail") }));
 rpc.mockResolvedValue({ data: { ok: true }, error: null }); fireEvent.click(button);
 await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
});
it("cancelar troca preserva contexto/cache e não navega", async () => {
 dirty.value = true; vi.spyOn(window, "confirm").mockReturnValue(false); setActivePortalContext("technical");
 const client = new QueryClient(); client.setQueryData(["visita", "1"], "KEEP");
 const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><MemoryRouter>{children}<Location /></MemoryRouter></QueryClientProvider>;
 const h = renderHook(() => useSwitchPortal(), { wrapper });
 await act(async () => expect(await h.result.current()).toBe(false));
 expect(getActivePortalContext()).toBe("technical"); expect(client.getQueryData(["visita", "1"])).toBe("KEEP");
 expect(screen.getByTestId("location")).toHaveTextContent("/"); h.unmount(); client.clear(); vi.restoreAllMocks();
});
it("troca confirmada usa intenção manual sem reescrever preferência", async () => {
 const client = new QueryClient(); setActivePortalContext("technical");
 const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><MemoryRouter>{children}<Location /></MemoryRouter></QueryClientProvider>;
 const h = renderHook(() => useSwitchPortal(), { wrapper });
 await act(async () => expect(await h.result.current()).toBe(true));
 expect(screen.getByTestId("location")).toHaveTextContent("/selecionar-portal?intent=switch"); expect(rpc).not.toHaveBeenCalled(); expect(getActivePortalContext()).toBeNull();
 h.unmount(); client.clear();
});
