/**
 * Fase Fiscal 3.7 — Central de Prontidão para Homologação (SOMENTE LEITURA).
 *
 * - Classificadores puros a partir das 5 views fiscais canônicas.
 * - Nenhum score/coluna/status inventado. Nenhuma mutação, nenhum upsert,
 *   nenhum DELETE, nenhum RPC, nenhum functions.invoke.
 * - Estados de bloco: `pronto`, `atencao`, `bloqueado`, `nao_verificado`.
 * - Gates externos são declarados como `PENDENTE` até evidência real —
 *   nunca aprovados por teste estático.
 */
import type { Database } from "@/integrations/supabase/types";
import {
  FISCAL_ENVIRONMENT,
  FISCAL_CONFIGURATION_STATUS,
} from "@/lib/fiscal/labels";

/**
 * Subconjunto explícito do Row da view usado pela Central de Prontidão.
 * Colunas novas adicionadas pela Fase 3.15 (nfe_provider, nfse_provider,
 * configuration_version, last_validation_*, *_field_count) NÃO fazem
 * parte deste snapshot — o classificador só usa os 10 campos abaixo, e
 * mantê-los explícitos evita acoplamento a colunas irrelevantes.
 */
export type CompanyRow = any;
export type ProductRow = any;
export type ServiceRow = any;
export type CustomerRow = any;
export type ReconRow = any;

export const BLOCK_STATUS_VALUES = [
  "pronto",
  "atencao",
  "bloqueado",
  "nao_verificado",
] as const;
export type BlockStatus = (typeof BLOCK_STATUS_VALUES)[number];

export const BLOCK_STATUS_LABEL: Record<BlockStatus, string> = {
  pronto: "Pronto",
  atencao: "Atenção",
  bloqueado: "Bloqueado",
  nao_verificado: "Não verificado",
};

/** Ambientes considerados seguros (não produtivos). */
export const SAFE_ENVIRONMENTS = new Set(["homologacao", "staging", "sandbox"]);

/** Modelos documentais canônicos usados pela view de reconciliação. */
export const DOCUMENT_MODELS = ["NFE", "NFSE", "OTHER"] as const;
export type DocumentModel = (typeof DOCUMENT_MODELS)[number];

/** Gates externos que exigem evidência humana antes da homologação. */
export const EXTERNAL_GATE_KEYS = [
  "rls_runtime_staging",
  "backfill_sintetico",
  "mask_sensitive_jsonb_runtime",
  "types_ts_oficial",
  "provedor_configurado",
  "certificado_e_secrets",
  "emissao_em_homologacao",
] as const;
export type ExternalGateKey = (typeof EXTERNAL_GATE_KEYS)[number];

export interface ExternalGate {
  key: ExternalGateKey;
  label: string;
  detail: string;
}

/**
 * Todos os gates externos permanecem PENDENTES por design nesta fase.
 * A UI NÃO oferece caminho para marcá-los como aprovados; qualquer
 * mudança exigirá evidência real fora deste código.
 */
export const EXTERNAL_GATES: readonly ExternalGate[] = [
  {
    key: "rls_runtime_staging",
    label: "RLS em runtime (staging)",
    detail:
      "Certificação com harness runtime em ambiente staging pendente. " +
      "Nenhum teste estático substitui a validação real de policies.",
  },
  {
    key: "backfill_sintetico",
    label: "Backfill sintético",
    detail:
      "Fixtures sintéticas exigidas pela Fase 3.0.2-C ainda não aplicadas " +
      "em ambiente de homologação isolado.",
  },
  {
    key: "mask_sensitive_jsonb_runtime",
    label: "mask_sensitive_jsonb (SQL runtime)",
    detail:
      "Função de mascaramento em runtime deve ser exercitada contra dados " +
      "reais de teste; verificação estática de tipos não é suficiente.",
  },
  {
    key: "types_ts_oficial",
    label: "types.ts oficial homologado",
    detail:
      "A regeneração canônica do types.ts pelo pipeline oficial precisa " +
      "ser assinada pela equipe fiscal antes da homologação.",
  },
  {
    key: "provedor_configurado",
    label: "Provedor de emissão configurado",
    detail:
      "Escolha do provedor, contratos e configuração server-side ainda " +
      "não iniciados. Nada nesta fase seleciona ou integra provedor.",
  },
  {
    key: "certificado_e_secrets",
    label: "Certificado A1/A3 e secrets server-side",
    detail:
      "Custódia de certificado e secrets NUNCA reside no cliente. " +
      "Este item permanece PENDENTE até adoção de cofre server-side.",
  },
  {
    key: "emissao_em_homologacao",
    label: "Emissão em ambiente de homologação",
    detail:
      "fiscalEmissionEnabled permanece `false`. Nenhuma emissão real, " +
      "consulta, cancelamento ou inutilização é executável.",
  },
];

