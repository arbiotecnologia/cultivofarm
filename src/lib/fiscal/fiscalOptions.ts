/**
 * Fase Fiscal — Dicionário de opções (rótulos oficiais em pt-BR).
 *
 * Somente UI. Cada opção tem `value` (o que é persistido), `label`
 * (exibido) e `hint` opcional. Não altera schemas Zod nem regras de
 * validação já existentes; para valores legados fora da lista, a UI
 * mostra uma opção "manter valor atual (<x>)" no topo.
 */

export interface FiscalOption {
  value: string;
  label: string;
  hint?: string;
}

export const CRT_OPTIONS: FiscalOption[] = [
  { value: "1", label: "1 — Simples Nacional" },
  { value: "2", label: "2 — Simples Nacional (excesso de sublimite)" },
  { value: "3", label: "3 — Regime Normal (Lucro Presumido/Real)" },
  { value: "4", label: "4 — MEI" },
];

export const TAX_REGIME_OPTIONS: FiscalOption[] = [
  { value: "SIMPLES_NACIONAL", label: "Simples Nacional" },
  { value: "LUCRO_PRESUMIDO", label: "Lucro Presumido" },
  { value: "LUCRO_REAL", label: "Lucro Real" },
  { value: "MEI", label: "MEI" },
  { value: "IMUNE_ISENTO", label: "Imune / Isento" },
];

export const UF_OPTIONS: FiscalOption[] = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
].map((u) => ({ value: u, label: u }));

export const COUNTRY_OPTIONS: FiscalOption[] = [
  { value: "1058", label: "1058 — Brasil" },
];

export const PRESENCE_OPTIONS: FiscalOption[] = [
  { value: "0", label: "0 — Não se aplica" },
  { value: "1", label: "1 — Presencial" },
  { value: "2", label: "2 — Internet" },
  { value: "3", label: "3 — Teleatendimento" },
  { value: "4", label: "4 — NFC-e entrega domicílio" },
  { value: "5", label: "5 — Presencial fora do estabelecimento" },
  { value: "9", label: "9 — Não presencial, outros" },
];

export const FREIGHT_MODALITY_OPTIONS: FiscalOption[] = [
  { value: "0", label: "0 — Por conta do emitente" },
  { value: "1", label: "1 — Por conta do destinatário" },
  { value: "2", label: "2 — Por conta de terceiros" },
  { value: "3", label: "3 — Transporte próprio (emitente)" },
  { value: "4", label: "4 — Transporte próprio (destinatário)" },
  { value: "9", label: "9 — Sem transporte" },
];

export const RPS_TYPE_OPTIONS: FiscalOption[] = [
  { value: "1", label: "1 — RPS" },
  { value: "2", label: "2 — Nota Fiscal Conjugada (Mista)" },
  { value: "3", label: "3 — Cupom" },
];

export const NFSE_SPECIAL_REGIME_OPTIONS: FiscalOption[] = [
  { value: "1", label: "1 — Microempresa Municipal" },
  { value: "2", label: "2 — Estimativa" },
  { value: "3", label: "3 — Sociedade de Profissionais" },
  { value: "4", label: "4 — Cooperativa" },
  { value: "5", label: "5 — MEI" },
  { value: "6", label: "6 — ME/EPP do Simples Nacional" },
];

export const ORIGIN_CODE_OPTIONS: FiscalOption[] = [
  { value: "0", label: "0 — Nacional (exceto 3, 4, 5 e 8)" },
  { value: "1", label: "1 — Estrangeira — importação direta" },
  { value: "2", label: "2 — Estrangeira — adquirida no mercado interno" },
  { value: "3", label: "3 — Nacional > 40% conteúdo importado" },
  { value: "4", label: "4 — Nacional (processos produtivos básicos)" },
  { value: "5", label: "5 — Nacional ≤ 40% conteúdo importado" },
  { value: "6", label: "6 — Estrangeira — importação direta, sem similar nacional" },
  { value: "7", label: "7 — Estrangeira — mercado interno, sem similar nacional" },
  { value: "8", label: "8 — Nacional > 70% conteúdo importado" },
];

