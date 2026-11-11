/**
 * Carteira do Vendedor — leitura exclusiva pela capability do servidor.
 * Sem capability instalada/comprovada, tudo fica fechado (fail-closed).
 * Lançar pedido e responder cotação só abrem quando o servidor declarar;
 * bloqueio fiscal do emitente é distinto de ausência funcional.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SellerPartner { partner_id: string; razao_social: string; orderCreate: boolean }
export type SellerFiscalBlock = "issuer_not_validated" | "issuer_ambiguous" | null;

export interface SellerPortfolioCapability {
  installed: boolean;
  ready: boolean;
  reason: string | null;
  fiscalBlock: SellerFiscalBlock;
  orderCreate: boolean;
  quoteRespond: boolean;
  partners: SellerPartner[];
}

const CLOSED: SellerPortfolioCapability = {
  installed: false, ready: false, reason: "capability_unavailable", fiscalBlock: null, orderCreate: false, quoteRespond: false, partners: [],
};

export function parseSellerCapability(data: unknown): SellerPortfolioCapability {
  const d = data as Record<string, unknown> | null;
  if (!d || d.contract !== "seller_portfolio_capability_v1") return CLOSED;
  const ready = d.ready === true;
  // Escrita só com contrato v2 (writers revisados instalados); v1 mantém tudo fechado.
  const writersInstalled = ready && d.version === 2;
  const partners: SellerPartner[] = Array.isArray(d.partners)
    ? (d.partners as any[])
        .filter((p) => typeof p?.partner_id === "string" && typeof p?.razao_social === "string")
        .map((p) => ({ partner_id: p.partner_id, razao_social: p.razao_social, orderCreate: writersInstalled && p.order_create === true }))
    : [];
  const fiscal = d.fiscal_block === "issuer_not_validated" || d.fiscal_block === "issuer_ambiguous" ? d.fiscal_block : null;
  return {
    installed: true,
    ready,
    reason: typeof d.reason === "string" ? d.reason : null,
    fiscalBlock: ready ? fiscal : null,
    orderCreate: writersInstalled && d.order_create === true,
    quoteRespond: writersInstalled && d.quote_respond === true,
    partners: ready ? partners : [],
  };
}

function useScopeKey() {
  const { user, profile, roles, authzReady, authzEpoch } = useAuth() as any;
  const org = profile?.organization_id ?? null;
  const roleKey = [...(roles ?? [])].sort().join(",");
  return { key: [user?.id ?? null, org, roleKey, authzEpoch ?? 0] as const, ok: !!user?.id && !!org && authzReady === true && profile?.ativo !== false };
}

export function useSellerPortfolio(enabled = true) {
  const s = useScopeKey();
  return useQuery({
    // Chave por identidade/empresa/papéis/época: revogação ou troca nunca reaproveita resposta antiga.
    queryKey: ["seller-portfolio-capability", ...s.key],
    enabled: enabled && s.ok,
    retry: false,
    staleTime: 15_000,
    queryFn: async (): Promise<SellerPortfolioCapability> => {
      const { data, error } = await (supabase as any).rpc("seller_portfolio_capability_v1");
      if (error) return CLOSED;
      return parseSellerCapability(data);
    },
  });
}

/** Papel "vendedor" só é atribuível quando o contrato do servidor existe. */
export function useSellerRoleInstalled(): boolean {
  const q = useSellerPortfolio(true);
  return q.data?.installed === true;
}

export interface SellerOrder {
  id: string; numero: string | null; partner_id: string; razao_social: string; status: string;
  total: number | null; created_at: string; created_by_me: boolean;
  items: Array<{ id: string; quantidade: number | string; [k: string]: unknown }>;
}

export function parseSellerOrders(data: unknown): SellerOrder[] | null {
  const d = data as Record<string, unknown> | null;
  if (!d || d.contract !== "seller_portfolio_orders_v1" || !Array.isArray(d.orders)) return null;
  return (d.orders as any[]).filter((o) => typeof o?.id === "string" && typeof o?.partner_id === "string")
    .map((o) => ({ ...o, items: Array.isArray(o.items) ? o.items.filter((i: any) => typeof i?.id === "string") : [] }));
}

