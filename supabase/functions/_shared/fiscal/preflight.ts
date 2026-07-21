/**
 * Fase Fiscal 3.8 — Barreira server-side de pré-homologação (fail-closed).
 *
 * ESCOPO ESTRITO
 * - Módulo puro, sem I/O, sem `fetch`, sem `Deno.env`, sem `import { createClient }`.
 * - Server-only por localização (`supabase/functions/_shared/fiscal/`). Não importe
 *   este arquivo no frontend — o teste estático da Fase 3.8 falha se algum
 *   arquivo em `src/**` referenciar este módulo.
 * - Não conhece provedor, certificado, token, webhook, URL externa, banco de dados
 *   ou RPC. Somente avalia gates a partir de evidências passadas pelo chamador.
 *
 * CONTRATO NESTA FASE
 * - Apenas a operação `PREFLIGHT` existe. Qualquer outra é rejeitada.
 * - O resultado máximo possível é `PRECHECK_ONLY` com `canTransmit=false`.
 * - Fail-closed: ausência, `undefined`, `null`, string desconhecida ou erro
 *   é sempre tratado como bloqueado / não verificado.
 */

/* ────────────────────────────────────────────────────────────────────────── */
/*  Contratos                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

export const FISCAL_OPERATIONS = ["PREFLIGHT"] as const;
export type FiscalOperation = (typeof FISCAL_OPERATIONS)[number];

export const FISCAL_RUNTIME_MODES = ["DISABLED", "HOMOLOGATION"] as const;
export type FiscalRuntimeMode = (typeof FISCAL_RUNTIME_MODES)[number];

export const FISCAL_PROVIDERS = ["NONE"] as const;
export type FiscalProvider = (typeof FISCAL_PROVIDERS)[number];

export const GATE_CODES = [
  "EMISSION_FLAG_DISABLED",
  "RUNTIME_MODE_INVALID",
  "PROVIDER_NOT_NONE",
  "PRODUCTION_REQUESTED",
  "RLS_RUNTIME_NOT_CERTIFIED",
  "TYPES_NOT_CERTIFIED",
  "BACKFILL_NOT_CERTIFIED",
  "SQL_MASK_NOT_CERTIFIED",
  "COMPANY_NOT_READY",
  "PRODUCTS_NOT_READY",
  "SERVICES_NOT_READY",
  "CUSTOMERS_NOT_READY",
  "RECONCILIATION_NOT_READY",
  "OPERATION_NOT_SUPPORTED",
  "UNKNOWN_INPUT",
] as const;
export type GateCode = (typeof GATE_CODES)[number];

export const PRECHECK_STATUSES = ["PRECHECK_ONLY", "BLOCKED"] as const;
export type PrecheckStatus = (typeof PRECHECK_STATUSES)[number];

/** Auditoria futura — contrato apenas. Nunca é persistido nesta fase. */
export const AUDIT_EVENT_TYPES = ["PRECHECK_EXECUTED"] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

/**
 * Entrada explícita. O chamador é obrigado a passar todas as evidências como
 * booleans reais. Qualquer valor não-`true` é interpretado como não pronto.
 */
export interface PreflightInput {
  operation: FiscalOperation | string; // aceita string p/ testar OPERATION_NOT_SUPPORTED
  emissionEnabled: boolean | null | undefined;
  runtimeMode: FiscalRuntimeMode | string | null | undefined;
  provider: FiscalProvider | string | null | undefined;
  requestedProduction: boolean | null | undefined;
  evidences: {
    rlsRuntimeCertified?: boolean | null;
    typesCertified?: boolean | null;
    backfillCertified?: boolean | null;
    sqlMaskCertified?: boolean | null;
    companyReady?: boolean | null;
    productsReady?: boolean | null;
    servicesReady?: boolean | null;
    customersReady?: boolean | null;
    reconciliationReady?: boolean | null;
  };
  /** Metadado opcional e sem PII. Sempre passa por máscara antes de sair. */
  metadata?: Record<string, unknown> | null;
  /** Contrato futuro — apenas ecoado (mascarado). Não é gerado aqui. */
  idempotencyKey?: string | null;
}

