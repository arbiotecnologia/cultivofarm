import { useAuth } from "@/hooks/useAuth";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { supabase } from "@/integrations/supabase/client";
import { parseOwnFinance } from "@/lib/comercial/financeContract";
import { isExclusiveFinanceRoles, parseFinanceCapability, parseFinanceCredit } from "@/lib/comercial/b2bFinanceRole";

type Rpc = (name: string, args?: Record<string, unknown>) => { abortSignal(s: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };
const rpc: Rpc = (supabase.rpc as unknown as Rpc).bind(supabase);

/** Capacidade derivada no servidor; reconsultada para que revogação/inativação retire o acesso. */
export function useB2BFinanceCapability() {
  const { roles, authzReady = true } = useAuth();
  const enabled = authzReady && isExclusiveFinanceRoles(roles);
  const q = useScopedPortalQuery({
    queryKey: ["b2b-finance-capability", "B2B_FINANCE_ROLE_V1"], enabled,
    refetchInterval: 30_000, refetchOnWindowFocus: true, staleTime: 0,
    queryFn: async (signal) => {
      const { data, error } = await rpc("b2b_finance_capability_v1").abortSignal(signal);
      if (error) throw new Error("finance_capability_unavailable");
      return parseFinanceCapability(data);
    },
  });
  return { ...q, enabled, data: enabled && q.ready && !q.isError ? q.data : undefined };
}

/** Reusa o leitor revisado de obrigações próprias; partner vem só da capacidade do servidor. */
export function useB2BFinanceObligations(partnerId: string | null, cursor: { at: string; id: string } | null) {
  const q = useScopedPortalQuery({
    queryKey: ["b2b-finance-obligations", "C2_OWN_OBLIGATIONS_V1", partnerId, cursor],
    enabled: !!partnerId,
    queryFn: async (signal) => {
      const { data, error } = await rpc("rpc_portal_partner_financial", {
        p_partner_id: partnerId, p_own_finance_v1: true, p_before: cursor?.at ?? null, p_before_id: cursor?.id ?? null,
      }).abortSignal(signal);
      if (error) throw new Error("own_finance_unavailable");
      return parseOwnFinance(data, partnerId as string);
    },
  });
  return { ...q, data: partnerId && q.ready && !q.isError ? q.data : undefined };
}

/** Crédito próprio: só com capacidade positiva `credit_read`; erro nunca vira zero. */
export function useB2BFinanceCredit(partnerId: string | null, creditRead: boolean) {
  const q = useScopedPortalQuery({
    queryKey: ["b2b-finance-credit", "B2B_FINANCE_CREDIT_V1", partnerId],
    enabled: !!partnerId && creditRead, staleTime: 0,
    queryFn: async (signal) => {
      const { data, error } = await rpc("b2b_finance_credit_v1").abortSignal(signal);
      if (error) throw new Error("finance_credit_unavailable");
      return parseFinanceCredit(data, partnerId as string);
    },
  });
  return { ...q, data: partnerId && creditRead && q.ready && !q.isError ? q.data : undefined };
}
