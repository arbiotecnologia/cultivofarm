import { useQuery } from "@tanstack/react-query";
import { useCommercialRegistrationScope } from "./useCommercialRegistrationScope";
import { supabase } from "@/integrations/supabase/client";

export type StatusFiltroParceiro = "ativos" | "inativos" | "todos";
export type FaixaDescontoFiltro = "all" | "zero" | "1-10" | "11-25" | ">25";
export type VinculoClienteFiltro = "all" | "com" | "sem";

export interface ParceiroB2B {
  id: string;
  client_id: string | null;
  codigo: string | null;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  desconto_padrao: number;
  observacoes: string | null;
  ativo: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Classificação comercial
  partner_type: string | null;
  segmento: string | null;
  porte: string | null;
  origem_parceiro: string | null;
  data_inicio_parceria: string | null;
  consultor_responsavel: string | null;
  commercial_region: string | null;
  commercial_state: string | null;
  commercial_city: string | null;
  // Fiscal
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  regime_tributario: string | null;
  suframa: string | null;
  // Endereço
  cep: string | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  // Contatos institucionais
  email_comercial: string | null;
  email_financeiro: string | null;
  email_nfe: string | null;
  telefone_comercial: string | null;
  whatsapp_comercial: string | null;
  site: string | null;
  // Comercial & financeiro
  limite_credito_brl: number | null;
  prazo_pagamento_padrao_dias: number | null;
  condicao_pagamento_padrao: string | null;
  forma_pagamento_preferida: string | null;
  dados_bancarios: any;
  comissao_percentual: number | null;
  meta_mensal_brl: number | null;
  // Logística
  endereco_entrega_igual_comercial: boolean;
  entrega_cep: string | null;
  entrega_logradouro: string | null;
  entrega_numero: string | null;
  entrega_complemento: string | null;
  entrega_bairro: string | null;
  entrega_cidade: string | null;
  entrega_estado: string | null;
  transportadora_preferida: string | null;
  incoterm: string | null;
}

interface UseParceirosParams {
  search?: string;
  status?: StatusFiltroParceiro;
  partnerType?: string;
  uf?: string;
  consultor?: string;
  faixaDesconto?: FaixaDescontoFiltro;
  vinculoCliente?: VinculoClienteFiltro;
  page?: number;
  pageSize?: number;
}

export function useParceirosB2B(params: UseParceirosParams = {}) {
  const {
    search = "",
    status = "ativos",
    partnerType = "all",
    uf = "all",
    consultor = "all",
    faixaDesconto = "all",
    vinculoCliente = "all",
    page = 1,
    pageSize = 20,
  } = params;

  const scope = useCommercialRegistrationScope();
  const result = useQuery({
    enabled: scope.ready,
    retry: false,
    queryKey: [
      "parceiros-b2b", scope.scope,
      { search, status, partnerType, uf, consultor, faixaDesconto, vinculoCliente, page, pageSize },
    ],
    queryFn: async ({ signal }) => {
      const current = scope.capture();
      let query = (supabase as any)
        .from("partner_accounts")
        .select("*", { count: "exact" }).abortSignal(signal)
        .order("created_at", { ascending: false });

      if (status === "ativos") query = query.eq("ativo", true);
      else if (status === "inativos") query = query.eq("ativo", false);

      if (partnerType !== "all") query = query.eq("partner_type", partnerType as any);
      if (uf !== "all") query = query.eq("commercial_state", uf);
      if (consultor !== "all") query = query.eq("consultor_responsavel", consultor);

      if (vinculoCliente === "com") query = query.not("client_id", "is", null);
      else if (vinculoCliente === "sem") query = query.is("client_id", null);

      if (faixaDesconto !== "all") {
        if (faixaDesconto === "zero") query = query.eq("desconto_padrao", 0);
        else if (faixaDesconto === "1-10") query = query.gte("desconto_padrao", 1).lte("desconto_padrao", 10);
        else if (faixaDesconto === "11-25") query = query.gte("desconto_padrao", 11).lte("desconto_padrao", 25);
        else if (faixaDesconto === ">25") query = query.gt("desconto_padrao", 25);
      }

      if (search.trim()) {
        const term = `%${search.trim()}%`;
        query = query.or(
          `codigo.ilike.${term},razao_social.ilike.${term},nome_fantasia.ilike.${term},cnpj.ilike.${term},commercial_city.ilike.${term}`,
        );
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (!current()) throw new Error("commercial_context_changed");
      if (error) throw error;

      return {
        items: (data ?? []) as ParceiroB2B[],
        total: count ?? 0,
      };
    },
  });
  return { ...result, data: scope.ready ? result.data : undefined };
}
