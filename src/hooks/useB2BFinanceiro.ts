import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useScopedB2BFinancialQuery } from "@/hooks/useB2BFinancialScope";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useAuth } from "@/hooks/useAuth";
import { activePaymentMethodValid, canConfigurePartnerSettings, settingsFields, type PartnerSettings } from "@/lib/financeiro/partnerSettings";
import { parseB2BForecast } from "@/lib/financeiro/b2bForecast";
import { parseRevenueForecastTenant, REVENUE_FORECAST_TENANT_RPC, type B2BRevenueForecastTenant } from "@/lib/financeiro/b2bRevenueForecastTenant";

const sb = supabase as any;

export function useB2BOrderForecast(orderId: string) {
  return useScopedB2BFinancialQuery({
    queryKey: ["b2b-order-forecast", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await sb.rpc("get_b2b_financial_forecast_secure", { p_order: orderId });
      if (error) throw error; // Pre-install absence is unavailable, never inferred from an order.
      return parseB2BForecast(data, orderId);
    },
  });
}

export interface B2BReceivableRow {
  partner_order_id: string;
  numero: string;
  partner_id: string;
  partner_name: string;
  status: string;
  financial_status: string;
  total: number;
  payment_due_date: string | null;
  payment_method: string | null;
  receivable_id: string | null;
  ar_status: string | null;
  created_at: string;
}

export interface B2BFilters {
  status?: string;
  financial_status?: string;
  partner_id?: string;
  from?: string;
  to?: string;
}

export function useB2BReceivables(filters: B2BFilters = {}) {
  return useScopedB2BFinancialQuery({
    queryKey: ["b2b-receivables", filters],
    queryFn: async (): Promise<B2BReceivableRow[]> => {
      let q = sb
        .from("partner_orders")
        .select(
          "id, numero, partner_id, status, financial_status, total, payment_due_date, payment_method, created_at, partner_accounts:partner_id(razao_social, nome_fantasia), partner_order_financial_links(receivable_id, accounts_receivable:receivable_id(status))"
        )
        .order("created_at", { ascending: false });
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.financial_status) q = q.eq("financial_status", filters.financial_status);
      if (filters.partner_id) q = q.eq("partner_id", filters.partner_id);
      if (filters.from) q = q.gte("created_at", filters.from);
      if (filters.to) q = q.lte("created_at", filters.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        partner_order_id: r.id,
        numero: r.numero,
        partner_id: r.partner_id,
        partner_name: r.partner_accounts?.nome_fantasia || r.partner_accounts?.razao_social || "—",
        status: r.status,
        financial_status: r.financial_status,
        total: Number(r.total ?? 0),
        payment_due_date: r.payment_due_date,
        payment_method: r.payment_method,
        receivable_id: r.partner_order_financial_links?.[0]?.receivable_id ?? null,
        ar_status: r.partner_order_financial_links?.[0]?.accounts_receivable?.status ?? null,
        created_at: r.created_at,
      }));
    },
  });
}

export function useGenerateB2BReceivable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (partner_order_id: string) => {
      const { data, error } = await sb.rpc("generate_b2b_receivable_secure", { p_partner_order_id: partner_order_id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Conta a receber gerada");
      qc.invalidateQueries({ queryKey: ["b2b-receivables"] });
      qc.invalidateQueries({ queryKey: ["b2b-financial-kpis"] });
      qc.invalidateQueries({ queryKey: ["ar-list"] });
    },
    onError: (e: any) => {
      const msg = e?.message ?? "";
      if (msg.includes("financial_approval_pending")) toast.error("Este pedido exige aprovação financeira antes do faturamento.");
      else if (msg.includes("financial_approval_rejected")) toast.error("A condição financeira deste pedido foi reprovada. Solicite ajuste antes de faturar.");
      else if (msg.includes("payment_terms_not_defined")) toast.error("Este pedido não possui condição comercial definida.");
      else if (msg.includes("credit_blocked_overdue")) toast.error("Parceiro possui saldo vencido. Novos pedidos a prazo estão bloqueados até regularização.");
      else if (msg.includes("below_minimum_order_amount")) toast.error("O valor do pedido está abaixo do mínimo permitido para esta condição de pagamento.");
      else toast.error(msg || "Falha ao gerar");
    },
  });
}

