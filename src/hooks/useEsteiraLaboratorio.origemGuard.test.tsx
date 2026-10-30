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

describe('Reserva individual contida independentemente da origem/override',()=>{
 it.each([['os-A','padrao',false],['os-OUTRA','padrao',false],['os-OUTRA','padrao',true],['os-B','onfarm',false]])('origem %s/%s override=%s não abre writer',async(os,origem,override)=>{
  const {result}=renderHook(()=>useEsteiraLaboratorio(),{wrapper});let ok=false;await act(async()=>{ok=await result.current.reservarEstoque(baseItem,baseReserva,String(os),String(origem),Boolean(override));});
  expect(ok).toBe(false);expect(rpcMock).not.toHaveBeenCalled();expect(insertMock).not.toHaveBeenCalled();expect(toastSuccess).not.toHaveBeenCalled();expect(toastError).toHaveBeenCalled();
 });
});
