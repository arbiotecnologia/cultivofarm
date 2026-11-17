import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { catalogFamilyMatches } from "@/lib/catalogo/catalogFamilyRead";
import { recCanForwardToLab } from "@/lib/visita/recomendacaoCatalogo";
import { usePartnerCatalog } from "@/hooks/usePartnerCatalog";
import { usePartnerCatalogTecnico } from "@/hooks/usePartnerCatalogTecnico";
import { partnerCatalogRows } from "@/lib/catalogo/partnerCatalogRows";
import { CatalogoCardsGrid } from "@/components/catalogo/CatalogoCardsGrid";
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useCatalogoUnificado", async importOriginal => ({
  ...await importOriginal<typeof import("@/hooks/useCatalogoUnificado")>(),
  useCatalogoUnificado: () => { throw new Error("parallel_internal_read_forbidden"); },
}));
vi.mock("@/components/protocolos/MicroorganismTechnicalProfileDialog", () => ({ MicroorganismTechnicalProfileDialog: () => null }));
vi.mock("@/components/protocolos/ProductTechnicalProfileDialog", () => ({ ProductTechnicalProfileDialog: () => null }));
vi.mock("@/components/catalogo/FichaProdutorDrawer", () => ({ FichaProdutorDrawer: () => null }));
const state = vi.hoisted(() => ({ actor: "A", tenant: "A", ready: true, epoch: 1,
  calls: [] as { name: string; args: unknown; actor: string; tenant: string }[],
  pending: null as null | { resolve: (v: unknown) => void }, delay: false, deny: false, contract: true,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.tenant, ativo: true },
  roles: ["parceiro_b2b"], loading: false, authzReady: state.ready, authzEpoch: state.epoch,
  checkAuthzAccess: () => state.ready,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (name: string, args: unknown) => {
    const actor = state.actor, tenant = state.tenant;
    state.calls.push({ name, args, actor, tenant });
    const rows = ["biologico", "quimico", "fertilizante_adubo", null].map((family, i) => ({
      item_id: `${actor}-${tenant}-${i}`, item_tipo: "produto", produto_nome: `P${i}`, nome: `P${i}`,
      familia_catalogo: family, catalog_contract: state.contract ? "C1B_DUAL_TENANT_V1" : undefined,
      ficha_conteudo: { subtitulo: "Subtitulo aprovado", funcao: "Funcao aprovada", explicacao_produtor: "Uso aprovado", indicacoes_uso: "Indicacao aprovada", cuidados_aplicacao: "Cuidado aprovado", mecanismo_acao: "Mecanismo aprovado", alvos_count: 3, fontes_count: 2 },
      ficha_aprovada: true, ficha_status: "aprovado", valor_litro_brl: name.includes("tecnico") ? null : 12,
    }));
    const value = { data: rows, error: state.deny ? new Error("forbidden_partner") : null };
    const p = state.delay ? new Promise(resolve => { state.pending = { resolve }; }) : Promise.resolve(value);
    return { abortSignal: () => p };
  },
} }));
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => {
  Object.assign(state, { actor: "A", tenant: "A", ready: true, epoch: 1, calls: [], pending: null, delay: false, deny: false, contract: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); });
