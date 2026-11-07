import { describe, expect, it, vi } from "vitest";
import {
  FinishedProductPurchaseAttempt,
  buildFinishedProductPurchasePayload,
  parseFinishedProductPurchaseAck,
  parseFinishedProductPurchaseCapability,
  type FinishedProductPurchaseDraft,
  type PurchaseRpc,
} from "./finishedProductPurchase";

const PRODUCT = "10000000-0000-4000-8000-000000000001";
const PACK = "10000000-0000-4000-8000-000000000002";
const LOT = "10000000-0000-4000-8000-000000000003";
const STOCK = "10000000-0000-4000-8000-000000000004";
const MOVEMENT = "10000000-0000-4000-8000-000000000005";
const draft = (): FinishedProductPurchaseDraft => ({
  produto_id: PRODUCT, embalagem_id: PACK, lote_fornecedor: "FORN-500G", quantidade: "2",
  compra_referencia: "COMPRA-LOCAL-1", fornecedor_nome: "Fornecedor fictício", validade: "2028-12-31",
});
const ack = (replay = false) => ({
  ok: true, replay, lote_id: LOT, estoque_produto_id: STOCK, movimentacao_id: MOVEMENT,
  origem_estoque: "compra_produto_acabado_revenda", unidade_conteudo: "g",
  conteudo_por_unidade: 500, quantidade_conteudo: 1000, embalagem_versao: 1,
});

describe("contrato de compra para revenda", () => {
  it("envia 2 embalagens e não envia tenant, conteúdo ou totais calculados no cliente", () => {
    const payload = buildFinishedProductPurchasePayload(draft());
    expect(payload.p_quantidade).toBe(2);
    expect(Object.keys(payload).sort()).toEqual([
      "p_compra_referencia", "p_embalagem_id", "p_fornecedor_nome", "p_lote_fornecedor",
      "p_produto_id", "p_quantidade", "p_validade",
    ]);
    expect(payload).not.toHaveProperty("p_organization_id");
    expect(payload).not.toHaveProperty("p_conteudo_por_unidade");
  });

  it.each(["0.5", "0", "-1", "NaN", "2,5"])("recusa quantidade não inteira: %s", (quantity) => {
    expect(() => buildFinishedProductPurchasePayload({ ...draft(), quantidade: quantity })).toThrow();
  });

  it("recusa data civil impossível e apresentação fora do catálogo", () => {
    expect(() => buildFinishedProductPurchasePayload({ ...draft(), validade: "2028-02-30" })).toThrow("validade");
    expect(() => buildFinishedProductPurchasePayload({ ...draft(), embalagem_id: "inventada" })).toThrow("catálogo");
  });

  it("capability precisa do contrato exato e available booleano", () => {
    expect(parseFinishedProductPurchaseCapability({ contract: "FINISHED_PRODUCT_PURCHASE_V1", available: true }).available).toBe(true);
    expect(() => parseFinishedProductPurchaseCapability({ contract: "OUTRO", available: true })).toThrow();
    expect(() => parseFinishedProductPurchaseCapability({ contract: "FINISHED_PRODUCT_PURCHASE_V1", available: "true" })).toThrow();
  });

  it("ACK confirma 2 UN de 500 g = 1.000 g e rejeita dimensão inválida", () => {
    expect(parseFinishedProductPurchaseAck(ack())).toMatchObject({ conteudo_por_unidade: 500, quantidade_conteudo: 1000, unidade_conteudo: "g" });
    expect(() => parseFinishedProductPurchaseAck({ ...ack(), unidade_conteudo: "L" })).toThrow();
    expect(() => parseFinishedProductPurchaseAck({ ...ack(), quantidade_conteudo: "NaN" })).toThrow();
  });
});

