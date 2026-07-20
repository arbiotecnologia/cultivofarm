import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PedidoFormalHeaderData {
  id: string;
  tipo: "pedido";
  numero: string;
  status: string;
  financial_status: string | null;
  created_at: string;
  requested_delivery_date: string | null;
  estimated_delivery_date: string | null;
  approved_at: string | null;
  cultura: string | null;
  area_total_ha: number | null;
  subtotal: number;
  desconto_total: number;
  total: number;
  payment_method: string | null;
  payment_due_date: string | null;
  observacoes: string | null;
  
  commercial_notes: string | null;
  origin_simulation_id: string | null;
  cliente: {
    id: string | null;
    razao_social: string | null;
    nome_fantasia: string | null;
    cpf_cnpj: string | null;
    inscricao_estadual: string | null;
    endereco_municipio: string | null;
    endereco_estado: string | null;
    endereco_logradouro: string | null;
    endereco_numero: string | null;
    endereco_bairro: string | null;
    endereco_cep: string | null;
    telefone: string | null;
    email: string | null;
    condicao_pagamento: string | null;
  } | null;
  partner: {
    id: string;
    razao_social: string;
    nome_fantasia: string | null;
    codigo: string | null;
    cnpj: string | null;
    condicao_pagamento_padrao: string | null;
    prazo_pagamento_padrao_dias: number | null;
    entrega_logradouro: string | null;
    entrega_numero: string | null;
    entrega_bairro: string | null;
    entrega_cidade: string | null;
    entrega_estado: string | null;
    entrega_cep: string | null;
  } | null;
  criador: { user_id: string; nome_completo: string | null; email: string | null } | null;
  aprovador: { user_id: string; nome_completo: string | null; email: string | null } | null;
}

export function usePedidoFormalHeader(orderId: string | null | undefined) {
  return useQuery({
    queryKey: ["pedido-formal-header", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<PedidoFormalHeaderData | null> => {
      const { data: order, error } = await supabase
        .from("partner_orders")
        .select("*")
        .eq("id", orderId!)
        .maybeSingle();
      if (error) throw error;
      if (!order) return null;

      const [cliRes, partRes, criadorRes, aprovadorRes] = await Promise.all([
        order.cliente_id
          ? supabase
              .from("clientes")
              .select(
                "id, razao_social, nome_fantasia, cpf_cnpj, inscricao_estadual, endereco_municipio, endereco_estado, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cep, telefone, email, condicao_pagamento, nome",
              )
              .eq("id", order.cliente_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase
          .from("partner_accounts")
          .select(
            "id, razao_social, nome_fantasia, codigo, cnpj, condicao_pagamento_padrao, prazo_pagamento_padrao_dias, entrega_logradouro, entrega_numero, entrega_bairro, entrega_cidade, entrega_estado, entrega_cep",
          )
          .eq("id", order.partner_id)
          .maybeSingle(),
        order.created_by
          ? supabase
              .from("profiles")
              .select("user_id, nome_completo, email")
              .eq("user_id", order.created_by)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        order.approved_by
          ? supabase
              .from("profiles")
              .select("user_id, nome_completo, email")
              .eq("user_id", order.approved_by)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      const cli = (cliRes as any)?.data ?? null;
      return {
        id: order.id,
        tipo: "pedido",
        numero: order.numero,
        status: order.status,
        financial_status: (order as any).financial_status ?? null,
        created_at: order.created_at,
        requested_delivery_date: order.requested_delivery_date,
        estimated_delivery_date: order.estimated_delivery_date,
        approved_at: order.approved_at,
        cultura: (order as any).cultura ?? null,
        area_total_ha: (order as any).area_total_ha ?? null,
        subtotal: Number(order.subtotal ?? 0),
        desconto_total: Number(order.desconto_total ?? 0),
        total: Number(order.total ?? 0),
        payment_method: (order as any).payment_method ?? null,
        payment_due_date: (order as any).payment_due_date ?? null,
        observacoes: order.observacoes,
        
        commercial_notes: (order as any).commercial_notes ?? null,
        origin_simulation_id: (order as any).origin_simulation_id ?? null,
        cliente: cli
          ? {
              id: cli.id,
              razao_social: cli.razao_social ?? cli.nome ?? null,
              nome_fantasia: cli.nome_fantasia,
              cpf_cnpj: cli.cpf_cnpj,
              inscricao_estadual: cli.inscricao_estadual,
              endereco_municipio: cli.endereco_municipio,
              endereco_estado: cli.endereco_estado,
              endereco_logradouro: cli.endereco_logradouro,
              endereco_numero: cli.endereco_numero,
              endereco_bairro: cli.endereco_bairro,
              endereco_cep: cli.endereco_cep,
              telefone: cli.telefone,
              email: cli.email,
              condicao_pagamento: cli.condicao_pagamento,
            }
          : null,
        partner: (partRes as any)?.data ?? null,
        criador: (criadorRes as any)?.data ?? null,
        aprovador: (aprovadorRes as any)?.data ?? null,
      };
    },
  });
}