describe("C1B inactive candidate canonical readers", () => {
  it("actual grid consumes RPC projection, filters families and never mounts internal reader", async () => {
    const h = renderHook(() => usePartnerCatalog("partner-A"), { wrapper });
    await waitFor(() => expect(h.result.current.data).toHaveLength(4));
    render(<CatalogoCardsGrid scope="b2b" source={{ ...h.result.current, data: partnerCatalogRows(h.result.current.data ?? []) }} />, { wrapper });
    expect(screen.getByText("P0")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Químicos" }));
    expect(screen.getByText("P1")).toBeTruthy();
    expect(screen.queryByText("P0")).toBeNull();
    expect(screen.queryByText("P2")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Ver ficha$/ }));
    expect(screen.getByRole("dialog").textContent).toContain("Uso aprovado");
    expect(screen.getByRole("dialog").textContent).toContain("Indicacao aprovada");
    expect(screen.getByRole("dialog").textContent).toContain("Cuidado aprovado");
    expect(screen.getByRole("dialog").textContent).toContain("Mecanismo aprovado");
    expect(screen.getByRole("dialog").textContent).toContain("Alvos / culturas: 3");
    expect(screen.getByRole("dialog").textContent).not.toContain("Explicação técnica");
    expect(screen.getByRole("dialog").textContent).not.toContain("Fontes técnicas");
    expect(state.calls).toHaveLength(1);
  });
  it("open grid sheet is discarded when actor scope changes", async () => {
    const h = renderHook(() => usePartnerCatalog("partner-A"), { wrapper });
    await waitFor(() => expect(h.result.current.data).toHaveLength(4));
    const source = { ...h.result.current, data: partnerCatalogRows(h.result.current.data ?? []) };
    const ui = render(<CatalogoCardsGrid scope="b2b" source={source} />, { wrapper });
    fireEvent.click(screen.getAllByRole("button", { name: /^Ver ficha$/ })[0]);
    expect(screen.getByRole("dialog").textContent).toContain("P0");
    ui.rerender(<CatalogoCardsGrid scope="b2b" source={{ ...source, scope: "actor-B", data: [] }} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("P0")).toBeNull();
  });
  it.each(["biologico", "quimico", "fertilizante_adubo"] as const)("server family %s reaches grid without inference", async family => {
    const h = renderHook(() => usePartnerCatalog("partner-A"), { wrapper });
    await waitFor(() => expect(h.result.current.data).toHaveLength(4));
    const rows = partnerCatalogRows(h.result.current.data ?? []);
    expect(rows.filter(r => catalogFamilyMatches(r, family)).map(r => r.id)).toEqual([`A-A-${family === "biologico" ? 0 : family === "quimico" ? 1 : 2}`]);
    expect(rows.filter(r => catalogFamilyMatches(r, "todos"))).toHaveLength(4);
    expect(state.calls[0].args).toEqual({ p_partner_id: "partner-A", p_catalog_v2: true });
  });
  it("technical role retains NULL financial values and its own RPC", async () => {
    const h = renderHook(() => usePartnerCatalogTecnico(), { wrapper });
    await waitFor(() => expect(h.result.current.data).toHaveLength(4));
    expect(h.result.current.data?.every(r => r.preco_parceiro === null)).toBe(true);
    expect(state.calls[0].name).toBe("get_partner_catalog_tecnico_secure");
    expect(state.calls[0].args).toEqual({ p_catalog_v2: true });
  });
  it.each(["actor", "tenant", "epoch"] as const)("fences late response after %s change", async field => {
    state.delay = true;
    const h = renderHook(() => usePartnerCatalog("partner-A"), { wrapper });
    await waitFor(() => expect(state.pending).not.toBeNull());
    const old = state.pending;
    if (field === "epoch") state.epoch++; else state[field] = "B";
    state.delay = false; h.rerender();
    expect(h.result.current.data).toBeUndefined();
    await waitFor(() => expect(h.result.current.data).toHaveLength(4));
    old?.resolve({ data: [{ item_id: "OLD", catalog_contract: "C1B_DUAL_TENANT_V1" }], error: null });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(h.result.current.data?.some(r => r.item_id === "OLD")).toBe(false);
    expect(client.getQueryCache().getAll().some(q => JSON.stringify(q.state.data).includes("OLD"))).toBe(false);
  });
  it("logout/readiness hides previous rows immediately", async () => {
    const h = renderHook(() => usePartnerCatalogTecnico(), { wrapper });
    await waitFor(() => expect(h.result.current.data).toHaveLength(4));
    state.ready = false; h.rerender();
    expect(h.result.current.data).toBeUndefined();
  });
  it("invalidation rereads only current canonical scope", async () => {
    const h = renderHook(() => usePartnerCatalogTecnico(), { wrapper });
    await waitFor(() => expect(h.result.current.data).toHaveLength(4));
    const before = state.calls.length;
    await client.invalidateQueries({ queryKey: ["partner-catalog-tecnico", "C1B_DUAL_TENANT_V1"] });
    expect(state.calls.length).toBe(before + 1);
    expect(state.calls.at(-1)?.actor).toBe("A");
  });
  it.each(["denied", "old-contract"])("%s never falls back to direct tables or old RPC", async kind => {
    state.deny = kind === "denied"; state.contract = kind !== "old-contract";
    const h = renderHook(() => usePartnerCatalog("partner-A"), { wrapper });
    await waitFor(() => expect(h.result.current.isError).toBe(true));
    expect(h.result.current.data).toBeUndefined(); expect(state.calls).toHaveLength(1);
  });
  it.each(["quimico", "fertilizante_adubo", null])("%s cannot manufacture by fallback", family => {
    expect(recCanForwardToLab("p", null, { id: "p", nome: "P", familia_catalogo: family }, undefined)).toBe(false);
  });
});