export function useCancelB2BReceivable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ partner_order_id, motivo }: { partner_order_id: string; motivo: string }) => {
      const { data, error } = await sb.rpc("cancel_b2b_receivable_secure", {
        p_partner_order_id: partner_order_id,
        p_motivo: motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Cobrança cancelada");
      qc.invalidateQueries({ queryKey: ["b2b-receivables"] });
      qc.invalidateQueries({ queryKey: ["b2b-financial-kpis"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao cancelar"),
  });
}

export function useB2BFinancialKpis(filters: { from?: string; to?: string; partner_id?: string } = {}) {
  return useScopedB2BFinancialQuery({
    queryKey: ["b2b-financial-kpis", filters],
    queryFn: async () => {
      const { data, error } = await sb.rpc("rpc_b2b_financial_kpis", {
        p_from: filters.from ?? null,
        p_to: filters.to ?? null,
        p_partner_id: filters.partner_id ?? null,
      });
      if (error) throw error;
      return data as Record<string, number>;
    },
  });
}

export function usePartnerFinancialSettings(partner_id: string | null | undefined, enabled = true) {
  return useScopedB2BFinancialQuery({
    queryKey: ["pfs", partner_id],
    enabled: enabled && !!partner_id,
    // App disables refetch-on-mount globally; each newly opened settings dialog needs a fresh CAS baseline.
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await sb
        .from("partner_financial_settings")
        .select("*")
        .eq("partner_id", partner_id)
        .maybeSingle();
      if (error) throw error;
      return data as PartnerSettings | null;
    },
  });
}

export function useUpdatePartnerFinancialSettings() {
  const qc = useQueryClient();
  const fence = useStorageAccessScope("b2b-financial");
  const { roles, profile } = useAuth();
  return useMutation({
    mutationFn: async ({ draft, baseline }: { draft: PartnerSettings; baseline: PartnerSettings | null }) => {
      const current = fence.capture();
      const org = profile?.organization_id;
      if (!current() || !org || !canConfigurePartnerSettings(roles)) throw new Error("financial_context_unavailable");
      if (baseline && (baseline.partner_id !== draft.partner_id || !baseline.id || !baseline.updated_at)) throw new Error("settings_conflict");
      // Presentation prechecks only: the RPC independently proves h15/roles/target and full-row CAS.
      const organization = await readFinancialSettingsOrganization(org);
      if (!current()) throw new Error("financial_context_changed");
      const { data: partner, error: partnerError } = await financialSettingsTargetQuery(
        sb.from("partner_accounts").select("id").eq("id", draft.partner_id), org, organization.partner_account_id)
        .eq("ativo", true).is("deleted_at", null).maybeSingle();
      if (!current()) throw new Error("financial_context_changed");
      if (partnerError || !partner) throw new Error("financial_partner_unavailable");
      const { data: methods, error: methodError } = await sb.from("payment_methods").select("name, active").eq("active", true);
      if (!current()) throw new Error("financial_context_changed");
      if (methodError || !activePaymentMethodValid(draft.default_payment_method, methods ?? [])) throw new Error("payment_method_invalid");
      const payload = Object.fromEntries(settingsFields.map(field => [field, draft[field]]));
      const { data, error } = await sb.rpc("rpc_update_partner_financial_settings", {
        p_partner_id: draft.partner_id,
        p_expected: baseline,
        p_values: payload,
      });
      if (!current()) throw new Error("financial_context_changed");
      // PT409: conflito CAS não retentável do c2p1_update_settings; preserva rascunho, sem auto-retry.
      if (error?.code === "23505" || error?.code === "PT409" || (!error && !data)) throw new Error("settings_conflict");
      if (error) throw error;
      if (data.partner_id !== draft.partner_id) throw new Error("settings_response_invalid");
      const key = ["pfs", draft.partner_id, fence.scope];
      // Serialize canonical adoption against pre-RPC reads. Cancellation rejects late SDK results
      // even if the transport does not support abort; never seed another actor/tenant/epoch.
      await qc.cancelQueries({ queryKey: key, exact: true });
      if (!current()) throw new Error("financial_context_changed");
      qc.setQueryData(key, data as PartnerSettings);
      await qc.invalidateQueries({ queryKey: key, exact: true, refetchType: "active" }, { throwOnError: true });
      if (!current()) throw new Error("financial_context_changed");
      return { row: data as PartnerSettings, scope: fence.scope };
    },
    onSuccess: (result, v) => {
      if (!fence.ready || result.scope !== fence.scope) return;
      toast.success("Configuração salva");
    },
    onError: () => {}, // Dialog preserves draft and distinguishes conflict/uncertainty.
  });
}

/** Never infer ownorg from a partner UUID or browser storage: read the current actor organization under RLS. */
async function readFinancialSettingsOrganization(org: string): Promise<{ partner_account_id: string | null }> {
  const { data, error } = await sb.from("organizations").select("id, partner_account_id")
    .eq("id", org).eq("ativo", true).eq("status", "ativa").maybeSingle();
  if (error || !data || data.id !== org) throw new Error("financial_context_unavailable");
  return data;
}

function financialSettingsTargetQuery(query: any, org: string, ownPartner: string | null) {
  return ownPartner
    ? query.or(`commercial_owner_organization_id.eq.${org},id.eq.${ownPartner}`)
    : query.eq("commercial_owner_organization_id", org);
}

export function useFinancialSettingsPartners(enabled: boolean) {
  const { profile, roles } = useAuth();
  return useScopedB2BFinancialQuery({
    queryKey: ["pfs-partners", profile?.organization_id],
    enabled: enabled && canConfigurePartnerSettings(roles),
    queryFn: async (): Promise<Array<{ id: string; razao_social: string; nome_fantasia: string | null }>> => {
      if (!profile?.organization_id) throw new Error("financial_context_unavailable");
      const organization = await readFinancialSettingsOrganization(profile.organization_id);
      const { data, error } = await financialSettingsTargetQuery(
        sb.from("partner_accounts").select("id, razao_social, nome_fantasia"),
        profile.organization_id, organization.partner_account_id).eq("ativo", true)
        .is("deleted_at", null).order("razao_social").limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFinancialSettingsMethods(enabled: boolean) {
  return useScopedB2BFinancialQuery({
    queryKey: ["pfs-methods"], enabled,
    queryFn: async (): Promise<Array<{ id: string; name: string; active: boolean }>> => {
      const { data, error } = await sb.from("payment_methods").select("id, name, active").eq("active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePortalPartnerFinancial(partnerId?: string | null, enabled = true) {
  return useScopedB2BFinancialQuery({
    queryKey: ["portal-partner-financial", partnerId ?? null],
    enabled,
    queryFn: async () => {
      const { data, error } = await sb.rpc("rpc_portal_partner_financial", {
        p_partner_id: partnerId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        partner_order_id: string;
        numero: string;
        receivable_id: string;
        total: number;
        vencimento: string | null;
        financial_status: string;
        payment_method: string | null;
        ar_status: string;
        installments: Array<{ numero: number; vencimento: string; valor: number; recebido: number; status: string }>;
      }>;
    },
  });
}

// ====== Fase 5.0.1 — crédito / inadimplência / governança ======

export interface PartnerCredit {
  partner_id: string;
  credit_limit: number;
  saldo_em_aberto: number;
  saldo_vencido: number;
  credito_disponivel: number;
  percentual_utilizado: number;
  overdue_tolerance_days: number;
  block_if_overdue: boolean;
  credit_limit_action: "block" | "approval_required";
  tem_vencidos: boolean;
}

export function usePartnerCredit(partner_id: string | null | undefined) {
  return useScopedB2BFinancialQuery({
    queryKey: ["partner-credit", partner_id],
    enabled: !!partner_id,
    queryFn: async (): Promise<PartnerCredit> => {
      const { data, error } = await sb.rpc("rpc_b2b_partner_credit", { p_partner_id: partner_id });
      if (error) throw error;
      return data as PartnerCredit;
    },
  });
}

export function usePortalPartnerCredit(enabled = true) {
  return useScopedB2BFinancialQuery({
    queryKey: ["portal-partner-credit"],
    enabled,
    queryFn: async (): Promise<PartnerCredit> => {
      const { data, error } = await sb.rpc("rpc_portal_partner_credit_status");
      if (error) throw error;
      return data as PartnerCredit;
    },
  });
}

export function useB2BGovernanceKpis() {
  return useScopedB2BFinancialQuery({
    queryKey: ["b2b-gov-kpis"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("rpc_b2b_governance_kpis");
      if (error) throw error;
      return data as Record<string, number>;
    },
  });
}

export function useB2BAging(partner_id?: string | null) {
  return useScopedB2BFinancialQuery({
    queryKey: ["b2b-aging", partner_id ?? null],
    queryFn: async () => {
      const { data, error } = await sb.rpc("rpc_b2b_aging", { p_partner_id: partner_id ?? null });
      if (error) throw error;
      return (data ?? []) as Array<{ faixa: string; qtd_titulos: number; valor: number; parceiros: number }>;
    },
  });
}

export function useApproveB2BCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ partner_order_id, notes }: { partner_order_id: string; notes?: string }) => {
      const { data, error } = await sb.rpc("approve_b2b_credit", {
        p_partner_order_id: partner_order_id,
        p_notes: notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-orders-admin"] });
      qc.invalidateQueries({ queryKey: ["partner-orders"] });
      qc.invalidateQueries({ queryKey: ["partner-credit"] });
      qc.invalidateQueries({ queryKey: ["b2b-receivables"] });
      qc.invalidateQueries({ queryKey: ["b2b-gov-kpis"] });
      qc.invalidateQueries({ queryKey: ["b2b-aging"] });
    },
    // Toast é controlado no chamador via toast.promise para feedback de etapa.
  });
}


// ====== Fase 5.1 — Inteligência Financeira ======

export interface AgingRow {
  faixa: string;
  qtd_titulos: number;
  valor: number;
  qtd_parceiros: number;
  pct_carteira: number;
  valor_medio_parceiro: number;
}

export function useB2BAgingDetalhado(filters: { from?: string; to?: string; partner_id?: string; status?: string } = {}) {
  return useScopedB2BFinancialQuery({
    queryKey: ["b2b-aging-det", filters],
    queryFn: async (): Promise<AgingRow[]> => {
      const { data, error } = await sb.rpc("rpc_b2b_aging_detalhado", {
        p_from: filters.from ?? null,
        p_to: filters.to ?? null,
        p_partner_id: filters.partner_id ?? null,
        p_status: filters.status ?? null,
      });
      if (error) throw error;
      return (data ?? []) as AgingRow[];
    },
  });
}

/**
 * Previsão de receita por empresa via leitor tenant-scoped candidato. Nunca chama o legado
 * rpc_b2b_revenue_forecast (sem filtro de empresa). Ausência do leitor => indisponível (null), sem fallback.
 */
export function useB2BRevenueForecast(partner_id?: string | null) {
  const partner = partner_id ?? null;
  const { profile } = useAuth();
  const sessionOrg = profile?.organization_id ?? null;
  return useScopedB2BFinancialQuery({
    // Prefixo "b2b-forecast" está no conjunto limpo a cada troca de escopo; empresa da sessão também na chave.
    queryKey: ["b2b-forecast", "tenant-v2", sessionOrg, partner],
    enabled: !!sessionOrg,
    queryFn: async (): Promise<B2BRevenueForecastTenant | null> => {
      const { data, error } = await sb.rpc(REVENUE_FORECAST_TENANT_RPC, { p_partner_id: partner });
      if (error) {
        if (error.code === "PGRST202" && typeof error.message === "string" &&
            error.message.includes(`public.${REVENUE_FORECAST_TENANT_RPC}(p_partner_id)`)) return null;
        throw error;
      }
      return parseRevenueForecastTenant(data, partner, sessionOrg);
    },
  });
}

export interface ProfitabilityRow {
  partner_id: string; partner_name: string;
  total_comprado: number; total_recebido: number; total_aberto: number;
  ticket_medio: number; qtd_pedidos: number;
  prazo_medio_pgto: number; inadimplencia_pct: number;
  risk_score: number; risk_level: "baixo"|"medio"|"alto"|"critico";
}

export function useB2BPartnerProfitability(filters: { from?: string; to?: string; partner_id?: string } = {}) {
  return useScopedB2BFinancialQuery({
    queryKey: ["b2b-profit", filters],
    queryFn: async (): Promise<ProfitabilityRow[]> => {
      const { data, error } = await sb.rpc("rpc_b2b_partner_profitability", {
        p_from: filters.from ?? null,
        p_to: filters.to ?? null,
        p_partner_id: filters.partner_id ?? null,
      });
      if (error) throw error;
      return (data ?? []) as ProfitabilityRow[];
    },
  });
}

export function useB2BExecutiveAlerts() {
  return useScopedB2BFinancialQuery({
    queryKey: ["b2b-exec-alerts"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("rpc_b2b_executive_alerts");
      if (error) throw error;
      return data as any;
    },
  });
}

export function useB2BCarteiraKpis(filters: { from?: string; to?: string } = {}) {
  return useScopedB2BFinancialQuery({
    queryKey: ["b2b-carteira-kpis", filters],
    queryFn: async () => {
      const { data, error } = await sb.rpc("rpc_b2b_carteira_kpis", {
        p_from: filters.from ?? null, p_to: filters.to ?? null,
      });
      if (error) throw error;
      return data as Record<string, number>;
    },
  });
}

export function useB2BExecutiveDashboard() {
  return useScopedB2BFinancialQuery({
    queryKey: ["b2b-exec-dashboard"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("rpc_b2b_executive_dashboard");
      if (error) throw error;
      return data as any;
    },
  });
}

export function usePartnerRiskScore(partner_id: string | null | undefined) {
  return useScopedB2BFinancialQuery({
    queryKey: ["partner-risk-score", partner_id],
    enabled: !!partner_id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("partner_risk_scores")
        .select("*")
        .eq("partner_id", partner_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useRecalcPartnerRiskScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (partner_id: string) => {
      const { data, error } = await sb.rpc("recalc_partner_risk_score", { p_partner_id: partner_id });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, partner_id) => {
      toast.success("Score recalculado");
      qc.invalidateQueries({ queryKey: ["partner-risk-score", partner_id] });
      qc.invalidateQueries({ queryKey: ["b2b-exec-dashboard"] });
      qc.invalidateQueries({ queryKey: ["b2b-profit"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao recalcular score"),
  });
}

export function useFinancialGovernanceRules() {
  return useScopedB2BFinancialQuery({
    queryKey: ["fgr"],
    queryFn: async () => {
      const { data, error } = await sb.from("financial_governance_rules").select("*").order("regra");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateFinancialGovernanceRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { id, ...rest } = payload;
      const { error } = await sb.from("financial_governance_rules").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra atualizada");
      qc.invalidateQueries({ queryKey: ["fgr"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}
