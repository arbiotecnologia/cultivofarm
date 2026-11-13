import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";

const s = vi.hoisted(() => ({
  user: { id: "U1" }, session: { user: { id: "U1" }, expires_at: 1 },
  profile: { id: "P1", user_id: "U1", organization_id: "ORG-A", ativo: true, senha_provisoria: false },
  roles: ["administrador"], loading: false, error: null, authzReady: true, authzEpoch: 0,
  checkAuthzAccess: () => true,
}));
const calls = vi.hoisted(() => ({ list: 0, owned: 0 }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => s }));
vi.mock("@/integrations/supabase/client", () => {
  const rows = [{ id: "p1", nome: "SOLO-X", codigo: "S1", familia_catalogo: null, owner_organization_id: "ORG-A", product_fiscal_profiles: [] }];
  const builder = (owned: boolean): any => {
    const b: any = {};
    for (const m of ["select", "eq", "order", "range", "or", "not", "is", "limit"]) b[m] = () => b;
    b.in = () => b;
    b.then = (res: (v: unknown) => void) => { owned ? calls.owned++ : calls.list++; res({ data: rows, error: null, count: 1 }); };
    return b;
  };
  return { supabase: { from: () => { let owned = false; const b = builder(false); const sel = b.select; b.select = (cols: string) => { owned = cols.startsWith("id, owner_organization_id"); return owned ? builder(true) : sel(); }; return b; } } };
});

import { useOwnedProductIds, useProductFiscalList } from "@/hooks/useProductFiscalProfiles";

describe("tela Perfis Fiscais > Produtos: lista fiscal + propriedade (hooks reais)", () => {
  it("estáveis com tela parada e filtros; troca de conta expulsa cache antigo", async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    let search = "";
    const h = renderHook(() => {
      const list = useProductFiscalList({ search, status: null, page: 0, pageSize: 20, familia: null } as any);
      const owned = useOwnedProductIds(list.data?.items.map((i: { id: string }) => i.id) ?? []);
      return { list, owned };
    }, { wrapper });
    await waitFor(() => { expect(h.result.current.list.data?.items).toHaveLength(1); expect(h.result.current.owned.confirmed).toBe(true); });
    const settled = { ...calls };
    for (let i = 0; i < 6; i++) { h.rerender(); await act(async () => { await new Promise(r => setTimeout(r, 15)); }); }
    expect(calls).toEqual(settled);
    expect(h.result.current.list.isLoading).toBe(false);
    expect(h.result.current.list.data?.items).toHaveLength(1);

    search = "solo"; h.rerender();
    await waitFor(() => expect(h.result.current.list.data?.items).toHaveLength(1));
    const afterFilter = { ...calls };
    for (let i = 0; i < 4; i++) { h.rerender(); await act(async () => { await new Promise(r => setTimeout(r, 15)); }); }
    expect(calls).toEqual(afterFilter);
    expect(h.result.current.owned.confirmed).toBe(true);

    // Troca de conta/empresa: dados antigos não aparecem e caches de ORG-A saem.
    s.user = { id: "U2" }; s.session = { user: { id: "U2" }, expires_at: 2 };
    s.profile = { ...s.profile, id: "P2", user_id: "U2", organization_id: "ORG-B" };
    h.rerender();
    expect(qc.getQueryCache().getAll().some(q => JSON.stringify(q.queryKey).includes("ORG-A"))).toBe(false);
    await waitFor(() => expect(h.result.current.list.data?.items).toHaveLength(1));
    h.unmount(); qc.clear();
  });
});
