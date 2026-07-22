/**
 * Fase Fiscal 3.17 — Contrato TypeScript estreito da RPC
 * `rpc_fiscal_homologation_readiness`.
 *
 * NOTA: a regeneração oficial do `src/integrations/supabase/types.ts`
 * pelo pipeline canônico continua PENDENTE após a aplicação da migration
 * `20260725000000_fiscal_fase3_17_homologation_readiness.sql`. Enquanto
 * isso, este módulo mantém tipos locais mínimos, sem `any` e sem cast
 * global.
 */

export const READINESS_ITEM_STATUS = [
  "READY",
  "INCOMPLETE",
  "BLOCKED",
  "UNAVAILABLE",
  "NOT_CONFIGURED",
] as const;
export type ReadinessItemStatus = (typeof READINESS_ITEM_STATUS)[number];

export const READINESS_OVERALL_STATUS = [
  "READY",
  "INCOMPLETE",
  "BLOCKED",
  "UNAVAILABLE",
] as const;
export type ReadinessOverallStatus = (typeof READINESS_OVERALL_STATUS)[number];

export interface ReadinessChecklistItem {
  key: string;
  label: string;
  status: ReadinessItemStatus;
  count?: number;
}

export interface ReadinessCounts {
  drafts_total: number;
  drafts_ready: number;
  drafts_incomplete: number;
  drafts_blocked: number;
  products_ready: number;
  services_ready: number;
  customers_ready: number;
}

export interface HomologationReadinessResult {
  status: ReadinessOverallStatus;
  generated_at: string;
  environment_label: string;
  production_enabled: boolean;
  checklist: ReadinessChecklistItem[];
  counts: ReadinessCounts;
}

export const STATUS_LABEL_PTBR: Record<ReadinessItemStatus, string> = {
  READY: "Pronto",
  INCOMPLETE: "Incompleto",
  BLOCKED: "Bloqueado",
  UNAVAILABLE: "Indisponível",
  NOT_CONFIGURED: "Não configurado",
};

export const OVERALL_STATUS_LABEL_PTBR: Record<ReadinessOverallStatus, string> = {
  READY: "Pronto para homologação",
  INCOMPLETE: "Incompleto",
  BLOCKED: "Bloqueado",
  UNAVAILABLE: "Indisponível",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toItemStatus(value: unknown): ReadinessItemStatus {
  if (typeof value === "string" && (READINESS_ITEM_STATUS as readonly string[]).includes(value)) {
    return value as ReadinessItemStatus;
  }
  return "UNAVAILABLE";
}

function toOverallStatus(value: unknown): ReadinessOverallStatus {
  if (typeof value === "string" && (READINESS_OVERALL_STATUS as readonly string[]).includes(value)) {
    return value as ReadinessOverallStatus;
  }
  return "UNAVAILABLE";
}

function toChecklist(raw: unknown): ReadinessChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ReadinessChecklistItem[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const key = typeof entry.key === "string" ? entry.key : null;
    const label = typeof entry.label === "string" ? entry.label : null;
    if (!key || !label) continue;
    const item: ReadinessChecklistItem = {
      key,
      label,
      status: toItemStatus(entry.status),
    };
    if (typeof entry.count === "number" && Number.isFinite(entry.count)) {
      item.count = entry.count;
    }
    out.push(item);
  }
  return out;
}

function toCounts(raw: unknown): ReadinessCounts {
  const rec = isRecord(raw) ? raw : {};
  const n = (k: string): number => {
    const v = rec[k];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  return {
    drafts_total: n("drafts_total"),
    drafts_ready: n("drafts_ready"),
    drafts_incomplete: n("drafts_incomplete"),
    drafts_blocked: n("drafts_blocked"),
    products_ready: n("products_ready"),
    services_ready: n("services_ready"),
    customers_ready: n("customers_ready"),
  };
}

/** Normaliza o payload JSONB retornado pela RPC em uma forma estreita. */
export function parseReadinessResult(raw: unknown): HomologationReadinessResult {
  const rec = isRecord(raw) ? raw : {};
  return {
    status: toOverallStatus(rec.status),
    generated_at: typeof rec.generated_at === "string" ? rec.generated_at : "",
    environment_label: typeof rec.environment_label === "string" ? rec.environment_label : "Indisponível",
    production_enabled: rec.production_enabled === true,
    checklist: toChecklist(rec.checklist),
    counts: toCounts(rec.counts),
  };
}