export function useSellerPortfolioOrders(enabled: boolean) {
  const s = useScopeKey();
  return useQuery({
    queryKey: ["seller-portfolio-orders", ...s.key],
    enabled: enabled && s.ok,
    retry: false,
    queryFn: async (): Promise<SellerOrder[] | null> => {
      const { data, error } = await (supabase as any).rpc("seller_portfolio_orders_v1");
      if (error) return null;
      return parseSellerOrders(data);
    },
  });
}

export interface SellerPortfolioOverview {
  sellers: Array<{ user_id: string; nome: string | null }>;
  partners: Array<{ partner_id: string; razao_social: string }>;
  assignments: Array<{ id: string; seller_user_id: string; partner_id: string; assigned_at: string; reason: string; revoked_at: string | null; revoke_reason: string | null; seller_active?: boolean; partner_active?: boolean }>;
}

export function parseOverview(data: unknown): SellerPortfolioOverview | null {
  const d = data as Record<string, unknown> | null;
  if (!d || d.contract !== "admin_seller_portfolio_overview_v1") return null;
  const arr = (x: unknown) => (Array.isArray(x) ? (x as any[]) : []);
  return { sellers: arr(d.sellers), partners: arr(d.partners), assignments: arr(d.assignments) };
}

/** Administrador da empresa: vendedores, parceiros e atribuições da própria empresa (servidor decide). */
export function useSellerPortfolioAdmin(enabled: boolean) {
  const s = useScopeKey();
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: ["seller-portfolio-admin", ...s.key],
    enabled: enabled && s.ok,
    retry: false,
    queryFn: async (): Promise<SellerPortfolioOverview | null> => {
      const { data, error } = await (supabase as any).rpc("admin_seller_portfolio_overview_v1");
      if (error) return null;
      return parseOverview(data);
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["seller-portfolio-admin"] });
    qc.invalidateQueries({ queryKey: ["seller-portfolio-capability"] });
  };
  const assign = useMutation({
    mutationFn: async (v: { seller: string; partner: string; reason: string }) => {
      const { error } = await (supabase as any).rpc("admin_assign_seller_portfolio_v1", { p_seller: v.seller, p_partner: v.partner, p_reason: v.reason });
      if (error) throw new Error(portfolioErrorText(error.message));
    },
    onSettled: refresh,
  });
  const revoke = useMutation({
    mutationFn: async (v: { assignment: string; reason: string }) => {
      const { error } = await (supabase as any).rpc("admin_revoke_seller_portfolio_v1", { p_assignment: v.assignment, p_reason: v.reason });
      if (error) throw new Error(portfolioErrorText(error.message));
    },
    onSettled: refresh,
  });
  return { overview, assign, revoke };
}

export function portfolioErrorText(message: string | undefined): string {
  const m = message ?? "";
  if (m.includes("SELLER_PORTFOLIO_ALREADY_ASSIGNED")) return "Este parceiro já está na carteira de um vendedor. Revogue antes de reatribuir.";
  if (m.includes("SELLER_PORTFOLIO_REASON_REQUIRED")) return "Informe o motivo.";
  if (m.includes("SELLER_PORTFOLIO_SELLER_INVALID")) return "Usuário não é vendedor ativo e exclusivo desta empresa.";
  if (m.includes("SELLER_PORTFOLIO_PARTNER_INVALID")) return "Parceiro inativo ou excluído não pode receber carteira.";
  if (m.includes("SELLER_PORTFOLIO_FORBIDDEN")) return "Sem permissão para esta carteira.";
  return "Não foi possível concluir. Nada foi alterado.";
}

export const SELLER_FISCAL_TEXT: Record<Exclude<SellerFiscalBlock, null>, string> = {
  issuer_not_validated: "Lançamento de pedido bloqueado: a configuração fiscal da empresa ainda não foi validada pela contabilidade. Cotações continuam disponíveis.",
  issuer_ambiguous: "Lançamento de pedido bloqueado: a empresa não tem uma única configuração fiscal ativa. Cotações continuam disponíveis.",
};
