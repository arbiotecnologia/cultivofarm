/**
 * Fase Fiscal 3.16.2-C — Construção FAIL-CLOSED dos snapshots
 * `fiscal_profile_snapshot` e `tax_snapshot` enviados por item ao
 * `rpc_fiscal_draft_save`.
 *
 * A whitelist implementada aqui espelha estritamente a do servidor:
 * qualquer chave fora do contrato é REMOVIDA antes de sair do cliente,
 * e o servidor recusa payloads com chaves desconhecidas — o cliente
 * apenas evita rejeições triviais e mantém a UI coerente com a UI.
 *
 * NADA aqui autoriza emissão. Sem chamadas externas.
 */
import type { RascunhoItem } from "@/lib/fiscal/rascunhoWizardValidation";

/** Chaves permitidas em cada snapshot — devem espelhar a RPC no servidor. */
export const NFE_PROFILE_KEYS = [
  "ncm",
  "cest",
  "cfop",
  "origem_mercadoria",
  "cst_icms",
  "csosn",
  "unidade",
] as const;

export const NFE_TAX_ROOT_KEYS = ["pis", "cofins", "ipi", "icms"] as const;
export const NFE_TAX_ICMS_KEYS = ["cst", "csosn", "aliquota", "base_calculo_modalidade"] as const;
export const NFE_TAX_PIS_KEYS = ["cst", "aliquota"] as const;
export const NFE_TAX_COFINS_KEYS = ["cst", "aliquota"] as const;
export const NFE_TAX_IPI_KEYS = ["cst", "aliquota"] as const;

export const NFSE_PROFILE_KEYS = [
  "lc116_item",
  "cnae",
  "municipal_tax_code",
  "national_tax_code",
  "municipality_ibge_code",
] as const;

export const NFSE_TAX_KEYS = [
  "iss_rate",
  "iss_withheld",
  "retencoes_suportadas",
] as const;

export const NFSE_RETENTION_KEYS = [
  "pis",
  "cofins",
  "csll",
  "irrf",
  "inss",
] as const;

function nonEmpty(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function numOrNull(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

/**
 * Constrói (profile, tax) para um item conforme o tipo do documento.
 * Somente chaves presentes na whitelist são incluídas — chaves
 * ausentes/vazias são omitidas.
 */
export function buildItemSnapshots(
  invoiceType: "NFE" | "NFSE",
  item: RascunhoItem,
): { profile: Record<string, unknown>; tax: Record<string, unknown> } {
  if (invoiceType === "NFE") return buildNfeSnapshots(item);
  return buildNfseSnapshots(item);
}

function buildNfeSnapshots(item: RascunhoItem): {
  profile: Record<string, unknown>;
  tax: Record<string, unknown>;
} {
  const profile: Record<string, unknown> = {};
  const ncm = nonEmpty(item.ncm);
  const cest = nonEmpty(item.cest);
  const cfop = nonEmpty(item.cfop);
  const origem = nonEmpty(item.origin_code);
  const cstIcms = nonEmpty(item.icms_cst);
  const csosn = nonEmpty(item.icms_csosn);
  const unidade = nonEmpty(item.commercial_unit);
  if (ncm) profile.ncm = ncm;
  if (cest) profile.cest = cest;
  if (cfop) profile.cfop = cfop;
  if (origem) profile.origem_mercadoria = origem;
  if (cstIcms) profile.cst_icms = cstIcms;
  if (csosn) profile.csosn = csosn;
  if (unidade) profile.unidade = unidade;

  const tax: Record<string, unknown> = {};
  const icms: Record<string, unknown> = {};
  if (cstIcms) icms.cst = cstIcms;
  if (csosn) icms.csosn = csosn;
  if (Object.keys(icms).length > 0) tax.icms = icms;
  const pisCst = nonEmpty(item.pis_cst);
  if (pisCst) tax.pis = { cst: pisCst };
  const cofinsCst = nonEmpty(item.cofins_cst);
  if (cofinsCst) tax.cofins = { cst: cofinsCst };
  const ipiCst = nonEmpty(item.ipi_cst);
  if (ipiCst) tax.ipi = { cst: ipiCst };
  return { profile, tax };
}

function buildNfseSnapshots(item: RascunhoItem): {
  profile: Record<string, unknown>;
  tax: Record<string, unknown>;
} {
  const profile: Record<string, unknown> = {};
  const lc = nonEmpty(item.lc116_item);
  const cnae = nonEmpty(item.cnae);
  const munTax = nonEmpty(item.municipal_taxation_code);
  if (lc) profile.lc116_item = lc;
  if (cnae) profile.cnae = cnae;
  if (munTax) profile.municipal_tax_code = munTax;
  // national_tax_code / municipality_ibge_code não são editáveis no wizard
  // atual, mas ficam previstos no contrato para futuras extensões.

  const tax: Record<string, unknown> = {};
  const rate = numOrNull(item.iss_rate);
  if (rate !== null) tax.iss_rate = rate;
  if (typeof item.iss_withheld === "boolean") tax.iss_withheld = item.iss_withheld;
  return { profile, tax };
}
