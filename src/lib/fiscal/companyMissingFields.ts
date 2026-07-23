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
  /**
   * Rota + query com aba correta em FiscalEmpresa. Inclui `campo=<key>`
   * quando o campo possui alvo focável conhecido no formulário; para itens
   * sem alvo mapeado, o deep-link cai de volta apenas na aba (fallback).
   */
  deepLink: string;
  /** Indica se o campo possui alvo focável conhecido no formulário. */
  hasFieldTarget: boolean;
}

export interface MissingFieldsResult {
  total: number;
  blocking: number;
  recommended: number;
  bySection: Record<MissingSection, MissingField[]>;
  notApplicable: MissingSection[];
}

/**
 * Rota canônica da Central Fiscal neste projeto. A especificação H4-A2
 * cita `/fiscal/configuracoes` como padrão de deep-link, porém a rota
 * registrada em `App.tsx` (e amplamente vinculada por outros módulos)
 * é `/configuracoes/fiscal/empresa`. Manter a rota real evita quebrar
 * navegação e viola a regra "não modificar rotas sem autorização".
 * O formato de query/hash — `?aba=<aba>#<id-real>` — é preservado.
 */
export const FISCAL_EMPRESA_BASE = "/configuracoes/fiscal/empresa";
const LINK_EMPRESA = `${FISCAL_EMPRESA_BASE}?aba=empresa`;
const LINK_NFE = `${FISCAL_EMPRESA_BASE}?aba=nfe`;
const LINK_NFSE = `${FISCAL_EMPRESA_BASE}?aba=nfse`;
const LINK_CERTIFICADO = `${FISCAL_EMPRESA_BASE}?aba=certificado`;

/**
 * Deep-link canônico da seção do certificado A1 na Central de Homologação.
 * Nunca inclui qualquer material sensível.
 */
export const CERTIFICADO_A1_DEEP_LINK = `${LINK_CERTIFICADO}#certificado-a1`;

/**
 * Chaves com `id` correspondente em `FiscalEmpresa` (via `FieldRow`).
 * Apenas essas chaves recebem `#<key>` no deep-link. As demais mantêm o
 * link só até a aba, evitando alvo inexistente (fallback silencioso).
 */
export const KNOWN_FIELD_TARGETS: ReadonlySet<string> = new Set<string>([
  // Empresa
  "cnpj", "legal_name", "trade_name", "fiscal_email", "phone",
  "tax_regime", "crt", "primary_cnae",
  "municipal_registration", "state_registration",
  // Endereço
  "postal_code", "street", "number", "complement", "neighborhood",
  "city", "state", "municipality_ibge_code", "country_code",
  // NF-e (ids reais renderizados em FiscalEmpresa)
  "nfe_series", "nfe_cfop_in", "nfe_cfop_out",
  // NFS-e (id real renderizado em FiscalEmpresa)
  "nfse_mode",
  // Certificado digital (id real do wrapper do card A1)
  "certificado-a1",
]);

/**
 * Trata inscrição estadual/municipal como satisfeita quando a empresa
 * declarou explicitamente ser isenta/não contribuinte. Não inventa a
 * condição — exige a marcação textual pelo usuário.
 */
export function isExemptRegistration(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const norm = value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  return norm === "ISENTO" || norm === "ISENTA" || norm === "NAO CONTRIBUINTE";
}

function withField(baseLink: string, key: string): { link: string; hasFieldTarget: boolean } {
  if (!KNOWN_FIELD_TARGETS.has(key)) return { link: baseLink, hasFieldTarget: false };
  // Formato canônico: `?aba=<aba>#<id-real>`. A âncora referencia o `id`
  // real do controle/wrapper em FiscalEmpresa; o hook faz scroll/foco/destaque
  // após a aba montar, com fallback silencioso quando o id não existir.
  return { link: `${baseLink}#${encodeURIComponent(key)}`, hasFieldTarget: true };
}

