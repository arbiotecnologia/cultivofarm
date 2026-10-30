/**
 * Guarda de rastreabilidade OS↔lote em `reservarEstoque`.
 *
 * Esta é a validação central que sustenta:
 *   - RegistrarEntregaDialog (aba "Lotes envasados")
 *   - ReservaDialog (página Estoque)
 *   - ReservarEstoqueDialog (Cockpit)
 *
 * Cobre 3 cenários:
 *   1. Lote pertence à OS → RPC é chamado normalmente.
 *   2. Lote de outra OS SEM override → bloqueia (RPC não é chamado) e mostra toast.
 *   3. Lote de outra OS COM override=true → passa pela guarda e chama o RPC.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";

// ---------- mocks ---------------------------------------------------------
const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });
const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
const toastError = vi.fn();
const toastSuccess = vi.fn();

// mapa lote_id -> programacao_id  e  programacao_id -> os_ids
const LOTE_ORIGEM = {
  "lote-origem-A": { programacao_id: "prog-1" },
  "lote-origem-B": { programacao_id: "prog-2" },
};
const PROG_ORIGEM: Record<string, { ordem_servico_id: string | null; ordem_servico_onfarm_id: string | null }> = {
  "prog-1": { ordem_servico_id: "os-A", ordem_servico_onfarm_id: null },
  "prog-2": { ordem_servico_id: null, ordem_servico_onfarm_id: "os-B" },
};

function buildFromChain(table: string) {
  return {
    select: () => ({
      eq: (_col: string, val: string) => ({
        maybeSingle: async () => {
          if (table === "lotes") {
            const row = (LOTE_ORIGEM as any)[val] ?? null;
            return { data: row, error: null };
          }
          if (table === "programacao_producao") {
            return { data: PROG_ORIGEM[val] ?? null, error: null };
          }
          return { data: null, error: null };
        },
      }),
      in: async () => ({ data: [], error: null }),
    }),
    insert: (payload: any) => {
      insertMock(table, payload);
      return Promise.resolve({ data: null, error: null });
    },
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => buildFromChain(table),
    rpc: (...args: any[]) => rpcMock(...args),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-teste" }, profile: { user_id: "user-teste", organization_id: "tenant-teste", ativo: true }, roles: ["administrador"], loading: false }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...a: any[]) => toastError(...a),
    success: (...a: any[]) => toastSuccess(...a),
    warning: vi.fn(),
  },
}));

// ---------- SUT (importa após os mocks) -----------------------------------
import { useEsteiraLaboratorio } from "./useEsteiraLaboratorio";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const baseItem = {
  id: "item-1",
  lote_id: "lote-origem-A", // origem = os-A
  produto_id: "prod-1",
};
const baseReserva = {
  cliente_id: "cli-1",
  quantidade_reservada: 5,
  titular_nome: "Cliente Teste",
};

beforeEach(() => {
  rpcMock.mockClear();
  insertMock.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
});

describe("useEsteiraLaboratorio.reservarEstoque — guarda OS↔lote", () => {
  it("permite reservar quando a OS informada é a origem do lote", async () => {
    const { result } = renderHook(() => useEsteiraLaboratorio(), { wrapper });
    let ok: boolean = false;
    await act(async () => {
      ok = await result.current.reservarEstoque(baseItem, baseReserva, "os-A", "padrao");
    });
    expect(ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe("reservar_estoque_item");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("bloqueia quando o lote pertence a outra OS e não há override", async () => {
    const { result } = renderHook(() => useEsteiraLaboratorio(), { wrapper });
    let ok: boolean = true;
    await act(async () => {
      ok = await result.current.reservarEstoque(baseItem, baseReserva, "os-OUTRA", "padrao");
    });
    expect(ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      expect.stringMatching(/outra OS\/OP.*override/i),
    );
  });

  it("permite reservar em OS divergente quando overrideOrigem=true", async () => {
    const { result } = renderHook(() => useEsteiraLaboratorio(), { wrapper });
    let ok: boolean = false;
    await act(async () => {
      ok = await result.current.reservarEstoque(
        baseItem,
        baseReserva,
        "os-OUTRA",
        "padrao",
        true, // override confirmado pela UI (AlertDialog)
      );
    });
    expect(ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    // Auditoria deve refletir o override
    const auditoriaCall = insertMock.mock.calls.find(
      ([tbl]) => tbl === "laboratorio_esteira_eventos",
    );
    expect(auditoriaCall).toBeDefined();
    expect(auditoriaCall?.[1]?.observacao).toMatch(/OVERRIDE de origem/i);
  });

  it("reconhece origem também em OS onfarm (ordem_servico_onfarm_id)", async () => {
    const { result } = renderHook(() => useEsteiraLaboratorio(), { wrapper });
    let ok: boolean = false;
    await act(async () => {
      ok = await result.current.reservarEstoque(
        { ...baseItem, lote_id: "lote-origem-B" },
        baseReserva,
        "os-B",
        "onfarm",
      );
    });
    expect(ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
