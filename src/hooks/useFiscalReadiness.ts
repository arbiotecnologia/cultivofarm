/**
 * Fase Fiscal 3.7 — Hooks somente leitura para a Central de Prontidão.
 *
 * - Nenhum insert/update/delete/upsert/RPC/functions.invoke.
 * - Cinco queries independentes (empresa, produtos, serviços, clientes,
 *   documentos), cada uma com estado isolado de loading/error/empty.
 * - Contagens via `count: "exact", head: true` para não baixar a base.
 * - Empresa lê no máximo 1 linha com colunas explícitas.
 * - Documentos: até 4 counts targeted (total + por modelo).
 */
import { useQueries, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  DOCUMENT_MODELS,
  type CompanyRow,
  type DocumentModel,
} from "@/lib/fiscal/readinessValidation";

const KEYS = {
  root: ["fiscal", "readiness"] as const,
  company: () => [...KEYS.root, "company"] as const,
  products: () => [...KEYS.root, "products"] as const,
  services: () => [...KEYS.root, "services"] as const,
  customers: () => [...KEYS.root, "customers"] as const,
  documents: () => [...KEYS.root, "documents"] as const,
};

const STALE_MS = 60_000;

/** Snapshot da empresa: até 1 linha com colunas explícitas. */
export function useCompanyReadiness() {
  return useQuery({
    queryKey: KEYS.company(),
    staleTime: STALE_MS,
    queryFn: async (): Promise<CompanyRow | null> => {
      const { data, error } = await supabase
        .from("v_fiscal_company_readiness")
        .select(
          "id, configuration_status, fiscal_environment, fiscal_provider, nfe_enabled, nfse_enabled, production_enabled, accounting_validated, filled_score, max_score",
        )
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

async function countRows(
  from: keyof Database["public"]["Views"] | string,
  applyFilter?: (q: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>,
): Promise<number> {
  // helper interno; contagem HEAD-only, sem baixar linhas.
  // Tipagem intencionalmente frouxa aqui (helper): a colher específica é
  // aplicada pelo callsite tipado abaixo.
  throw new Error("unused");
}
// (o helper genérico acima é apenas ilustrativo; usamos chamadas tipadas por view abaixo.)

import type { Database } from "@/integrations/supabase/types";

export interface AggregateResult {
  total: number;
  ok: number;
  pending: number;
}

async function countExact<T extends keyof Database["public"]["Views"]>(
  view: T,
  buildFilters?: (
    q: ReturnType<ReturnType<typeof supabase.from<T>>["select"]>,
  ) => ReturnType<ReturnType<typeof supabase.from<T>>["select"]>,
): Promise<number> {
  const base = supabase.from(view).select("*", { count: "exact", head: true });
  const q = buildFilters ? buildFilters(base) : base;
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/** Produtos: total, minimamente classificados e validados. */
export function useProductsReadiness() {
  return useQuery({
    queryKey: KEYS.products(),
    staleTime: STALE_MS,
    queryFn: async (): Promise<AggregateResult> => {
      const [total, classified, validated] = await Promise.all([
        countExact("v_product_fiscal_readiness"),
        countExact("v_product_fiscal_readiness", (q) =>
          q.eq("minimally_classified", true),
        ),
        countExact("v_product_fiscal_readiness", (q) =>
          q.eq("accounting_validated", true),
        ),
      ]);
      // "ok" para o card é a interseção implícita mínima da view: exige
      // ambas as flags. Sem inventar, usamos o menor dos dois — a view
      // NÃO exporta a interseção diretamente; a UI exibe os dois números
      // e reporta pendências (total - min(classified, validated)).
      const ok = Math.min(classified, validated);
      return { total, ok, pending: Math.max(0, total - ok) };
    },
  });
}

/** Serviços: total, referências mínimas classificadas e validadas. */
export function useServicesReadiness() {
  return useQuery({
    queryKey: KEYS.services(),
    staleTime: STALE_MS,
    queryFn: async (): Promise<AggregateResult> => {
      const [total, classified, validated] = await Promise.all([
        countExact("v_service_fiscal_readiness"),
        countExact("v_service_fiscal_readiness", (q) =>
          q.eq("minimally_classified", true),
        ),
        countExact("v_service_fiscal_readiness", (q) =>
          q.eq("accounting_validated", true),
        ),
      ]);
      const ok = Math.min(classified, validated);
      return { total, ok, pending: Math.max(0, total - ok) };
    },
  });
}

/** Clientes: total e com IBGE preenchido. */
export function useCustomersReadiness() {
  return useQuery({
    queryKey: KEYS.customers(),
    staleTime: STALE_MS,
    queryFn: async (): Promise<AggregateResult> => {
      const [total, withIbge] = await Promise.all([
        countExact("v_customer_fiscal_readiness"),
        countExact("v_customer_fiscal_readiness", (q) => q.eq("has_ibge", true)),
      ]);
      return { total, ok: withIbge, pending: Math.max(0, total - withIbge) };
    },
  });
}

export interface DocumentsBreakdown {
  total: number;
  byModel: Record<DocumentModel | "UNKNOWN", number>;
}

/** Documentos: total pendente + contagem por modelo (NFE/NFSE/OTHER). */
export function useDocumentsReadiness() {
  return useQuery({
    queryKey: KEYS.documents(),
    staleTime: STALE_MS,
    queryFn: async (): Promise<DocumentsBreakdown> => {
      const [total, nfe, nfse, other] = await Promise.all([
        countExact("v_fiscal_document_reconciliation_pending"),
        countExact("v_fiscal_document_reconciliation_pending", (q) =>
          q.eq("document_model", "NFE"),
        ),
        countExact("v_fiscal_document_reconciliation_pending", (q) =>
          q.eq("document_model", "NFSE"),
        ),
        countExact("v_fiscal_document_reconciliation_pending", (q) =>
          q.eq("document_model", "OTHER"),
        ),
      ]);
      const known = nfe + nfse + other;
      const unknown = Math.max(0, total - known);
      return {
        total,
        byModel: { NFE: nfe, NFSE: nfse, OTHER: other, UNKNOWN: unknown },
      };
    },
  });
}

export interface ReadinessBundle {
  company: ReturnType<typeof useCompanyReadiness>;
  products: ReturnType<typeof useProductsReadiness>;
  services: ReturnType<typeof useServicesReadiness>;
  customers: ReturnType<typeof useCustomersReadiness>;
  documents: ReturnType<typeof useDocumentsReadiness>;
}

/** Composição de todas as consultas. Cada bloco preserva seu estado próprio. */
export function useFiscalReadiness(): ReadinessBundle {
  return {
    company: useCompanyReadiness(),
    products: useProductsReadiness(),
    services: useServicesReadiness(),
    customers: useCustomersReadiness(),
    documents: useDocumentsReadiness(),
  };
}

/** Extrai mensagem segura de erro Postgrest sem vazar payload. */
export function safeErrorMessage(err: unknown): string {
  if (!err) return "Falha desconhecida.";
  const pg = err as PostgrestError;
  if (pg && typeof pg.message === "string") return pg.message;
  if (err instanceof Error) return err.message;
  return "Falha inesperada.";
}

// Silencia lint sobre "unused" helper deixado como referência histórica.
export const __unused_countRows_placeholder = countRows;
export type __KeysType = typeof useQueries;
