import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import type { EngagementStatus } from "@/lib/services/serviceBilling";

// Tabelas novas ainda fora dos tipos gerados: cliente canônico sem tipagem.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface CatalogService { id: string; code: string | null; name: string; description: string | null; unit: string; unit_price: number; is_active: boolean; updated_at: string }
export interface ServiceEngagement { id: string; service_id: string; customer_id: string; performed_on: string; quantity: number; unit_price: number; total_amount: number; description: string | null; status: EngagementStatus; fiscal_invoice_id: string | null; updated_at: string }
export interface InvoiceStatusRow { id: string; status: string | null; normalized_status: string | null; provider_reference: string | null; invoice_number: string | null; provider_status_raw?: string | null }

export const SERVICE_KEYS = {
  root: ["catalog-services"] as const,
  list: () => ["catalog-services", "list"] as const,
  engagements: () => ["catalog-services", "engagements"] as const,
  invoices: (ids: string[]) => ["catalog-services", "invoices", [...ids].sort()] as const,
  profiles: () => ["catalog-services", "fiscal-profiles"] as const,
  customers: () => ["catalog-services", "customers"] as const,
  readiness: () => ["catalog-services", "nfse-readiness"] as const,
};

export class ServiceConflictError extends Error { constructor(public kind: "duplicate" | "stale") { super(kind); } }

function check<T>(res: { data: T; error: { code?: string; message?: string } | null }): T {
  if (res.error) {
    if (res.error.code === "23505") throw new ServiceConflictError("duplicate");
    throw new Error(res.error.message ?? "erro");
  }
  return res.data;
}

export function useCatalogServices() {
  const { profile } = useAuth();
  const org = profile?.organization_id;
  return useScopedPortalQuery<CatalogService[]>({
    queryKey: SERVICE_KEYS.list(), enabled: !!org,
    queryFn: async (signal) => check(await db.from("catalog_services").select("id, code, name, description, unit, unit_price, is_active, updated_at").eq("organization_id", org).order("name").abortSignal(signal)) ?? [],
  });
}

export function useServiceFiscalProfilesByService() {
  const { profile } = useAuth();
  const org = profile?.organization_id;
  return useScopedPortalQuery<Array<{ id: string; service_id: string | null; source_reference: string | null; service_name: string | null; fiscal_description_template: string | null; lc116_item: string | null; cnae: string | null; municipal_taxation_code: string | null; national_taxation_code: string | null; profile_status: string; is_active: boolean; updated_at: string }>>({
    queryKey: SERVICE_KEYS.profiles(), enabled: !!org,
    queryFn: async (signal) => check(await db.from("service_fiscal_profiles").select("id, service_id, source_reference, service_name, fiscal_description_template, lc116_item, cnae, municipal_taxation_code, national_taxation_code, profile_status, is_active, updated_at").eq("organization_id", org).eq("is_active", true).not("service_id", "is", null).abortSignal(signal)) ?? [],
  });
}

export function useServiceCustomers(enabled: boolean) {
  const { profile } = useAuth();
  const org = profile?.organization_id;
  return useScopedPortalQuery<Array<{ id: string; nome: string }>>({
    queryKey: SERVICE_KEYS.customers(), enabled: enabled && !!org,
    queryFn: async (signal) => check(await db.from("clientes").select("id, nome").eq("organization_id", org).order("nome").limit(1000).abortSignal(signal)) ?? [],
  });
}

export function useServiceEngagements(enabled: boolean) {
  const { profile } = useAuth();
  const org = profile?.organization_id;
  return useScopedPortalQuery<ServiceEngagement[]>({
    queryKey: SERVICE_KEYS.engagements(), enabled: enabled && !!org,
    queryFn: async (signal) => check(await db.from("service_engagements").select("id, service_id, customer_id, performed_on, quantity, unit_price, total_amount, description, status, fiscal_invoice_id, updated_at").eq("organization_id", org).order("performed_on", { ascending: false }).limit(500).abortSignal(signal)) ?? [],
  });
}

export function useServiceInvoices(ids: string[]) {
  return useScopedPortalQuery<InvoiceStatusRow[]>({
    queryKey: SERVICE_KEYS.invoices(ids), enabled: ids.length > 0,
    queryFn: async (signal) => check(await db.from("fiscal_invoices").select("id, status, normalized_status, provider_reference, invoice_number, provider_status_raw").in("id", ids).abortSignal(signal)) ?? [],
  });
}