export const ICMS_CST_OPTIONS: FiscalOption[] = [
  { value: "00", label: "00 — Tributada integralmente" },
  { value: "10", label: "10 — Tributada com cobrança por ST" },
  { value: "20", label: "20 — Com redução de base de cálculo" },
  { value: "30", label: "30 — Isenta/não tributada com cobrança por ST" },
  { value: "40", label: "40 — Isenta" },
  { value: "41", label: "41 — Não tributada" },
  { value: "50", label: "50 — Suspensão" },
  { value: "51", label: "51 — Diferimento" },
  { value: "60", label: "60 — ICMS cobrado anteriormente por ST" },
  { value: "70", label: "70 — Redução de base com cobrança por ST" },
  { value: "90", label: "90 — Outras" },
];

export const ICMS_CSOSN_OPTIONS: FiscalOption[] = [
  { value: "101", label: "101 — Tributada Simples Nacional (crédito)" },
  { value: "102", label: "102 — Tributada Simples Nacional (sem crédito)" },
  { value: "103", label: "103 — Isenção do ICMS no Simples Nacional" },
  { value: "201", label: "201 — Tributada com ST (crédito)" },
  { value: "202", label: "202 — Tributada com ST (sem crédito)" },
  { value: "203", label: "203 — Isenção com ST" },
  { value: "300", label: "300 — Imune" },
  { value: "400", label: "400 — Não tributada Simples Nacional" },
  { value: "500", label: "500 — ICMS cobrado anteriormente por ST/antecipação" },
  { value: "900", label: "900 — Outras (Simples Nacional)" },
];

// IPI CST — catálogo resumido (Tabela I do RIPI). NÃO é lista oficial completa;
// permita valor livre quando a operação exigir código específico.
export const IPI_CST_OPTIONS: FiscalOption[] = [
  { value: "00", label: "00 — Entrada com recuperação de crédito" },
  { value: "01", label: "01 — Entrada tributada alíquota zero" },
  { value: "02", label: "02 — Entrada isenta" },
  { value: "03", label: "03 — Entrada não-tributada" },
  { value: "04", label: "04 — Entrada imune" },
  { value: "05", label: "05 — Entrada com suspensão" },
  { value: "49", label: "49 — Outras entradas" },
  { value: "50", label: "50 — Saída tributada" },
  { value: "51", label: "51 — Saída tributada alíquota zero" },
  { value: "52", label: "52 — Saída isenta" },
  { value: "53", label: "53 — Saída não-tributada" },
  { value: "54", label: "54 — Saída imune" },
  { value: "55", label: "55 — Saída com suspensão" },
  { value: "99", label: "99 — Outras saídas" },
];

// PIS/COFINS CST — Tabelas 4.3.3/4.3.4. Catálogo resumido; UI aceita valor livre.
export const PIS_COFINS_CST_OPTIONS: FiscalOption[] = [
  { value: "01", label: "01 — Tributável alíquota básica" },
  { value: "02", label: "02 — Tributável alíquota diferenciada" },
  { value: "03", label: "03 — Tributável por unidade de medida (qtd. vendida)" },
  { value: "04", label: "04 — Tributável monofásica — alíquota zero" },
  { value: "05", label: "05 — Tributável por substituição tributária" },
  { value: "06", label: "06 — Tributável a alíquota zero" },
  { value: "07", label: "07 — Isenta da contribuição" },
  { value: "08", label: "08 — Sem incidência da contribuição" },
  { value: "09", label: "09 — Com suspensão da contribuição" },
  { value: "49", label: "49 — Outras operações de saída" },
  { value: "50", label: "50 — Entrada com direito a crédito — receita tributada" },
  { value: "51", label: "51 — Entrada com direito a crédito — receita não tributada" },
  { value: "52", label: "52 — Entrada com direito a crédito — receita exportação" },
  { value: "53", label: "53 — Entrada com crédito — receitas tributadas e não tributadas" },
  { value: "54", label: "54 — Entrada com crédito — tributadas e exportação" },
  { value: "55", label: "55 — Entrada com crédito — não tributadas e exportação" },
  { value: "56", label: "56 — Entrada com crédito — tributadas, não tributadas e exportação" },
  { value: "60", label: "60 — Crédito presumido — receita tributada" },
  { value: "61", label: "61 — Crédito presumido — receita não tributada" },
  { value: "62", label: "62 — Crédito presumido — receita exportação" },
  { value: "63", label: "63 — Crédito presumido — tributadas e não tributadas" },
  { value: "64", label: "64 — Crédito presumido — tributadas e exportação" },
  { value: "65", label: "65 — Crédito presumido — não tributadas e exportação" },
  { value: "66", label: "66 — Crédito presumido — tributadas, não tributadas e exportação" },
  { value: "67", label: "67 — Crédito presumido — outras operações" },
  { value: "70", label: "70 — Entrada com carta de correção crédito" },
  { value: "71", label: "71 — Entrada com crédito — adquirente de crédito presumido" },
  { value: "72", label: "72 — Entrada de bens do ativo imobilizado" },
  { value: "73", label: "73 — Entrada de bens para uso e consumo" },
  { value: "74", label: "74 — Entrada de energia elétrica" },
  { value: "75", label: "75 — Entrada de contraprestação de arrendamento mercantil" },
  { value: "98", label: "98 — Outras operações de entrada" },
  { value: "99", label: "99 — Outras operações" },
];