function build(
  key: string,
  label: string,
  section: MissingSection,
  severity: MissingSeverity,
  baseLink: string,
): MissingField {
  const { link, hasFieldTarget } = withField(baseLink, key);
  return { key, label, section, severity, deepLink: link, hasFieldTarget };
}

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
  if (empty(row.cnpj)) push(build("cnpj", "CNPJ", "empresa", "bloqueia_homologacao", LINK_EMPRESA));
  if (empty(row.legal_name)) push(build("legal_name", "Razão social", "empresa", "bloqueia_homologacao", LINK_EMPRESA));
  if (empty(row.fiscal_email)) push(build("fiscal_email", "E-mail fiscal", "empresa", "bloqueia_homologacao", LINK_EMPRESA));
  if (empty(row.tax_regime)) push(build("tax_regime", "Regime tributário", "empresa", "bloqueia_homologacao", LINK_EMPRESA));
  if (empty(row.crt)) push(build("crt", "CRT (código de regime tributário)", "empresa", "bloqueia_homologacao", LINK_EMPRESA));
  // Empresa (recomendados)
  if (empty(row.trade_name)) push(build("trade_name", "Nome fantasia", "empresa", "recomendado", LINK_EMPRESA));
  if (empty(row.primary_cnae)) push(build("primary_cnae", "CNAE principal", "empresa", "recomendado", LINK_EMPRESA));
  if (empty(row.phone)) push(build("phone", "Telefone", "empresa", "recomendado", LINK_EMPRESA));

  // Endereço (bloqueantes)
  if (empty(row.postal_code)) push(build("postal_code", "CEP", "endereco", "bloqueia_homologacao", LINK_EMPRESA));
  if (empty(row.street)) push(build("street", "Logradouro", "endereco", "bloqueia_homologacao", LINK_EMPRESA));
  if (empty(row.number)) push(build("number", "Número", "endereco", "bloqueia_homologacao", LINK_EMPRESA));
  if (empty(row.neighborhood)) push(build("neighborhood", "Bairro", "endereco", "bloqueia_homologacao", LINK_EMPRESA));
  if (empty(row.city)) push(build("city", "Município", "endereco", "bloqueia_homologacao", LINK_EMPRESA));
  if (empty(row.state)) push(build("state", "UF", "endereco", "bloqueia_homologacao", LINK_EMPRESA));
  if (empty(row.municipality_ibge_code)) push(build("municipality_ibge_code", "Código IBGE do município", "endereco", "bloqueia_homologacao", LINK_EMPRESA));

  // NF-e condicional
  if (row.nfe_enabled === true) {
    const nfeCfg = jsonObj(row.nfe_configuration);
    // IE: H4-A3 — o schema atual não expõe indicador canônico de
    // contribuinte/isento (nenhuma coluna booleana em `fiscal_company_settings`),
    // então NÃO tratamos IE como bloqueante universal. Marcamos como
    // "recomendado" com orientação para confirmar contribuinte/isento com
    // a contabilidade/SEFAZ; a decisão real vive nos perfis fiscais.
    if (empty(row.state_registration) && !isExemptRegistration(row.state_registration)) {
      push(build(
        "state_registration",
        "Inscrição estadual — confirmar contribuinte/isento com a contabilidade/SEFAZ",
        "nfe",
        "recomendado",
        LINK_EMPRESA,
      ));
    }
    if (empty(row.nfe_series) && empty(nfeCfg.series)) push(build("nfe_series", "Série NF-e", "nfe", "bloqueia_homologacao", LINK_NFE));
    // CFOP de produto é regra dos perfis fiscais — aqui é apenas recomendado
    // e não bloqueia homologação da empresa.
    if (empty(nfeCfg.suggested_cfop_in_state)) push(build("nfe_cfop_in", "CFOP interno sugerido (referência)", "nfe", "recomendado", LINK_NFE));
    if (empty(nfeCfg.suggested_cfop_interstate)) push(build("nfe_cfop_out", "CFOP interestadual sugerido (referência)", "nfe", "recomendado", LINK_NFE));
  } else {
    notApplicable.push("nfe");
  }

  // NFS-e condicional
  if (row.nfse_enabled === true) {
    const nfseCfg = jsonObj(row.nfse_configuration);
    // IM é obrigatória para NFS-e apenas quando não isenta. Renderizada na aba empresa.
    if (empty(row.municipal_registration) && !isExemptRegistration(row.municipal_registration)) {
      push(build("municipal_registration", "Inscrição municipal (ou marcar como ISENTO)", "nfse", "bloqueia_homologacao", LINK_EMPRESA));
    }
    if (empty(nfseCfg.mode)) push(build("nfse_mode", "Modo NFS-e (nacional/municipal)", "nfse", "bloqueia_homologacao", LINK_NFSE));
    // Item LC 116 e alíquota ISS dependem de perfil/atividade — recomendados aqui.
    if (empty(nfseCfg.lc116_item)) push(build("lc116_item", "Item LC 116", "nfse", "recomendado", LINK_NFSE));
    if (typeof nfseCfg.iss_rate !== "number") push(build("iss_rate", "Alíquota ISS (a definir com a contabilidade)", "nfse", "recomendado", LINK_NFSE));
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
