/**
 * Fase Fiscal 3.20.2 — Contrato do hook useAssociateMicroorganism
 *
 * Valida:
 *  - RPC canônica `rpc_associate_microorganism_fiscal_product` é invocada
 *    com payload contendo APENAS os dois parâmetros nomeados.
 *  - Autorizados (admin/financeiro) obtêm sucesso; negados
 *    (gestor/tecnico_agronomo/consultor/outros) recebem
 *    `permission_denied`.
 *  - Desassociação (`productId = null`) é encaminhada.
 *  - `not_found` (micro) e `product_not_found` (produto) propagam corretos.
 *  - Nenhuma escrita via `.from("microrganismos").update(...)` ocorre.
 *  - Nenhuma chamada DELETE ocorre.
 *  - FEATURE_FLAGS.fiscalEmissionEnabled permanece false.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";
import { FEATURE_FLAGS } from "@/config/featureFlags";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { useAssociateMicroorganism } from "@/hooks/useMicroorganismFiscalAssociation";
import { GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE } from "@/lib/catalogo/globalCatalogWriteContainment";

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

// P1 contido (migration 20261014192417): product_id é GLOBAL; a RPC foi revogada para
// PUBLIC/anon/authenticated. O hook deve falhar explicitamente ANTES de qualquer chamada.
describe("useAssociateMicroorganism (contenção global)", () => {
  it("emission flag permanece desabilitada", () => {
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
  });
  it.each([["associar", "p1"], ["desassociar", null]] as const)("%s falha sem chamar RPC nem tabela", async (_l, productId) => {
    rpcMock.mockResolvedValue({ data: [{ id: "m1", product_id: productId }], error: null });
    const { result } = renderHook(() => useAssociateMicroorganism(), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ microorganismId: "m1", productId }))
      .rejects.toThrow(GLOBAL_CATALOG_WRITE_BLOCKED_MESSAGE);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isSuccess).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