/**
 * Rótulo amigável para status agregados usados pela Central de Prontidão.
 *
 * Delega ao dicionário central `src/lib/fiscal/labels` — que é o único
 * módulo de tradução pt-BR do fiscal. Este módulo NÃO mantém tabela
 * própria: valores desconhecidos chegam ao usuário como
 * "Não mapeado (VALOR)", nunca crus em inglês.
 *
 * Não há import circular: `labels/` não depende de `readinessValidation`.
 */
export function labelForStatus(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return BLOCK_STATUS_LABEL.nao_verificado;
  const s = String(v).trim();
  if (FISCAL_ENVIRONMENT.map.has(s)) return FISCAL_ENVIRONMENT.label(s);
  if (FISCAL_CONFIGURATION_STATUS.map.has(s)) return FISCAL_CONFIGURATION_STATUS.label(s);
  // Rótulos historicamente aceitos pela view mas não presentes no
  // dicionário central de enums (representam estados intermediários
  // apenas de leitura). Mantidos aqui como extensão pontual, sem
  // duplicar traduções já expostas por `labels/`.
  const extras: Record<string, string> = {
    in_review: "Em revisão",
    pending: "Pendente",
    incomplete: "Incompleto",
    ready: "Pronto",
  };
  if (s in extras) return extras[s];
  return `Não mapeado (${s})`;
}

/**
 * Classifica o bloco Empresa a partir da view canônica.
 * - Bloqueado se production_enabled=true (indica intenção produtiva antes da homologação).
 * - Pronto se configuration_status === "ready" E ambiente seguro E accounting_validated=true.
 * - Atenção se configuration_status ∈ {"in_review","pending","incomplete"} ou ambiente inseguro.
 * - Não verificado se todos os campos relevantes forem null.
 */
export function classifyCompany(row: CompanyRow | null | undefined): BlockStatus {
  if (!row) return "nao_verificado";
  const {
    configuration_status,
    fiscal_environment,
    production_enabled,
    accounting_validated,
  } = row;
  if (production_enabled === true) return "bloqueado";
  const allNull =
    configuration_status === null &&
    fiscal_environment === null &&
    production_enabled === null &&
    accounting_validated === null;
  if (allNull) return "nao_verificado";
  const envSafe = fiscal_environment === null
    ? null
    : SAFE_ENVIRONMENTS.has(fiscal_environment);
  if (configuration_status === "ready" && envSafe === true && accounting_validated === true) {
    return "pronto";
  }
  return "atencao";
}

export interface CountAggregate {
  total: number | null;
  ok: number | null;
  pending: number | null;
}

/** Deriva o status de blocos agregados (produtos/serviços/clientes). */
export function classifyAggregate(agg: CountAggregate): BlockStatus {
  if (agg.total === null || agg.ok === null) return "nao_verificado";
  if (agg.total === 0) return "atencao";
  if (agg.ok === agg.total) return "pronto";
  return "atencao";
}

/** Classifica bloco de reconciliação a partir da contagem total de pendências. */
export function classifyReconciliation(total: number | null): BlockStatus {
  if (total === null) return "nao_verificado";
  if (total === 0) return "pronto";
  return "atencao";
}

/** Percentual seguro (0-100). Retorna null quando insuficiente. */
export function percent(ok: number | null, total: number | null): number | null {
  if (ok === null || total === null || total <= 0) return null;
  const raw = (ok / total) * 100;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

export interface Blocker {
  block: "empresa" | "produtos" | "servicos" | "clientes" | "documentos";
  severity: "bloqueado" | "atencao" | "nao_verificado";
  message: string;
}

/** Ordena bloqueios por severidade sem inventar novos itens. */
export function prioritizeBlockers(items: Blocker[]): Blocker[] {
  const rank: Record<Blocker["severity"], number> = {
    bloqueado: 0,
    atencao: 1,
    nao_verificado: 2,
  };
  return [...items].sort((a, b) => rank[a.severity] - rank[b.severity]);
}
