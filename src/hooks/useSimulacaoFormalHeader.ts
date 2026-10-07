import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Json } from "@/integrations/supabase/cultivofarm.types";

// The canonical generated client predates this RPC; keep its contract local.
const readSimulations = (args: { p_simulation_id: string; p_items?: boolean }) =>
  (supabase.rpc as unknown as (
    name: "b2b_read_simulations",
    args: { p_simulation_id: string; p_items?: boolean },
  ) => PromiseLike<{ data: Json | null; error: { message: string } | null }>)("b2b_read_simulations", args);

export interface SimulacaoFormalHeaderData {
  id: string;
  tipo: "simulacao";
  numero: string; // derivado: SIM-YYYY-<primeiros 6 do id>
  status: string;
  created_at: string;
  updated_at: string | null;
  converted_at: string | null;
  valid_until: string | null;
  titulo: string | null;
  observacoes: string | null;
  cultura: string | null;
  area_total_ha: number | null;
  objetivo_tecnico: string | null;
  total_cheio: number;
  volume_total_litros: number;
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
    /** Snapshot da propriedade (visível mesmo se o cliente mudar depois) */
    propriedade_nome_snapshot?: string | null;
  } | null;
  partner: {
    id: string;
    razao_social: string;
    nome_fantasia: string | null;
    codigo: string | null;
    cnpj: string | null;
    condicao_pagamento_padrao: string | null;
    prazo_pagamento_padrao_dias: number | null;
  } | null;
  criador: { user_id: string; nome_completo: string | null; email: string | null } | null;
  convertido_por: { user_id: string; nome_completo: string | null; email: string | null } | null;
  converted_order: { id: string; numero: string; status: string; total: number } | null;
}

function simNumero(created_at: string, id: string): string {
  const year = new Date(created_at).getFullYear();
  const short = id.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `SIM-${year}-${short}`;
}

export function useSimulacaoFormalHeader(simulationId: string | null | undefined) {
  const { user, role } = useAuth();
  return useQuery({
    queryKey: ["simulacao-formal-header", simulationId, user?.id, role],
    enabled: !!simulationId,
    queryFn: async (): Promise<SimulacaoFormalHeaderData | null> => {
      if (!simulationId) return null;
      const { data, error } = await readSimulations({ p_simulation_id: simulationId });
      const sim = Array.isArray(data) ? data[0] : null;
      if (error) throw error;
      if (!sim) return null;
      const s = sim as any;

      const [cliRes, partRes, criadorRes, convRes, orderRes, itemsRes] = await Promise.all([
        s.cliente_id
          ? supabase
              .from("clientes")
              .select(
                "id, razao_social, nome_fantasia, cpf_cnpj, inscricao_estadual, endereco_municipio, endereco_estado, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cep, telefone, email, condicao_pagamento, nome",
              )
              .eq("id", s.cliente_id)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
        supabase
          .from("partner_accounts")
          .select(
            "id, razao_social, nome_fantasia, codigo, cnpj, condicao_pagamento_padrao, prazo_pagamento_padrao_dias",
          )
          .eq("id", s.partner_id)
          .maybeSingle(),
        s.created_by
          ? supabase
              .from("profiles")
              .select("user_id, nome_completo, email")
              .eq("user_id", s.created_by)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
        s.converted_by
          ? supabase
              .from("profiles")
              .select("user_id, nome_completo, email")
              .eq("user_id", s.converted_by)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
        s.converted_order_id
          ? supabase
              .from("partner_orders")
              .select("id, numero, status, total")
              .eq("id", s.converted_order_id)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
        readSimulations({ p_simulation_id: simulationId, p_items: true }),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      const itemsData: Json[] = Array.isArray(itemsRes.data) ? itemsRes.data : [];
      const volumeTotalLitros = itemsData.reduce<number>((sum, it) => {
        if (!it || typeof it !== "object" || Array.isArray(it)) return sum;
        const q = Number(it.quantidade ?? 0);
        const v = Number(it.volume_ml ?? 0);
        return v > 0 && q > 0 ? sum + (q * v) / 1000 : sum;
      }, 0);


      const cli = (cliRes as any)?.data ?? null;
      return {
        id: s.id,
        tipo: "simulacao",
        numero: simNumero(s.created_at, s.id),
        status: s.status,
        created_at: s.created_at,
        updated_at: s.updated_at,
        converted_at: s.converted_at,
        valid_until: s.valid_until ?? null,
        titulo: s.titulo,
        observacoes: s.observacoes,
        cultura: s.cultura,
        area_total_ha: s.area_total_ha,
        objetivo_tecnico: s.objetivo_tecnico,
        total_cheio: Number(s.total_cheio ?? 0),
        volume_total_litros: volumeTotalLitros,
        cliente: cli
          ? {
              id: cli.id,
              razao_social: cli.razao_social ?? cli.nome ?? s.cliente_nome_snapshot ?? null,
              nome_fantasia: cli.nome_fantasia,
              cpf_cnpj: cli.cpf_cnpj,
              inscricao_estadual: cli.inscricao_estadual,
              endereco_municipio: cli.endereco_municipio ?? s.cliente_cidade_snapshot ?? null,
              endereco_estado: cli.endereco_estado ?? s.cliente_uf_snapshot ?? null,
              endereco_logradouro: cli.endereco_logradouro,
              endereco_numero: cli.endereco_numero,
              endereco_bairro: cli.endereco_bairro,
              endereco_cep: cli.endereco_cep,
              telefone: cli.telefone,
              email: cli.email,
              condicao_pagamento: cli.condicao_pagamento,
              propriedade_nome_snapshot: s.propriedade_nome_snapshot,
            }
          : s.cliente_nome_snapshot
            ? {
                id: null,
                razao_social: s.cliente_nome_snapshot,
                nome_fantasia: null,
                cpf_cnpj: null,
                inscricao_estadual: null,
                endereco_municipio: s.cliente_cidade_snapshot,
                endereco_estado: s.cliente_uf_snapshot,
                endereco_logradouro: null,
                endereco_numero: null,
                endereco_bairro: null,
                endereco_cep: null,
                telefone: null,
                email: null,
                condicao_pagamento: null,
                propriedade_nome_snapshot: s.propriedade_nome_snapshot,
              }
            : null,
        partner: (partRes as any)?.data ?? null,
        criador: (criadorRes as any)?.data ?? null,
        convertido_por: (convRes as any)?.data ?? null,
        converted_order: (orderRes as any)?.data ?? null,
      };
    },
  });
}
