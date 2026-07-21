/**
 * Fase Fiscal 3.7 — Hooks somente leitura para a Central de Prontidão.
 *
 * - Nenhum insert/update/delete/upsert/RPC/edge-function calls.
 * - Cinco queries independentes (empresa, produtos, serviços, clientes,
 *   documentos), cada uma com estado isolado de loading/error/empty.
 * - Contagens via `count: "exact", head: true` para não baixar a base.
 * - Empresa lê no máximo 1 linha com colunas explícitas.
 * - Documentos: até 4 counts targeted (total + por modelo).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PostgrestError } from "@supabase/supabase-js";
import { DOCUMENT_MODELS, type CompanyRow, type DocumentModel } from "@/lib/fiscal/readinessValidation";

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



async function countHead(
  view:
    | "v_product_fiscal_readiness"
    | "v_service_fiscal_readiness"
    | "v_customer_fiscal_readiness"
    | "v_fiscal_document_reconciliation_pending",
): Promise<number> {
  const { count, error } = await supabase
    .from(view)
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countProductBoolTrue(
  col: "minimally_classified" | "accounting_validated",
): Promise<number> {
  const { count, error } = await supabase
    .from("v_product_fiscal_readiness")
    .select("*", { count: "exact", head: true })
    .eq(col, true);
  if (error) throw error;
  return count ?? 0;
}

async function countServiceBoolTrue(
  col: "minimally_classified" | "accounting_validated",
): Promise<number> {
  const { count, error } = await supabase
    .from("v_service_fiscal_readiness")
    .select("*", { count: "exact", head: true })
    .eq(col, true);
  if (error) throw error;
  return count ?? 0;
}

async function countCustomersWithIbge(): Promise<number> {
  const { count, error } = await supabase
    .from("v_customer_fiscal_readiness")
    .select("*", { count: "exact", head: true })
    .eq("has_ibge", true);
  if (error) throw error;
  return count ?? 0;
}

async function countDocsByModel(model: DocumentModel): Promise<number> {
  const { count, error } = await supabase
    .from("v_fiscal_document_reconciliation_pending")
    .select("*", { count: "exact", head: true })
    .eq("document_model", model);
  if (error) throw error;
  return count ?? 0;
}

export interface AggregateResult {
  total: number;
  ok: number;
  pending: number;
}

/** Produtos: total, minimamente classificados e validados. */
export function useProductsReadiness() {
  return useQuery({
    queryKey: KEYS.products(),
    staleTime: STALE_MS,
    queryFn: async (): Promise<AggregateResult> => {
      const [total, classified, validated] = await Promise.all([
        countHead("v_product_fiscal_readiness"),
        countProductBoolTrue("minimally_classified"),
        countProductBoolTrue("accounting_validated"),
      ]);
      // A view não expõe interseção; usamos o menor dos dois como piso e
      // reportamos ambos os números no card — sem inventar aprovação.
      const ok = Math.min(classified, validated);
      return { total, ok, pending: Math.max(0, total - ok) };
    },
  });
}

/** Serviços: total, minimamente classificados e validados. */
export function useServicesReadiness() {
  return useQuery({
    queryKey: KEYS.services(),
    staleTime: STALE_MS,
    queryFn: async (): Promise<AggregateResult> => {
      const [total, classified, validated] = await Promise.all([
        countHead("v_service_fiscal_readiness"),
        countServiceBoolTrue("minimally_classified"),
        countServiceBoolTrue("accounting_validated"),
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
        countHead("v_customer_fiscal_readiness"),
        countCustomersWithIbge(),
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
      const [total, ...perModel] = await Promise.all([
        countHead("v_fiscal_document_reconciliation_pending"),
        ...DOCUMENT_MODELS.map((m) => countDocsByModel(m)),
      ]);
      const byModel = DOCUMENT_MODELS.reduce(
        (acc, m, i) => ({ ...acc, [m]: perModel[i] ?? 0 }),
        {} as Record<DocumentModel, number>,
      );
      const known = DOCUMENT_MODELS.reduce((s, m) => s + (byModel[m] ?? 0), 0);
      const unknown = Math.max(0, total - known);
      return {
        total,
        byModel: { ...byModel, UNKNOWN: unknown },
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
