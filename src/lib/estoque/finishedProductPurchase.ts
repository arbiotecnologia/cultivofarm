import { isStockContentUnit, FINISHED_PRODUCT_ORIGIN, type StockContentUnit } from "./stockUnits";

export const FINISHED_PRODUCT_PURCHASE_CONTRACT = "FINISHED_PRODUCT_PURCHASE_V1" as const;

export interface FinishedProductPurchaseDraft {
  produto_id: string;
  embalagem_id: string;
  lote_fornecedor: string;
  quantidade: string;
  compra_referencia: string;
  fornecedor_nome: string;
  validade: string;
}

export interface FinishedProductPurchaseCapability {
  contract: typeof FINISHED_PRODUCT_PURCHASE_CONTRACT;
  available: boolean;
}

export interface FinishedProductPurchaseAck {
  ok: true;
  replay: boolean;
  lote_id: string;
  estoque_produto_id: string;
  movimentacao_id: string;
  origem_estoque: typeof FINISHED_PRODUCT_ORIGIN;
  unidade_conteudo: StockContentUnit;
  conteudo_por_unidade: number;
  quantidade_conteudo: number;
  embalagem_versao: number;
}

export type FinishedProductPurchasePayload = Record<string, unknown> & {
  p_produto_id: string;
  p_embalagem_id: string;
  p_lote_fornecedor: string;
  p_quantidade: number;
  p_compra_referencia: string;
  p_fornecedor_nome: string;
  p_validade: string | null;
};

type RpcError = { code?: string; message?: string };
type RpcResult = { data: unknown; error: RpcError | null };
export type PurchaseRpc = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEFINITIVE_CODES = new Set(["42501", "22023", "23505", "23514", "PGRST202"]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Resposta do servidor inválida");
  return value as Record<string, unknown>;
}

function requiredText(value: string, label: string, maxLength: number): string {
  const text = value.trim();
  if (!text || text.length > maxLength) throw new Error(`${label} é obrigatório e deve ter até ${maxLength} caracteres.`);
  return text;
}