describe("autorização, persistência e duplicação da tentativa", () => {
  it("capability fechada impede qualquer escrita", async () => {
    const writer = vi.fn();
    const rpc: PurchaseRpc = async (name) => name.includes("capability")
      ? { data: { contract: "FINISHED_PRODUCT_PURCHASE_V1", available: false }, error: null }
      : { data: await writer(), error: null };
    await expect(new FinishedProductPurchaseAttempt().send({ scope: "actor-a", current: () => true, draft: draft(), rpc })).rejects.toThrow("indisponível");
    expect(writer).not.toHaveBeenCalled();
  });

  it("resposta perdida repete a mesma chave e o servidor persistente devolve replay sem duplicar", async () => {
    const keys: string[] = [];
    let persisted = 0;
    let uncertain = true;
    const rpc: PurchaseRpc = async (name, args) => {
      if (name.includes("capability")) return { data: { contract: "FINISHED_PRODUCT_PURCHASE_V1", available: true }, error: null };
      keys.push(String(args?.p_idempotency_key));
      if (uncertain) { uncertain = false; persisted += 1; throw new Error("rede perdida"); }
      return { data: ack(persisted === 1), error: null };
    };
    const attempt = new FinishedProductPurchaseAttempt();
    await expect(attempt.send({ scope: "actor-a", current: () => true, draft: draft(), rpc })).rejects.toThrow("rede perdida");
    const result = await attempt.send({ scope: "actor-a", current: () => true, draft: draft(), rpc });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(result.replay).toBe(true);
    expect(persisted).toBe(1);
  });

  it("mudança de payload após resposta incerta fica bloqueada", async () => {
    let calls = 0;
    const rpc: PurchaseRpc = async (name) => {
      if (name.includes("capability")) return { data: { contract: "FINISHED_PRODUCT_PURCHASE_V1", available: true }, error: null };
      calls += 1;
      throw new Error("timeout");
    };
    const attempt = new FinishedProductPurchaseAttempt();
    await expect(attempt.send({ scope: "actor-a", current: () => true, draft: draft(), rpc })).rejects.toThrow("timeout");
    await expect(attempt.send({ scope: "actor-a", current: () => true, draft: { ...draft(), quantidade: "3" }, rpc })).rejects.toThrow("mesma tentativa");
    expect(calls).toBe(1);
  });

  it("duplo clique concorrente faz uma única chamada ao writer", async () => {
    let resolveWriter!: (value: { data: unknown; error: null }) => void;
    let started!: () => void;
    const writerStarted = new Promise<void>((resolve) => { started = resolve; });
    const writerResult = new Promise<{ data: unknown; error: null }>((resolve) => { resolveWriter = resolve; });
    const writer = vi.fn(() => { started(); return writerResult; });
    const rpc: PurchaseRpc = async (name) => name.includes("capability")
      ? { data: { contract: "FINISHED_PRODUCT_PURCHASE_V1", available: true }, error: null }
      : writer();
    const attempt = new FinishedProductPurchaseAttempt();
    const first = attempt.send({ scope: "actor-a", current: () => true, draft: draft(), rpc });
    await writerStarted;
    await expect(attempt.send({ scope: "actor-a", current: () => true, draft: draft(), rpc })).rejects.toThrow("andamento");
    resolveWriter({ data: ack(), error: null });
    await expect(first).resolves.toMatchObject({ replay: false });
    expect(writer).toHaveBeenCalledTimes(1);
  });

  it("negação definitiva não deixa uma tentativa inválida retida", async () => {
    const keys: string[] = [];
    let denied = true;
    const rpc: PurchaseRpc = async (name, args) => {
      if (name.includes("capability")) return { data: { contract: "FINISHED_PRODUCT_PURCHASE_V1", available: true }, error: null };
      keys.push(String(args?.p_idempotency_key));
      if (denied) { denied = false; return { data: null, error: { code: "42501", message: "ator revogado" } }; }
      return { data: ack(), error: null };
    };
    const attempt = new FinishedProductPurchaseAttempt();
    await expect(attempt.send({ scope: "actor-a", current: () => true, draft: draft(), rpc })).rejects.toThrow("ator revogado");
    await expect(attempt.send({ scope: "actor-a", current: () => true, draft: { ...draft(), quantidade: "1" }, rpc })).resolves.toMatchObject({ ok: true });
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("fence de identidade impede dispatch depois de revogação durante a capability", async () => {
    let valid = true;
    const writer = vi.fn();
    const rpc: PurchaseRpc = async (name) => {
      if (name.includes("capability")) { valid = false; return { data: { contract: "FINISHED_PRODUCT_PURCHASE_V1", available: true }, error: null }; }
      return { data: await writer(), error: null };
    };
    await expect(new FinishedProductPurchaseAttempt().send({ scope: "actor-a", current: () => valid, draft: draft(), rpc })).rejects.toThrow("Contexto alterado");
    expect(writer).not.toHaveBeenCalled();
  });
});
