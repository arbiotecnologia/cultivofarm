/**
 * Fase H4-A — Deriva campos faltantes da Empresa Fiscal, puro e sem I/O.
 *
 * Regras:
 * - Reutiliza colunas reais de `company_fiscal_settings` e os checklists
 *   locais já publicados em `companyFiscalValidation.ts`.
 * - NÃO inventa alíquotas, defaults fiscais nem regras contábeis.
 * - Campos condicionais: NF-e apenas se `nfe_enabled=true`; NFS-e apenas
 *   se `nfse_enabled=true`. Do contrário são "não aplicável".
 * - Severidade `bloqueia_homologacao` para requisitos mínimos; `recomendado`
 *   para itens sensíveis mas não bloqueantes.
 */
import type { CompanyFiscalRow } from "@/hooks/useFiscalCompanySettings";

export type MissingSection = "empresa" | "endereco" | "nfe" | "nfse";
export type MissingSeverity = "bloqueia_homologacao" | "recomendado";

export interface MissingField {
  key: string;
  label: string;
  section: MissingSection;
  severity: MissingSeverity;
  /** Rota + query com aba correta em FiscalEmpresa. */
  deepLink: string;
}

export interface MissingFieldsResult {
  total: number;
  blocking: number;
  recommended: number;
  bySection: Record<MissingSection, MissingField[]>;
  notApplicable: MissingSection[];
}

const LINK_EMPRESA = "/configuracoes/fiscal/empresa?aba=empresa";
const LINK_NFE = "/configuracoes/fiscal/empresa?aba=nfe";
const LINK_NFSE = "/configuracoes/fiscal/empresa?aba=nfse";

