/**
 * Fase 12.8 · Fase 3 · Fase 8 — Testes de comportamento da fila offline.
 *
 * Verifica que:
 *  - erros de negócio (ex.: idempotency_conflict) NÃO removem a pendência;
 *  - erros com SQLSTATE 23505 remanescentes também mantêm a pendência
 *    (o antigo atalho "23505 = sucesso" foi removido);
 *  - o mesmo client_uuid é reutilizado em retries.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => rpcMock(...args),
  },
}));

import {
  enqueueCheckin,
  getPendingCheckins,
  syncPendingCheckins,
} from "@/lib/offlineCheckinQueue";

beforeEach(() => {
  localStorage.clear();
  rpcMock.mockReset();
});

describe("offlineCheckinQueue — Fase 3 hardening", () => {
  it("erro de negócio (idempotency_conflict) mantém a pendência", async () => {
    enqueueCheckin("reg-1", {
      registro_consultor_id: "reg-1",
      tipo_checkin: "chegada_fazenda",
      client_uuid: "uuid-fixo-1",
    });
    rpcMock.mockResolvedValueOnce({
      error: { message: "idempotency_conflict", code: "22023" },
    });

    const res = await syncPendingCheckins();
    expect(res.synced).toBe(0);
    expect(res.failed).toBe(1);
    expect(getPendingCheckins("reg-1")).toHaveLength(1);
  });

  it("erro 23505 remanescente NÃO é tratado como sucesso", async () => {
    enqueueCheckin("reg-2", {
      registro_consultor_id: "reg-2",
      tipo_checkin: "chegada_fazenda",
      client_uuid: "uuid-fixo-2",
    });
    rpcMock.mockResolvedValueOnce({
      error: { message: "unique_violation", code: "23505" },
    });

    const res = await syncPendingCheckins();
    expect(res.synced).toBe(0);
    expect(getPendingCheckins("reg-2")).toHaveLength(1);
  });

  it("preserva o mesmo client_uuid em retries", async () => {
    enqueueCheckin("reg-3", {
      registro_consultor_id: "reg-3",
      tipo_checkin: "chegada_fazenda",
      client_uuid: "uuid-fixo-3",
    });
    rpcMock.mockResolvedValueOnce({
      error: { message: "network fail" },
    });
    await syncPendingCheckins();

    rpcMock.mockResolvedValueOnce({ error: null, data: { id: "x" } });
    await syncPendingCheckins();

    // Ambos os retries devem ter usado o mesmo client_uuid original
    const calls = rpcMock.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0][1].p_client_uuid).toBe("uuid-fixo-3");
    expect(calls[1][1].p_client_uuid).toBe("uuid-fixo-3");
  });

  it("checkout é despachado para a RPC de checkout", async () => {
    enqueueCheckin("reg-4", {
      registro_consultor_id: "reg-4",
      tipo_checkin: "checkout",
      client_uuid: "uuid-fixo-4",
    });
    rpcMock.mockResolvedValueOnce({ error: null, data: { id: "y" } });

    await syncPendingCheckins();
    expect(rpcMock.mock.calls[0][0]).toBe("rpc_realizar_checkout_visita");
  });
});
