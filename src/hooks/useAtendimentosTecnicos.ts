/**
 * Workspace unificado de atendimentos técnicos.
 *
 * Fonte única e autoritativa: `rpc_listar_atendimentos_tecnicos_v1` e
 * `rpc_resumo_atendimentos_tecnicos_v1`. As RPCs consolidam, no servidor,
 * demandas do produtor, ocorrências de campo e visitas técnicas, aplicando
 * visibilidade (`can_view_technical_visit`), busca, filtro por aba e paginação.
 *
 * O front NÃO decide visibilidade, editabilidade nem contadores localmente.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AtendimentoAba =
  | "todos"
  | "demandas"
  | "ocorrencias"
  | "andamento"
  | "aguardando"
  | "monitoramento"
  | "concluidos";

export type AtendimentoKind = "demanda" | "visita";

export type AtendimentoOrigem =
  | "ocorrencia_campo"
  | "solicitacao_produtor"
  | "agenda"
  | "retorno_monitoramento"
  | "visita_avulsa";

export interface AtendimentoItem {
  kind: AtendimentoKind;
  id: string;
  codigo: string | null;
  titulo: string | null;
  status: string;
  origem: AtendimentoOrigem | null;
  cliente_nome: string | null;
  fazenda_nome: string | null;
  talhao_nome: string | null;
  cultura_nome: string | null;
  tipo: string | null;
  urgencia: string | null;
  data_ref: string | null;
  can_edit: boolean;
  next_route: string;
  bucket: string;
}

export interface AtendimentosResult {
  items: AtendimentoItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface AtendimentosResumo {
  demandas: number;
  em_andamento: number;
  aguardando: number;
  monitoramento: number;
  ocorrencias: number;
  concluidos: number;
  os_ativas: number;
  fazendas: number;
}

export const EMPTY_ATENDIMENTOS_RESUMO: AtendimentosResumo = {
  demandas: 0,
  em_andamento: 0,
  aguardando: 0,
  monitoramento: 0,
  ocorrencias: 0,
  concluidos: 0,
  os_ativas: 0,
  fazendas: 0,
};

export const ABAS_ATENDIMENTO: { value: AtendimentoAba; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "demandas", label: "Demandas" },
  { value: "andamento", label: "Em andamento" },
  { value: "aguardando", label: "Aguardando" },
  { value: "monitoramento", label: "Monitoramento" },
  { value: "ocorrencias", label: "Ocorrências" },
  { value: "concluidos", label: "Concluídos" },
];

export const ORIGEM_LABEL: Record<string, string> = {
  ocorrencia_campo: "Ocorrência de campo",
  solicitacao_produtor: "Solicitação do produtor",
  agenda: "Agenda",
  retorno_monitoramento: "Retorno de monitoramento",
  visita_avulsa: "Visita avulsa",
};

export interface AtendimentosFilters {
  aba?: AtendimentoAba;
  search?: string | null;
  page?: number;
  pageSize?: number;
  enabled?: boolean;
}

export function useAtendimentosTecnicos(filters: AtendimentosFilters = {}) {
  const { aba = "todos", search = null, page = 1, pageSize = 20, enabled = true } = filters;

  return useQuery({
    queryKey: ["atendimentos-tecnicos", { aba, search, page, pageSize }],
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async (): Promise<AtendimentosResult> => {
      const { data, error } = await supabase.rpc("rpc_listar_atendimentos_tecnicos_v1" as never, {
        p_aba: aba,
        p_search: search?.trim() || null,
        p_page: page,
        p_page_size: pageSize,
      } as never);
      if (error) throw error;
      const res = (data ?? {}) as Partial<AtendimentosResult>;
      return {
        items: (res.items ?? []) as AtendimentoItem[],
        total: res.total ?? 0,
        page: res.page ?? page,
        page_size: res.page_size ?? pageSize,
        has_more: res.has_more ?? false,
      };
    },
  });
}

export function useAtendimentosResumo(enabled = true) {
  return useQuery({
    queryKey: ["atendimentos-tecnicos-resumo"],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<AtendimentosResumo> => {
      const { data, error } = await supabase.rpc("rpc_resumo_atendimentos_tecnicos_v1" as never);
      if (error) throw error;
      return { ...EMPTY_ATENDIMENTOS_RESUMO, ...((data ?? {}) as Partial<AtendimentosResumo>) };
    },
  });
}
