import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { EstoqueMotorError, operarEstoque } from "@/lib/estoque/motorEstoque";
import { DELIVERY_CANCELLATION_BLOCK, DELIVERY_OPERATION_BLOCK } from "@/lib/entregas/operationalContainment";
import { buildGroupArgs, GROUP_RPC, runAtomicGroup, type GroupInput } from "@/lib/entregas/deliveryOperationsFlow";

const OS = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const group = (o: Partial<GroupInput> = {}): GroupInput => ({
  requestKey: "grupo-key-0001", expectedOrg: ORG, osId: OS, osTipo: "padrao", osOrigem: "agronomica", osPartnerOrderId: null,
  osObservedUpdatedAt: "2026-10-31T10:00:00.000Z",
  itens: [{ itemId: ITEM, quantidade: 2, observedUpdatedAt: "2026-10-31T09:00:00.000Z", status: "disponivel" }], dados: {}, ...o,
});

describe("compatibilidade dos callers de estoque — sem API real", () => {
  beforeEach(() => rpc.mockReset());

  it("ação não-entrega mantém nome, parâmetros e resultado da RPC tipada", async () => {
    const data = { ok: true, replay: false, acao: "ajuste" };
    const payload = { motivo: "inventário", referencia_tipo: "manual" as const };
    rpc.mockResolvedValue({ data, error: null });
    expect(await operarEstoque("ajuste", "item-id", 2, "key", payload)).toBe(data);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("rpc_estoque_operar_v1", {
      p_acao: "ajuste", p_item_id: "item-id", p_quantidade: 2, p_idempotency_key: "key", p_payload: payload,
    });
  });

  it("preserva quantidade NULL e payload default onde ainda aplicável", async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await operarEstoque("cancelamento_reserva", "item-id", null, "key");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("rpc_estoque_operar_v1", expect.objectContaining({ p_quantidade: null, p_payload: {} }));
  });

  it.each([
    ["expedicao", 2, {}, DELIVERY_OPERATION_BLOCK],
    ["entrega", 2, {}, DELIVERY_OPERATION_BLOCK],
    ["estorno_expedicao", null, {}, DELIVERY_CANCELLATION_BLOCK],
    ["devolucao", 1, { referencia_tipo: "entrega" }, DELIVERY_OPERATION_BLOCK],
  ] as const)("contenção: %s pelo motor legado falha sem chamar RPC", async (acao, qtd, payload, msg) => {
    await expect(operarEstoque(acao, "item-id", qtd, "key", payload)).rejects.toThrow(msg);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("continua propagando o erro de negócio sem repetir escrita", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "ESTQ_QUANTIDADE_INVALIDA" } });
    await expect(operarEstoque("ajuste", "item-id", 0, "key")).rejects.toBeInstanceOf(EstoqueMotorError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("criação vincula OS/chave/CAS e tipo de OS é validado antes de qualquer RPC", async () => {
    expect(buildGroupArgs(group())).toEqual({
      p_os_id: OS, p_origem: "manual", p_request_key: "grupo-key-0001", p_dados: {}, p_os_observed: "2026-10-31T10:00:00.000Z",
      p_itens: [{ item_id: ITEM, quantidade: 2, observed_updated_at: "2026-10-31T09:00:00.000Z" }],
    });
    for (const o of [{ osTipo: "onfarm" }, { osPartnerOrderId: OS }, { osOrigem: "b2b" }]) {
      await expect(runAtomicGroup(rpc, group(o), () => {})).rejects.toThrow(/OnFarm e B2B/);
    }
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: { capability: 1, group: false, cancel: false }, error: null });
    expect(await runAtomicGroup(rpc, group(), () => {})).toEqual({ status: "closed", message: DELIVERY_OPERATION_BLOCK });
    expect(rpc.mock.calls.some(([fn]) => fn === GROUP_RPC)).toBe(false);
  });

  it("Entregas passa o tipo da OS e a revisão observada ao contrato atômico", () => {
    const caller = readFileSync("src/pages/Entregas.tsx", "utf8");
    const start = caller.indexOf("runAtomicGroup(supabase.rpc");
    expect(start).toBeGreaterThan(-1);
    const call = caller.slice(start, caller.indexOf("}, check,", start));
    expect(call).toContain("osId, osTipo");
    expect(call).toContain("osObservedUpdatedAt: observed.os.updated_at");
    expect(call).toContain("observedUpdatedAt: observed.itens[item.id].updated_at");
  });
});