export function useNfseReadiness(enabled: boolean) {
  return useScopedPortalQuery<{ ready: boolean; provider?: string; environment?: string; missing: string[] }>({
    queryKey: SERVICE_KEYS.readiness(), enabled,
    queryFn: async () => check(await db.rpc("rpc_service_nfse_readiness_v1")),
  });
}

export interface ServiceInput { code: string; name: string; description: string; unit: string; unit_price: number; is_active: boolean }

export function useSaveCatalogService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, expectedUpdatedAt, values }: { id: string | null; expectedUpdatedAt: string | null; values: ServiceInput }) => {
      const payload = { code: values.code.trim() || null, name: values.name.trim(), description: values.description.trim() || null, unit: values.unit.trim() || "UN", unit_price: values.unit_price, is_active: values.is_active };
      if (!payload.name) throw new Error("Informe o nome do serviço.");
      if (!Number.isFinite(payload.unit_price) || payload.unit_price < 0) throw new Error("Preço inválido.");
      if (!id) return check(await db.from("catalog_services").insert(payload).select("id").single()) as { id: string };
      const rows = check(await db.from("catalog_services").update(payload).eq("id", id).eq("updated_at", expectedUpdatedAt).select("id")) as Array<{ id: string }>;
      if (!rows || rows.length !== 1) throw new ServiceConflictError("stale");
      return rows[0];
    },
    onSettled: () => qc.invalidateQueries({ queryKey: SERVICE_KEYS.root }),
  });
}

export interface EngagementInput { service_id: string; customer_id: string; performed_on: string; quantity: number; unit_price: number; description: string }

export function useSaveEngagement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, expectedUpdatedAt, values, status }: { id: string | null; expectedUpdatedAt: string | null; values?: EngagementInput; status?: "DRAFT" | "READY" | "CANCELED" }) => {
      if (values) {
        if (!(values.quantity > 0)) throw new Error("Quantidade deve ser maior que zero.");
        if (!(values.unit_price >= 0)) throw new Error("Valor inválido.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(values.performed_on)) throw new Error("Data inválida.");
      }
      const payload: Record<string, unknown> = { ...(values ? { ...values, description: values.description.trim() || null } : {}), ...(status ? { status } : {}) };
      if (!id) return check(await db.from("service_engagements").insert(payload).select("id").single());
      const rows = check(await db.from("service_engagements").update(payload).eq("id", id).eq("updated_at", expectedUpdatedAt).select("id")) as unknown[];
      if (!rows || rows.length !== 1) throw new ServiceConflictError("stale");
      return rows[0];
    },
    onSettled: () => qc.invalidateQueries({ queryKey: SERVICE_KEYS.root }),
  });
}

export function useBillServices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, key }: { ids: string[]; key: string }) => {
      const res = await db.rpc("rpc_service_billing_create_draft_v1", { p_engagement_ids: ids, p_idempotency_key: key });
      if (res.error) { const e = new Error(res.error.message) as Error & { code?: string; definitive?: boolean }; e.code = res.error.code; e.definitive = !!res.error.code; throw e; }
      return res.data as { invoice_id: string; replayed: boolean };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: SERVICE_KEYS.root }),
  });
}

/** Chave de envio estável por versão do rascunho: repetir o clique reaproveita a
 * mesma transmissão; só uma correção (nova versão) abre nova tentativa. */
export function nfseEmissionKey(invoiceId: string, draftVersion: number): string {
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId) || !Number.isInteger(draftVersion) || draftVersion < 1) throw new Error("nfse_key_input_invalid");
  return `nfse:${invoiceId.toLowerCase()}:v${draftVersion}`;
}

export async function requestNfseEmission(invoiceId: string) {
  const inv = await db.from("fiscal_invoices").select("draft_version").eq("id", invoiceId).maybeSingle();
  const version = Number(inv.data?.draft_version);
  if (inv.error || !Number.isInteger(version) || version < 1) return { code: "invoice_not_found" } as { code: string; missing?: string[]; message?: string };
  const { data, error } = await supabase.functions.invoke("nfse-nacional-emit", { body: { invoice_id: invoiceId, idempotency_key: nfseEmissionKey(invoiceId, version) } });
  if (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any).context;
    try { return (await ctx.json()) as { code: string; missing?: string[]; message?: string }; } catch { throw error; }
  }
  return data as { code: string; missing?: string[]; message?: string };
}
