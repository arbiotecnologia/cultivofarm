import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { EstoqueMotorError, operarEstoque } from "@/lib/estoque/motorEstoque";

describe("compatibilidade dos callers de estoque — sem API real", () => {
  beforeEach(() => rpc.mockReset());

  it("mantém nome, parâmetros e resultado da RPC tipada", async () => {
    const data = { ok: true, replay: false, acao: "expedicao" };
    const payload = { os_id: "os-id", os_tipo: "onfarm" };
    rpc.mockResolvedValue({ data, error: null });
    expect(await operarEstoque("expedicao", "item-id", 2, "key", payload)).toBe(data);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("rpc_estoque_operar_v1", {
      p_acao: "expedicao", p_item_id: "item-id", p_quantidade: 2,
      p_idempotency_key: "key", p_payload: payload,
    });
  });

  it("preserva quantidade NULL do estorno e payload default", async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await operarEstoque("estorno_expedicao", "item-id", null, "key");
    expect(rpc).toHaveBeenCalledWith("rpc_estoque_operar_v1", expect.objectContaining({
      p_quantidade: null, p_payload: {},
    }));
  });

  it("continua propagando o erro de negócio sem repetir escrita", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "ESTQ_QUANTIDADE_INVALIDA" } });
    await expect(operarEstoque("ajuste", "item-id", 0, "key")).rejects.toBeInstanceOf(EstoqueMotorError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("expedição automática envia o tipo junto ao ID da OS", () => {
    const caller = readFileSync("src/pages/Entregas.tsx", "utf8");
    const start = caller.indexOf('origem: "entregas.registrarEntrega"');
    expect(start).toBeGreaterThan(-1);
    const payload = caller.slice(start, caller.indexOf("},", start));
    expect(payload).toContain("os_id: itemOsId");
    expect(payload).toContain("os_tipo: itemOsTipo");
  });
});