/**
 * Carteira do Vendedor — leitura exclusiva pela capability do servidor.
 * Sem capability instalada/comprovada, tudo fica fechado (fail-closed).
 * Lançar pedido e responder cotação só abrem quando o servidor declarar.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SellerPortfolioCapability {
  installed: boolean;
  ready: boolean;
  reason: string | null;
  orderCreate: boolean;
  quoteRespond: boolean;
  partners: Array<{ partner_id: string; razao_social: string }>;
}

const CLOSED: SellerPortfolioCapability = {
  installed: false, ready: false, reason: "capability_unavailable", orderCreate: false, quoteRespond: false, partners: [],
};

export function parseSellerCapability(data: unknown): SellerPortfolioCapability {
  const d = data as Record<string, unknown> | null;
  if (!d || d.contract !== "seller_portfolio_capability_v1") return CLOSED;
  const partners = Array.isArray(d.partners)
    ? (d.partners as any[]).filter((p) => typeof p?.partner_id === "string" && typeof p?.razao_social === "string")
    : [];
  const ready = d.ready === true;
  return {
    installed: true,
    ready,
    reason: typeof d.reason === "string" ? d.reason : null,
    orderCreate: ready && d.order_create === true,
    quoteRespond: ready && d.quote_respond === true,
    partners: ready ? partners : [],
  };
}

export function useSellerPortfolio(enabled = true) {
  const { user, authzEpoch } = useAuth() as any;
  return useQuery({
    queryKey: ["seller-portfolio-capability", user?.id ?? null, authzEpoch ?? 0],
    enabled: enabled && !!user?.id,
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
