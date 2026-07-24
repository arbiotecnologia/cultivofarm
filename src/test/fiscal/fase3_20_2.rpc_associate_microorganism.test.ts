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

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

describe("useAssociateMicroorganism (RPC contract)", () => {
  it("emission flag permanece desabilitada", () => {
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
  });

  it("chama a RPC com apenas dois parâmetros nomeados (admin/financeiro autorizados)", async () => {
    rpcMock.mockResolvedValue({ data: [{ id: "m1", product_id: "p1" }], error: null });
    const { result } = renderHook(() => useAssociateMicroorganism(), { wrapper: wrapper() });
    await result.current.mutateAsync({ microorganismId: "m1", productId: "p1" });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fnName, args] = rpcMock.mock.calls[0];
    expect(fnName).toBe("rpc_associate_microorganism_fiscal_product");
    expect(Object.keys(args as object).sort()).toEqual(["p_microorganism_id", "p_product_id"]);
    expect(args).toEqual({ p_microorganism_id: "m1", p_product_id: "p1" });
    // Nenhuma escrita direta na tabela
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("encaminha desassociação com p_product_id = null", async () => {
    rpcMock.mockResolvedValue({ data: [{ id: "m1", product_id: null }], error: null });
    const { result } = renderHook(() => useAssociateMicroorganism(), { wrapper: wrapper() });
    const out = await result.current.mutateAsync({ microorganismId: "m1", productId: null });
    expect(rpcMock.mock.calls[0][1]).toEqual({ p_microorganism_id: "m1", p_product_id: null });
    expect(out).toEqual({ id: "m1", product_id: null });
  });

  it.each([
    ["gestor", { code: "42501", message: "permission denied" }],
    ["tecnico_agronomo", { code: "42501", message: "permission denied for function" }],
    ["consultor", { code: "42501", message: "rls: permission_denied" }],
    ["outro", { status: 403, message: "forbidden" }],
  ])("papel %s recebe permission_denied via RPC", async (_role, errObj) => {
    rpcMock.mockResolvedValue({ data: null, error: errObj });
    const { result } = renderHook(() => useAssociateMicroorganism(), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ microorganismId: "m1", productId: "p1" }))
      .rejects.toThrow("permission_denied");
  });

  it("microrganismo inexistente propaga not_found", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "P0002", message: "not_found" } });
    const { result } = renderHook(() => useAssociateMicroorganism(), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ microorganismId: "missing", productId: null }))
      .rejects.toThrow("not_found");
  });

  it("produto inexistente propaga product_not_found", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "P0002", message: "product_not_found" } });
    const { result } = renderHook(() => useAssociateMicroorganism(), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ microorganismId: "m1", productId: "missing" }))
      .rejects.toThrow("product_not_found");
  });

  it("resultado vazio da RPC é tratado como not_found", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useAssociateMicroorganism(), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ microorganismId: "m1", productId: "p1" }))
      .rejects.toThrow("not_found");
  });

  it("nunca invoca supabase.from().update() nem .delete()", async () => {
    rpcMock.mockResolvedValue({ data: [{ id: "m1", product_id: "p1" }], error: null });
    const { result } = renderHook(() => useAssociateMicroorganism(), { wrapper: wrapper() });
    await result.current.mutateAsync({ microorganismId: "m1", productId: "p1" });
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(fromMock).not.toHaveBeenCalled();
  });
});