function validCivilDate(value: string): boolean {
  if (!value) return true;
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function buildFinishedProductPurchasePayload(draft: FinishedProductPurchaseDraft): FinishedProductPurchasePayload {
  if (!UUID.test(draft.produto_id) || !UUID.test(draft.embalagem_id)) throw new Error("Selecione produto e apresentação do catálogo.");
  if (!/^\d+$/.test(draft.quantidade)) throw new Error("Informe um número inteiro de embalagens.");
  const quantity = Number(draft.quantidade);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Informe um número inteiro de embalagens maior que zero.");
  if (!validCivilDate(draft.validade)) throw new Error("Informe uma validade válida.");
  return {
    p_produto_id: draft.produto_id,
    p_embalagem_id: draft.embalagem_id,
    p_lote_fornecedor: requiredText(draft.lote_fornecedor, "O lote do fornecedor", 120),
    p_quantidade: quantity,
    p_compra_referencia: requiredText(draft.compra_referencia, "A referência da compra", 120),
    p_fornecedor_nome: requiredText(draft.fornecedor_nome, "O fornecedor", 200),
    p_validade: draft.validade || null,
  };
}

export function parseFinishedProductPurchaseCapability(raw: unknown): FinishedProductPurchaseCapability {
  const data = object(raw);
  if (data.contract !== FINISHED_PRODUCT_PURCHASE_CONTRACT || typeof data.available !== "boolean") {
    throw new Error("Capability de compra incompatível");
  }
  return { contract: FINISHED_PRODUCT_PURCHASE_CONTRACT, available: data.available };
}

function finiteNumber(value: unknown, positive: boolean): number {
  const number = Number(value);
  if (!Number.isFinite(number) || (positive ? number <= 0 : number < 0)) throw new Error("ACK de compra inválido");
  return number;
}

export function parseFinishedProductPurchaseAck(raw: unknown): FinishedProductPurchaseAck {
  const data = object(raw);
  if (data.ok !== true || typeof data.replay !== "boolean" ||
      !UUID.test(String(data.lote_id)) || !UUID.test(String(data.estoque_produto_id)) || !UUID.test(String(data.movimentacao_id)) ||
      data.origem_estoque !== FINISHED_PRODUCT_ORIGIN || !isStockContentUnit(data.unidade_conteudo) ||
      !Number.isInteger(Number(data.embalagem_versao)) || Number(data.embalagem_versao) <= 0) {
    throw new Error("ACK de compra inválido");
  }
  return {
    ok: true,
    replay: data.replay,
    lote_id: String(data.lote_id),
    estoque_produto_id: String(data.estoque_produto_id),
    movimentacao_id: String(data.movimentacao_id),
    origem_estoque: FINISHED_PRODUCT_ORIGIN,
    unidade_conteudo: data.unidade_conteudo,
    conteudo_por_unidade: finiteNumber(data.conteudo_por_unidade, true),
    quantidade_conteudo: finiteNumber(data.quantidade_conteudo, false),
    embalagem_versao: Number(data.embalagem_versao),
  };
}

async function call(rpc: PurchaseRpc, name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpc(name, args);
  if (error) {
    const failure = new Error(error.message || "Operação não confirmada") as Error & { serverCode?: string };
    failure.serverCode = error.code;
    throw failure;
  }
  return data;
}

interface RetainedAttempt {
  scope: string;
  signature: string;
  payload: FinishedProductPurchasePayload;
  key: string;
}

/** Uma intenção e uma chave; resposta incerta só pode repetir exatamente o mesmo pedido. */
export class FinishedProductPurchaseAttempt {
  private retained: RetainedAttempt | null = null;
  private busy = false;

  get pending(): boolean {
    return this.retained !== null;
  }

  async send(input: {
    scope: string;
    current: () => boolean;
    draft: FinishedProductPurchaseDraft;
    rpc: PurchaseRpc;
  }): Promise<FinishedProductPurchaseAck> {
    if (this.busy) throw new Error("Aguarde a entrada em andamento.");
    if (!input.current()) throw new Error("Sessão em revalidação; nenhuma entrada foi enviada.");
    const payload = buildFinishedProductPurchasePayload(input.draft);
    if (this.retained && this.retained.scope !== input.scope) this.retained = null;
    const signature = JSON.stringify([input.scope, payload]);
    if (this.retained && this.retained.signature !== signature) {
      throw new Error("Reconcilie a mesma tentativa antes de alterar os dados da compra.");
    }
    if (!this.retained) {
      this.retained = { scope: input.scope, signature, payload, key: crypto.randomUUID() };
    }
    const attempt = this.retained;
    this.busy = true;
    let writerCalled = false;
    try {
      // Probe fresco: cache, montagem do formulário ou presença da aba não autorizam o writer.
      const capability = parseFinishedProductPurchaseCapability(await call(input.rpc, "rpc_finished_product_purchase_capability_v1"));
      if (!input.current()) throw new Error("Contexto alterado antes da entrada; resultado não adotado.");
      if (!capability.available) {
        this.retained = null;
        throw new Error("Compra para revenda indisponível neste momento.");
      }
      writerCalled = true;
      const raw = await call(input.rpc, "rpc_finished_product_purchase_entry_v1", {
        ...attempt.payload,
        p_idempotency_key: attempt.key,
      });
      if (!input.current()) throw new Error("Contexto alterado; confirme a mesma tentativa antes de criar outra entrada.");
      const ack = parseFinishedProductPurchaseAck(raw);
      this.retained = null;
      return ack;
    } catch (error) {
      const code = (error as { serverCode?: unknown }).serverCode;
      if (writerCalled && typeof code === "string" && DEFINITIVE_CODES.has(code)) this.retained = null;
      throw error;
    } finally {
      this.busy = false;
    }
  }
}