export interface Gate {
  code: GateCode;
  ok: boolean;
  message: string;
}

export interface PreflightResult {
  status: PrecheckStatus;
  canTransmit: false; // literal `false` — invariante desta fase
  operation: "PREFLIGHT" | "UNSUPPORTED";
  runtimeMode: FiscalRuntimeMode | "UNKNOWN";
  provider: FiscalProvider | "UNKNOWN";
  gates: Gate[];
  audit: {
    event: AuditEventType;
    persisted: false; // invariante — nunca é gravado nesta fase
  };
  metadata: Record<string, unknown>;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Defaults canônicos                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

export const FISCAL_DEFAULTS = Object.freeze({
  runtimeMode: "DISABLED" as FiscalRuntimeMode,
  provider: "NONE" as FiscalProvider,
  emissionEnabled: false as const,
});

/** Nomes documentais de env vars futuras — nunca lidos, nunca com valor. */
export const FISCAL_ENV_VAR_NAMES = Object.freeze({
  FISCAL_RUNTIME_MODE: "FISCAL_RUNTIME_MODE",
  FISCAL_PROVIDER: "FISCAL_PROVIDER",
  FISCAL_EMISSION_ENABLED: "FISCAL_EMISSION_ENABLED",
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  Máscara recursiva                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

const SENSITIVE_KEY_RX =
  /(cnpj|cpf|access_key|chave|xml|token|secret|password|senha|certificate|certificado|pfx|p12|authorization|jwt)/i;

/**
 * Máscara recursiva. Nunca lança. Substitui valores sensíveis por
 * `"[REDACTED]"` e limita strings longas. Ideal para metadata de retorno.
 */
export function maskRecursive(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[REDACTED:DEPTH]";
  if (value === null || value === undefined) return null;
  const t = typeof value;
  if (t === "string") {
    const s = value as string;
    if (s.length > 256) return "[REDACTED:LEN]";
    return s;
  }
  if (t === "number" || t === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 32).map((v) => maskRecursive(v, depth + 1));
  }
  if (t === "object") {
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (n++ >= 64) break;
      if (SENSITIVE_KEY_RX.test(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = maskRecursive(v, depth + 1);
    }
    return out;
  }
  return "[REDACTED:TYPE]";
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Avaliador puro                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

const isTrue = (v: unknown): boolean => v === true;

function gate(code: GateCode, ok: boolean, message: string): Gate {
  return { code, ok, message };
}

/**
 * Avalia todos os gates a partir da entrada. Ordem determinística.
 * NUNCA retorna `canTransmit=true`, mesmo se todas as evidências forem `true`
 * — esta fase produz somente `PRECHECK_ONLY`.
 */
export function evaluatePreflight(input: PreflightInput): PreflightResult {
  const op = input.operation;
  const operationSupported = op === "PREFLIGHT";
  const runtimeMode: FiscalRuntimeMode | "UNKNOWN" =
    input.runtimeMode === "HOMOLOGATION" || input.runtimeMode === "DISABLED"
      ? input.runtimeMode
      : "UNKNOWN";
  const provider: FiscalProvider | "UNKNOWN" =
    input.provider === "NONE" ? "NONE" : "UNKNOWN";

  const ev = input.evidences ?? {};

  const gates: Gate[] = [
    gate(
      "OPERATION_NOT_SUPPORTED",
      operationSupported,
      operationSupported
        ? "Operação PREFLIGHT reconhecida."
        : "Somente PREFLIGHT é suportada nesta fase.",
    ),
    gate(
      "EMISSION_FLAG_DISABLED",
      // Este gate é OK apenas se a flag foi explicitamente `true`;
      // caso contrário fica bloqueado (fail-closed).
      isTrue(input.emissionEnabled),
      isTrue(input.emissionEnabled)
        ? "fiscalEmissionEnabled=true recebido."
        : "fiscalEmissionEnabled precisa ser explicitamente true.",
    ),
    gate(
      "RUNTIME_MODE_INVALID",
      runtimeMode === "HOMOLOGATION",
      runtimeMode === "HOMOLOGATION"
        ? "runtimeMode=HOMOLOGATION."
        : "runtimeMode precisa ser HOMOLOGATION.",
    ),
    gate(
      "PROVIDER_NOT_NONE",
      provider === "NONE",
      provider === "NONE"
        ? "provider=NONE nesta fase."
        : "provider precisa ser NONE nesta fase.",
    ),
    gate(
      "PRODUCTION_REQUESTED",
      input.requestedProduction !== true,
      input.requestedProduction === true
        ? "Produção solicitada — bloqueado."
        : "Produção não solicitada.",
    ),
    gate("RLS_RUNTIME_NOT_CERTIFIED", isTrue(ev.rlsRuntimeCertified),
      isTrue(ev.rlsRuntimeCertified) ? "RLS runtime certificado." : "RLS runtime não certificado."),
    gate("TYPES_NOT_CERTIFIED", isTrue(ev.typesCertified),
      isTrue(ev.typesCertified) ? "Types oficiais certificados." : "Types oficiais não certificados."),
    gate("BACKFILL_NOT_CERTIFIED", isTrue(ev.backfillCertified),
      isTrue(ev.backfillCertified) ? "Backfill certificado." : "Backfill não certificado."),
    gate("SQL_MASK_NOT_CERTIFIED", isTrue(ev.sqlMaskCertified),
      isTrue(ev.sqlMaskCertified) ? "Máscara SQL certificada." : "Máscara SQL não certificada."),
    gate("COMPANY_NOT_READY", isTrue(ev.companyReady),
      isTrue(ev.companyReady) ? "Empresa pronta." : "Empresa não pronta."),
    gate("PRODUCTS_NOT_READY", isTrue(ev.productsReady),
      isTrue(ev.productsReady) ? "Produtos prontos." : "Produtos não prontos."),
    gate("SERVICES_NOT_READY", isTrue(ev.servicesReady),
      isTrue(ev.servicesReady) ? "Serviços prontos." : "Serviços não prontos."),
    gate("CUSTOMERS_NOT_READY", isTrue(ev.customersReady),
      isTrue(ev.customersReady) ? "Clientes prontos." : "Clientes não prontos."),
    gate("RECONCILIATION_NOT_READY", isTrue(ev.reconciliationReady),
      isTrue(ev.reconciliationReady) ? "Reconciliação pronta." : "Reconciliação não pronta."),
  ];

  const allOk = gates.every((g) => g.ok);
  const status: PrecheckStatus = allOk && operationSupported ? "PRECHECK_ONLY" : "BLOCKED";

  return {
    status,
    canTransmit: false,
    operation: operationSupported ? "PREFLIGHT" : "UNSUPPORTED",
    runtimeMode,
    provider,
    gates,
    audit: { event: "PRECHECK_EXECUTED", persisted: false },
    metadata: (maskRecursive(input.metadata ?? {}) as Record<string, unknown>) ?? {},
  };
}

/** Papéis autorizados a executar a pré-checagem, caso um entrypoint venha a existir. */
export const PREFLIGHT_ALLOWED_ROLES = Object.freeze([
  "administrador",
  "gestor",
  "financeiro",
] as const);
export type PreflightAllowedRole = (typeof PREFLIGHT_ALLOWED_ROLES)[number];

export function isRoleAllowedForPreflight(role: string | null | undefined): boolean {
  if (!role) return false;
  return (PREFLIGHT_ALLOWED_ROLES as readonly string[]).includes(role);
}