// RTC 2026 — IBS/CBS. Não é catálogo oficial completo; depende da versão
// vigente da NT NF-e 2025.002 e NFS-e NT 007/2026 configurada pelo contador.
export const RTC_CST_IBS_CBS_OPTIONS: FiscalOption[] = [
  { value: "000", label: "000 — Tributação integral (referência)" },
  { value: "010", label: "010 — Redução de alíquota (referência)" },
  { value: "020", label: "020 — Diferimento (referência)" },
  { value: "030", label: "030 — Alíquota zero (referência)" },
  { value: "040", label: "040 — Isenção (referência)" },
  { value: "050", label: "050 — Imunidade (referência)" },
  { value: "060", label: "060 — Suspensão (referência)" },
  { value: "090", label: "090 — Outras (referência)" },
];

export const RTC_FIN_NFSE_OPTIONS: FiscalOption[] = [
  { value: "1", label: "1 — Normal" },
  { value: "2", label: "2 — Complementar" },
  { value: "4", label: "4 — Substituição" },
];

export const RTC_C_IND_OP_OPTIONS: FiscalOption[] = [
  { value: "1", label: "1 — Operação com IBS/CBS" },
  { value: "2", label: "2 — Operação sem IBS/CBS (transição)" },
];



export const STATE_REG_STATUS_OPTIONS: FiscalOption[] = [
  { value: "1", label: "1 — Contribuinte de ICMS" },
  { value: "2", label: "2 — Contribuinte isento de IE" },
  { value: "9", label: "9 — Não contribuinte" },
];

export const REQUIREMENT_STATUS_OPTIONS: FiscalOption[] = [
  { value: "COMPLETO", label: "Completo" },
  { value: "PENDENTE", label: "Pendente" },
  { value: "BLOQUEADO", label: "Bloqueado" },
];

/**
 * Lista canônica de status do perfil fiscal de produtos, alinhada ao
 * CHECK de `public.product_fiscal_profiles.profile_status` na migration
 * 20260721000000. Não incluir valores observados na página.
 */
export const PRODUCT_FISCAL_PROFILE_STATUSES = [
  "DRAFT",
  "PENDING_ACCOUNTING",
  "VALIDATED",
  "BLOCKED",
  "NOT_FISCALLY_SOLD",
] as const;
export type ProductFiscalProfileStatus =
  (typeof PRODUCT_FISCAL_PROFILE_STATUSES)[number];

export function isProductFiscalProfileStatus(
  v: string | null | undefined,
): v is ProductFiscalProfileStatus {
  return (
    !!v &&
    (PRODUCT_FISCAL_PROFILE_STATUSES as readonly string[]).includes(v)
  );
}

// ————————————————————— Rótulos pt-BR canônicos —————————————————————
/**
 * Alinhados aos CHECKs reais (migration 20260721000000):
 *  - product_fiscal_profiles.profile_status:
 *      DRAFT | PENDING_ACCOUNTING | VALIDATED | BLOCKED | NOT_FISCALLY_SOLD
 *  - service_fiscal_profiles.profile_status:
 *      DRAFT | PENDING_ACCOUNTING | VALIDATED | BLOCKED | NOT_FISCALLY_BILLED
 *  - customer_fiscal_profiles.profile_status:
 *      INCOMPLETE | PENDING_REVIEW | VALIDATED | BLOCKED
 *
 * O `value` é o código técnico persistido; `label` é a exibição pt-BR.
 * Nenhum helper altera o valor salvo — apenas resolve exibição.
 */
