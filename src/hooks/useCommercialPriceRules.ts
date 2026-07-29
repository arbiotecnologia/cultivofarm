/**
 * Motor Comercial B2B — Fase 1 (Integração Autoritativa)
 *
 * Acesso à matriz canônica `commercial_price_rules`. A tabela é restrita por
 * RLS a administrador e gestor comercial; o frontend nunca calcula preço —
 * apenas administra as regras que o resolvedor do banco consome.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PriceRuleBuyerScope = "partner" | "customer";
export type PriceRulePricingMode = "fixed_item_price" | "discount_from_base" | "quote_only";

export interface CommercialPriceRule {
  id: string;
  buyer_scope: PriceRuleBuyerScope;
  partner_id: string | null;
  customer_id: string | null;
  plan_id: string | null;
  product_id: string | null;
  microrganismo_id: string | null;
  unit_type: string;
  volume_ml: number | null;
  pricing_mode: PriceRulePricingMode;
  condition_price: number | null;
  currency: string;
  valid_from: string;
  valid_until: string | null;
  active: boolean;
  motivo: string | null;
  created_at?: string;
  updated_at?: string;
}

export type CommercialPriceRuleInput = Omit<
  CommercialPriceRule,
  "id" | "created_at" | "updated_at" | "currency"
> & { id?: string; currency?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = supabase.from.bind(supabase) as unknown as (t: string) => any;

export function useCommercialPriceRules() {
  return useQuery({
    queryKey: ["commercial-price-rules"],
    queryFn: async (): Promise<CommercialPriceRule[]> => {
      const { data, error } = await anyFrom("commercial_price_rules")
        .select("*")
        .order("valid_from", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(mapRuleError(error.message));
      return (data ?? []) as CommercialPriceRule[];
    },
  });
}

export function usePriceRuleLookups() {
  return useQuery({
    queryKey: ["commercial-price-rules", "lookups"],
    queryFn: async () => {
      const [partners, produtos, micros] = await Promise.all([
        anyFrom("partner_accounts")
          .select("id, razao_social, nome_fantasia")
          .eq("ativo", true)
          .order("razao_social"),
        anyFrom("produtos").select("id, nome, codigo").eq("ativo", true).order("nome"),
        anyFrom("microrganismos").select("id, nome").eq("ativo", true).order("nome"),
      ]);
      return {
        partners: (partners.data ?? []) as Array<{ id: string; razao_social: string; nome_fantasia: string | null }>,
        produtos: (produtos.data ?? []) as Array<{ id: string; nome: string; codigo: string | null }>,
        microrganismos: (micros.data ?? []) as Array<{ id: string; nome: string }>,
      };
    },
    staleTime: 60_000,
  });
}

function mapRuleError(message: string): string {
  const msg = message ?? "";
  if (msg.includes("PRICE_RULE_MODE_CONFLICT")) {
    return "O modo de precificação da regra não corresponde ao modo da condição de pagamento selecionada.";
  }
  if (msg.includes("commercial_price_rules_no_overlap") || msg.toLowerCase().includes("conflicting key")) {
    return "Já existe uma regra vigente para essa mesma combinação e período.";
  }
  if (msg.includes("permission denied") || msg.includes("row-level security")) {
    return "Sem permissão para administrar a matriz de preços.";
  }
  if (msg.includes("violates check constraint")) {
    return "Regra inválida: revise preço, período e modo de precificação.";
  }
  return "Não foi possível salvar a regra de preço.";
}

export function useSavePriceRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CommercialPriceRuleInput) => {
      const { id, ...rest } = input;
      const payload = {
        ...rest,
        condition_price: rest.pricing_mode === "fixed_item_price" ? rest.condition_price : null,
        volume_ml: rest.unit_type === "volume" ? rest.volume_ml : null,
        valid_until: rest.valid_until || null,
        motivo: rest.motivo?.trim() || null,
      };
      const q = id
        ? anyFrom("commercial_price_rules").update(payload).eq("id", id).select().single()
        : anyFrom("commercial_price_rules").insert(payload).select().single();
      const { data, error } = await q;
      if (error) throw new Error(mapRuleError(error.message));
      return data as CommercialPriceRule;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commercial-price-rules"] }),
  });
}

export function useTogglePriceRuleActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await anyFrom("commercial_price_rules").update({ active }).eq("id", id);
      if (error) throw new Error(mapRuleError(error.message));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commercial-price-rules"] }),
  });
}

export function useDeletePriceRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("commercial_price_rules").delete().eq("id", id);
      if (error) throw new Error(mapRuleError(error.message));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commercial-price-rules"] }),
  });
}
