import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { catalogFamilyMatches, readCatalogFamily } from "@/lib/catalogo/catalogFamilyRead";
import { recCanForwardToLab } from "@/lib/visita/recomendacaoCatalogo";

const state = vi.hoisted(() => ({ actor: "A", tenant: "A", hidden: ["chem"], blocked: false, calls: [] as string[] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.tenant, ativo: true }, roles: ["administrador"], loading: false }) }));
const products = [
  { id: "bio", nome: "B", familia_catalogo: "biologico", ativo: true, b2b_enabled: true },
  { id: "chem", nome: "Q", familia_catalogo: "quimico", ativo: true, b2b_enabled: true },
  { id: "fert", nome: "F", familia_catalogo: "fertilizante_adubo", ativo: true, b2b_enabled: true },
  { id: "legacy", nome: "L", tipo: "fungicida", ativo: true, b2b_enabled: true },
];
vi.mock("@/hooks/useTenantCatalogVisibility", () => ({ useTenantHiddenIds: () => state.blocked
  ? { status: "error", message: "denied" }
  : { status: "ready", scope: { userId: state.actor, organizationId: state.tenant }, ids: state.hidden } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  let excludes = "";
  const q = { select: () => q, order: () => q, eq: () => q, abortSignal: () => q, not: (_c: string, _op: string, ids: string) => { excludes = ids; return q; },
    then: (resolve: (v: unknown) => unknown) => {
      state.calls.push(table);
      return Promise.resolve({ data: table === "produtos" ? products.filter(p => !excludes.includes(p.id)) : [], error: null }).then(resolve);
    } };
  return q;
} } }));
import { useCatalogoUnificado } from "@/hooks/useCatalogoUnificado";
afterEach(cleanup);

describe("famílias sobre leitores já autorizados", () => {
  it.each(["biologico", "quimico", "fertilizante_adubo"] as const)("separa %s sem inferir tipo legado", family => {
    expect(products.filter(p => catalogFamilyMatches({ tipo: "produto", raw: p }, family)).map(p => p.id))
      .toEqual([family === "biologico" ? "bio" : family === "quimico" ? "chem" : "fert"]);
    expect(catalogFamilyMatches({ tipo: "produto", raw: products[3] }, family)).toBe(false);
  });
  it("preserva legado em Todos e microrganismos em Biológicos", () => {
    expect(catalogFamilyMatches({ tipo: "produto", raw: {} }, "todos")).toBe(true);
    expect(readCatalogFamily("fungicida")).toBeNull();
    expect(catalogFamilyMatches({ tipo: "microrganismo" }, "biologico")).toBe(true);
    expect(catalogFamilyMatches({ tipo: "microrganismo" }, "quimico")).toBe(false);
  });
  it.each(["quimico", "fertilizante_adubo", null, "fungicida"])("jamais encaminha %s ao laboratório", family => {
    expect(recCanForwardToLab("p", null, { id: "p", nome: "P", familia_catalogo: family }, undefined)).toBe(false);
  });
  it("mantém encaminhamento biológico explícito e rejeita par ambíguo", () => {
    const p = { id: "p", nome: "P", familia_catalogo: "biologico" };
    expect(recCanForwardToLab("p", null, p, undefined)).toBe(true);
    expect(recCanForwardToLab("p", "m", p, { id: "m", nome: "M", nome_cientifico: null })).toBe(false);
  });
  it.each(["admin", "interno"] as const)("%s mantém filtro servidor e separa ator/tenant", async scope => {
    // UUIDs válidos para o filtro PostgREST; teste não cria nenhum dado remoto.
    const hidden = "00000000-0000-4000-8000-000000000001";
    const original = products[1].id;
    products[1].id = hidden;
    state.actor = "A"; state.tenant = "A"; state.hidden = [hidden]; state.blocked = false;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const h = renderHook(() => useCatalogoUnificado(scope), { wrapper });
    await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
    expect(h.result.current.data?.map(r => r.id)).toEqual(["bio", "fert", "legacy"]);
    state.actor = "B"; state.tenant = "B"; state.hidden = [];
    h.rerender();
    expect(h.result.current.data).toBeUndefined();
    await waitFor(() => expect(h.result.current.data).toHaveLength(4));
    expect(h.result.current.data?.find(r => r.id === hidden)?.raw.familia_catalogo).toBe("quimico");
    state.blocked = true; state.calls = []; h.rerender();
    expect(h.result.current.data).toBeUndefined();
    expect(h.result.current.isError).toBe(true);
    expect(state.calls).toEqual([]);
    products[1].id = original; state.blocked = false; h.unmount(); client.clear();
  });
});