function empty(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

function jsonObj(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

/** Retorna a lista de campos faltantes agrupada por seção, sem inventar dados. */
export function computeCompanyMissingFields(
  row: CompanyFiscalRow | null,
): MissingFieldsResult {
  const bySection: Record<MissingSection, MissingField[]> = {
    empresa: [],
    endereco: [],
    nfe: [],
    nfse: [],
  };
  const notApplicable: MissingSection[] = [];

  // Sem singleton ainda inicializado: tudo é "não iniciado".
  if (row === null) {
    return {
      total: 0,
      blocking: 0,
      recommended: 0,
      bySection,
      notApplicable: ["nfe", "nfse"],
    };
  }

  const push = (item: MissingField) => bySection[item.section].push(item);

  // Empresa (bloqueantes)
  if (empty(row.cnpj)) push({ key: "cnpj", label: "CNPJ", section: "empresa", severity: "bloqueia_homologacao", deepLink: LINK_EMPRESA });
  if (empty(row.legal_name)) push({ key: "legal_name", label: "Razão social", section: "empresa", severity: "bloqueia_homologacao", deepLink: LINK_EMPRESA });
  if (empty(row.fiscal_email)) push({ key: "fiscal_email", label: "E-mail fiscal", section: "empresa", severity: "bloqueia_homologacao", deepLink: LINK_EMPRESA });
  if (empty(row.tax_regime)) push({ key: "tax_regime", label: "Regime tributário", section: "empresa", severity: "bloqueia_homologacao", deepLink: LINK_EMPRESA });
  if (empty(row.crt)) push({ key: "crt", label: "CRT (código de regime tributário)", section: "empresa", severity: "bloqueia_homologacao", deepLink: LINK_EMPRESA });
  // Empresa (recomendados)
  if (empty(row.trade_name)) push({ key: "trade_name", label: "Nome fantasia", section: "empresa", severity: "recomendado", deepLink: LINK_EMPRESA });
  if (empty(row.primary_cnae)) push({ key: "primary_cnae", label: "CNAE principal", section: "empresa", severity: "recomendado", deepLink: LINK_EMPRESA });
  if (empty(row.phone)) push({ key: "phone", label: "Telefone", section: "empresa", severity: "recomendado", deepLink: LINK_EMPRESA });

  // Endereço (bloqueantes)
  if (empty(row.postal_code)) push({ key: "postal_code", label: "CEP", section: "endereco", severity: "bloqueia_homologacao", deepLink: LINK_EMPRESA });
  if (empty(row.street)) push({ key: "street", label: "Logradouro", section: "endereco", severity: "bloqueia_homologacao", deepLink: LINK_EMPRESA });
  if (empty(row.number)) push({ key: "number", label: "Número", section: "endereco", severity: "bloqueia_homologacao", deepLink: LINK_EMPRESA });
  if (empty(row.neighborhood)) push({ key: "neighborhood", label: "Bairro", section: "endereco", severity: "bloqueia_homologacao", deepLink: LINK_EMPRESA });
  if (empty(row.city)) push({ key: "city", label: "Município", section: "endereco", severity: "bloqueia_homologacao", deepLink: LINK_EMPRESA });
  if (empty(row.state)) push({ key: "state", label: "UF", section: "endereco", severity: "bloqueia_homologacao", deepLink: LINK_EMPRESA });
  if (empty(row.municipality_ibge_code)) push({ key: "municipality_ibge_code", label: "Código IBGE do município", section: "endereco", severity: "bloqueia_homologacao", deepLink: LINK_EMPRESA });

  // NF-e condicional
  if (row.nfe_enabled === true) {
    const nfeCfg = jsonObj(row.nfe_configuration);
    if (empty(row.state_registration)) push({ key: "state_registration", label: "Inscrição estadual", section: "nfe", severity: "bloqueia_homologacao", deepLink: LINK_NFE });
    if (empty(row.nfe_series) && empty(nfeCfg.series)) push({ key: "nfe_series", label: "Série NF-e", section: "nfe", severity: "bloqueia_homologacao", deepLink: LINK_NFE });
    if (empty(nfeCfg.suggested_cfop_in_state)) push({ key: "cfop_in_state", label: "CFOP interno sugerido", section: "nfe", severity: "bloqueia_homologacao", deepLink: LINK_NFE });
    if (empty(nfeCfg.suggested_cfop_interstate)) push({ key: "cfop_interstate", label: "CFOP interestadual sugerido", section: "nfe", severity: "bloqueia_homologacao", deepLink: LINK_NFE });
  } else {
    notApplicable.push("nfe");
  }

  // NFS-e condicional
  if (row.nfse_enabled === true) {
    const nfseCfg = jsonObj(row.nfse_configuration);
    if (empty(row.municipal_registration)) push({ key: "municipal_registration", label: "Inscrição municipal", section: "nfse", severity: "bloqueia_homologacao", deepLink: LINK_NFSE });
    if (empty(nfseCfg.mode)) push({ key: "nfse_mode", label: "Modo NFS-e (nacional/municipal)", section: "nfse", severity: "bloqueia_homologacao", deepLink: LINK_NFSE });
    if (empty(nfseCfg.lc116_item)) push({ key: "lc116_item", label: "Item LC 116", section: "nfse", severity: "bloqueia_homologacao", deepLink: LINK_NFSE });
    // Alíquota ISS é recomendada aqui (regra contábil externa; não inventar).
    if (typeof nfseCfg.iss_rate !== "number") push({ key: "iss_rate", label: "Alíquota ISS (a definir com a contabilidade)", section: "nfse", severity: "recomendado", deepLink: LINK_NFSE });
  } else {
    notApplicable.push("nfse");
  }

  const all = [
    ...bySection.empresa,
    ...bySection.endereco,
    ...bySection.nfe,
    ...bySection.nfse,
  ];
  const blocking = all.filter((f) => f.severity === "bloqueia_homologacao").length;
  const recommended = all.filter((f) => f.severity === "recomendado").length;

  return {
    total: all.length,
    blocking,
    recommended,
    bySection,
    notApplicable,
  };
}

export const SECTION_LABEL: Record<MissingSection, string> = {
  empresa: "Dados da empresa",
  endereco: "Endereço",
  nfe: "NF-e",
  nfse: "NFS-e",
};

export const SEVERITY_LABEL: Record<MissingSeverity, string> = {
  bloqueia_homologacao: "Bloqueia homologação",
  recomendado: "Recomendado",
};
