import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database, Json } from "@/integrations/supabase/cultivofarm.types";

type PartnerInsert = Database["public"]["Tables"]["partner_accounts"]["Insert"];
type PartnerUpdate = Database["public"]["Tables"]["partner_accounts"]["Update"];
import { useCommercialRegistrationScope } from "./useCommercialRegistrationScope";
import { commercialRegistrationError } from "@/lib/commercialRegistrationErrors";

export interface ParceiroB2BInput {
  id?: string;
  codigo?: string | null;
  razao_social: string;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  client_id?: string | null;
  desconto_padrao: number;
  observacoes?: string | null;
  ativo: boolean;
  // Classificação
  partner_type?: string | null;
  segmento?: string | null;
  porte?: string | null;
  origem_parceiro?: string | null;
  data_inicio_parceria?: string | null;
  consultor_responsavel?: string | null;
  commercial_region?: string | null;
  commercial_state?: string | null;
  commercial_city?: string | null;
  // Fiscal
  inscricao_estadual?: string | null;
  inscricao_municipal?: string | null;
  regime_tributario?: string | null;
  suframa?: string | null;
  // Endereço
  cep?: string | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_complemento?: string | null;
  endereco_bairro?: string | null;
  // Contatos
  email_comercial?: string | null;
  email_financeiro?: string | null;
  email_nfe?: string | null;
  telefone_comercial?: string | null;
  whatsapp_comercial?: string | null;
  site?: string | null;
  // Financeiro
  limite_credito_brl?: number | null;
  prazo_pagamento_padrao_dias?: number | null;
  condicao_pagamento_padrao?: string | null;
  forma_pagamento_preferida?: string | null;
  dados_bancarios?: string | { texto?: string; [key: string]: Json | undefined } | null;
  comissao_percentual?: number | null;
  meta_mensal_brl?: number | null;
  // Logística
  endereco_entrega_igual_comercial?: boolean;
  entrega_cep?: string | null;
  entrega_logradouro?: string | null;
  entrega_numero?: string | null;
  entrega_complemento?: string | null;
  entrega_bairro?: string | null;
  entrega_cidade?: string | null;
  entrega_estado?: string | null;
  transportadora_preferida?: string | null;
  incoterm?: string | null;
}

export function useCreateParceiroB2B() {
  const qc = useQueryClient();
  const scope = useCommercialRegistrationScope();
  return useMutation({
    onMutate: () => ({ current: scope.capture(), scope: scope.scope }),
    mutationFn: async (input: ParceiroB2BInput) => {
      if (!scope.canManagePartners) throw { code: "42501" };
      const current = scope.capture();
      const { data: userData } = await supabase.auth.getUser();
      if (!current() || !userData.user?.id || userData.user.id !== scope.actorId) throw { code: "42501" };
      const { data, error } = await supabase
        .from("partner_accounts")
        .insert({ ...input, codigo: null, created_by: userData.user.id } as PartnerInsert)
        .select()
        .single();
      if (error) throw error;
      if (!current()) throw { code: "42501" };
      return data;
    },
    onSuccess: (_data, _input, context) => {
      if (!context?.current()) return;
      qc.invalidateQueries({ queryKey: ["parceiros-b2b", context.scope] });
      toast.success("Parceiro criado com sucesso");
    },
    onError: (e: unknown, _input, context) => { if (context?.current()) toast.error(commercialRegistrationError(e)); },
  });
}

export function useUpdateParceiroB2B() {
  const qc = useQueryClient();
  const scope = useCommercialRegistrationScope();
  return useMutation({
    onMutate: () => ({ current: scope.capture(), scope: scope.scope }),
    mutationFn: async ({ id, ...input }: ParceiroB2BInput & { id: string }) => {
      if (!scope.canManagePartners) throw { code: "42501" };
      const current = scope.capture();
      const { data, error } = await supabase
        .from("partner_accounts")
        .update(input as PartnerUpdate)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      if (!current()) throw { code: "42501" };
      return data;
    },
    onSuccess: (_data, _input, context) => {
      if (!context?.current()) return;
      qc.invalidateQueries({ queryKey: ["parceiros-b2b", context.scope] });
      toast.success("Parceiro atualizado");
    },
    onError: (e: unknown, _input, context) => { if (context?.current()) toast.error(commercialRegistrationError(e)); },
  });
}

export function useSoftDeleteParceiroB2B() {
  const qc = useQueryClient();
  const scope = useCommercialRegistrationScope();
  return useMutation({
    onMutate: () => ({ current: scope.capture(), scope: scope.scope }),
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      if (!scope.canManagePartners) throw { code: "42501" };
      const current = scope.capture();
      const { data, error } = await supabase
        .from("partner_accounts")
        .update({
          ativo,
          deleted_at: ativo ? null : new Date().toISOString(),
        } satisfies PartnerUpdate)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      if (!current()) throw { code: "42501" };
      return data;
    },
    onSuccess: (_d, vars, context) => {
      if (!context?.current()) return;
      qc.invalidateQueries({ queryKey: ["parceiros-b2b", context.scope] });
      toast.success(vars.ativo ? "Parceiro reativado" : "Parceiro inativado");
    },
    onError: (e: unknown, _input, context) => { if (context?.current()) toast.error(commercialRegistrationError(e)); },
  });
}