export const PRODUCT_FISCAL_PROFILE_STATUS_OPTIONS: FiscalOption[] = [
  { value: "DRAFT", label: "Rascunho" },
  { value: "PENDING_ACCOUNTING", label: "Aguardando contabilidade" },
  { value: "VALIDATED", label: "Validado" },
  { value: "BLOCKED", label: "Bloqueado" },
  { value: "NOT_FISCALLY_SOLD", label: "Não vendido fiscalmente" },
];

export const SERVICE_FISCAL_PROFILE_STATUSES = [
  "DRAFT",
  "PENDING_ACCOUNTING",
  "VALIDATED",
  "BLOCKED",
] as const;
export type ServiceFiscalProfileStatus =
  (typeof SERVICE_FISCAL_PROFILE_STATUSES)[number];
export const SERVICE_FISCAL_PROFILE_STATUS_OPTIONS: FiscalOption[] = [
  { value: "DRAFT", label: "Rascunho" },
  { value: "PENDING_ACCOUNTING", label: "Aguardando contabilidade" },
  { value: "VALIDATED", label: "Validado" },
  { value: "BLOCKED", label: "Bloqueado" },
];

export const CUSTOMER_FISCAL_PROFILE_STATUSES = [
  "INCOMPLETE",
  "PENDING_REVIEW",
  "VALIDATED",
  "BLOCKED",
] as const;
export type CustomerFiscalProfileStatus =
  (typeof CUSTOMER_FISCAL_PROFILE_STATUSES)[number];
export const CUSTOMER_FISCAL_PROFILE_STATUS_OPTIONS: FiscalOption[] = [
  { value: "INCOMPLETE", label: "Incompleto" },
  { value: "PENDING_REVIEW", label: "Aguardando revisão" },
  { value: "VALIDATED", label: "Validado" },
  { value: "BLOCKED", label: "Bloqueado" },
];

/** Rótulos pt-BR do indicador de contribuinte (NF-e indIEDest). */
export const TAXPAYER_INDICATOR_OPTIONS: FiscalOption[] = [
  { value: "1", label: "Contribuinte de ICMS" },
  { value: "2", label: "Contribuinte isento de IE" },
  { value: "9", label: "Não contribuinte" },
];

export type FiscalStatusKind = "product" | "service" | "customer";

const STATUS_MAPS: Record<FiscalStatusKind, Map<string, string>> = {
  product: new Map(
    PRODUCT_FISCAL_PROFILE_STATUS_OPTIONS.map((o) => [o.value, o.label]),
  ),
  service: new Map(
    SERVICE_FISCAL_PROFILE_STATUS_OPTIONS.map((o) => [o.value, o.label]),
  ),
  customer: new Map(
    CUSTOMER_FISCAL_PROFILE_STATUS_OPTIONS.map((o) => [o.value, o.label]),
  ),
};

/**
 * Retorna o rótulo pt-BR do status. Nunca altera o valor persistido.
 * Se o código não pertencer à lista canônica, devolve
 * "Status não reconhecido" — o código técnico deve ser mostrado
 * apenas em `title`/tooltip pela UI.
 */
export function getFiscalStatusLabel(
  kind: FiscalStatusKind,
  value: string | null | undefined,
): string {
  const v = (value ?? "").trim();
  if (!v) return "—";
  return STATUS_MAPS[kind].get(v) ?? "Status não reconhecido";
}

const TAXPAYER_MAP = new Map(
  TAXPAYER_INDICATOR_OPTIONS.map((o) => [o.value, o.label]),
);
export function getTaxpayerIndicatorLabel(
  value: string | null | undefined,
): string {
  const v = (value ?? "").trim();
  if (!v) return "—";
  return TAXPAYER_MAP.get(v) ?? "Indicador não reconhecido";
}

/**
 * Se o valor persistido não pertencer à lista canônica, retorna a lista
 * prefixada por uma opção "— manter valor atual (<x>) —" para não
 * perder o dado legado. Nenhuma coerção; o usuário migra ao editar.
 */
export function withLegacyOption(
  options: FiscalOption[],
  currentValue: string | null | undefined,
): FiscalOption[] {
  const v = (currentValue ?? "").trim();
  if (!v) return options;
  if (options.some((o) => o.value === v)) return options;
  return [{ value: v, label: `— manter valor atual (${v}) —` }, ...options];
}
