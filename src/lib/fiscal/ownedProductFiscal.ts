/**
 * Perfil fiscal de itens do catálogo PRÓPRIO da empresa (candidato inativo).
 * Contrato: scripts/fiscal-tenant-catalog-20261101 — RPCs não instalados/sem GRANT.
 * Empresa vem do servidor (dono imutável do item); nunca enviada pelo cliente.
 * Dados retornados nunca autorizam nada: o servidor reautoriza toda escrita.
 */
import { isCivilDate } from "@/lib/comercial/civilDate";

// Writer canônico instalado em produção (SECURITY DEFINER, EXECUTE só authenticated, dono/papel validados no servidor).
export const OWNED_PRODUCT_FISCAL_ENABLED = true as boolean;

export const OWNED_FISCAL_FIELDS = [
  "ncm", "cest", "cfop_in_state", "cfop_interstate", "origin_code", "icms_cst", "icms_csosn",
  "ipi_cst", "pis_cst", "cofins_cst", "commercial_unit", "taxable_unit", "gtin", "taxable_gtin",
  "tax_benefit_code", "fiscal_description", "accounting_notes",
] as const;
export type OwnedFiscalField = (typeof OWNED_FISCAL_FIELDS)[number];
export type OwnedFiscalValues = Partial<Record<OwnedFiscalField, string | null>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATTERNS: Partial<Record<OwnedFiscalField, RegExp>> = {
  ncm: /^[0-9]{8}$/, cest: /^[0-9]{7}$/, cfop_in_state: /^[1-7][0-9]{3}$/, cfop_interstate: /^[1-7][0-9]{3}$/,
  origin_code: /^[0-8]$/, gtin: /^([0-9]{8}|[0-9]{12,14}|SEM GTIN)$/, taxable_gtin: /^([0-9]{8}|[0-9]{12,14}|SEM GTIN)$/,
};

export class OwnedFiscalError extends Error {
  constructor(public readonly kind: "disabled" | "invalid" | "forbidden" | "conflict" | "uncertain", message: string) {
    super(message);
  }
}

/** Valida/normaliza valores; rejeita chaves fora da lista (ex.: profile_status). */
export function normalizeOwnedFiscalValues(input: Record<string, unknown>): OwnedFiscalValues {
  const out: OwnedFiscalValues = {};
  for (const [k, raw] of Object.entries(input)) {
    if (!(OWNED_FISCAL_FIELDS as readonly string[]).includes(k)) throw new OwnedFiscalError("invalid", `Campo não permitido: ${k}`);
    if (raw !== null && typeof raw !== "string") throw new OwnedFiscalError("invalid", `Valor inválido: ${k}`);
    const v = typeof raw === "string" ? raw.trim() : null;
    const value = v === "" ? null : v;
    if (value && value.length > 2000) throw new OwnedFiscalError("invalid", `Valor longo demais: ${k}`);
    const re = PATTERNS[k as OwnedFiscalField];
    if (value && re && !re.test(value)) throw new OwnedFiscalError("invalid", `Formato inválido: ${k}`);
    out[k as OwnedFiscalField] = value;
  }
  return out;
}

/** Único status que o writer canônico pode devolver (nunca promove para VALIDATED). */
export const OWNED_FISCAL_RECEIPT_STATUSES = ["DRAFT", "BLOCKED"] as const;
export type OwnedFiscalReceiptStatus = (typeof OWNED_FISCAL_RECEIPT_STATUSES)[number];

/**
 * timestamptz do servidor: data civil real, hora válida, até 6 frações e fuso obrigatório.
 * Aceita a forma ISO (T) e a forma textual do PostgreSQL (espaço, offset +HH ou +HH:MM).
 */
export function isStrictServerTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}(?::?\d{2})?)$/);
  if (!m || !isCivilDate(m[1])) return false;
  if (Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4]) > 59) return false;
  if (m[5] !== "Z") {
    const off = m[5].slice(1).replace(":", "");
    if (Number(off.slice(0, 2)) > 15 || (off.length > 2 && Number(off.slice(2, 4)) > 59)) return false;
  }
  return true;
}

export interface OwnedFiscalReceipt {
  product_id: string; profile_id: string; organization_id: string;
  profile_status: OwnedFiscalReceiptStatus; updated_at: string; idempotency_key: string; idempotent: boolean;
}

/** ACK exato: qualquer divergência é incerta (mantém chave para reconciliação, sem nova tentativa automática). */
export function parseOwnedFiscalReceipt(data: unknown, expected: { productId: string; idempotencyKey: string }): OwnedFiscalReceipt {
  const r = data as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || r.success !== true
    || r.product_id !== expected.productId || r.idempotency_key !== expected.idempotencyKey
    || typeof r.profile_id !== "string" || !UUID.test(r.profile_id)
    || typeof r.organization_id !== "string" || !UUID.test(r.organization_id)
    || !(OWNED_FISCAL_RECEIPT_STATUSES as readonly unknown[]).includes(r.profile_status)
    || !isStrictServerTimestamp(r.updated_at)
    || typeof r.idempotent !== "boolean") {
    throw new OwnedFiscalError("uncertain", "Resposta do servidor não confirmada; consulte antes de tentar de novo.");
  }
  return r as unknown as OwnedFiscalReceipt;
}

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };

export async function saveOwnedProductFiscal(client: RpcClient, input: {
  productId: string; expectedUpdatedAt: string | null; values: Record<string, unknown>; reason: string; idempotencyKey: string;
}, enabled: boolean = OWNED_PRODUCT_FISCAL_ENABLED): Promise<OwnedFiscalReceipt> {
  if (!enabled) throw new OwnedFiscalError("disabled", "Perfil fiscal do catálogo próprio ainda não liberado.");
  if (!UUID.test(input.productId) || !UUID.test(input.idempotencyKey)) throw new OwnedFiscalError("invalid", "Identificador inválido.");
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500) throw new OwnedFiscalError("invalid", "Informe um motivo de 10 a 500 caracteres.");
  const values = normalizeOwnedFiscalValues(input.values);
  const { data, error } = await client.rpc("tenant_owned_product_fiscal_save", {
    p_product_id: input.productId, p_expected_updated_at: input.expectedUpdatedAt,
    p_values: values, p_reason: reason, p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    if (error.code === "42501") throw new OwnedFiscalError("forbidden", "Sem permissão para este item.");
    if (error.code === "PT409") throw new OwnedFiscalError("conflict", "O perfil mudou ou a chave já foi usada; recarregue antes de salvar.");
    if (error.code === "22023") throw new OwnedFiscalError("invalid", "Dados fiscais inválidos.");
    throw new OwnedFiscalError("uncertain", "Não foi possível confirmar a gravação; consulte antes de tentar de novo.");
  }
  return parseOwnedFiscalReceipt(data, { productId: input.productId, idempotencyKey: input.idempotencyKey });
}
