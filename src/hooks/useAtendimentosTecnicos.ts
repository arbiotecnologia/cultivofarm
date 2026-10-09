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
import { TECHNICAL_STALE_REVALIDATION, useTechnicalQuerySession } from "@/hooks/useVisitaWorkspace";

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
  responsavel_nome: string | null;
  data_prevista: string | null;
  proxima_acao: string | null;
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
  todos: number;
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
  todos: 0,
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
  const session = useTechnicalQuerySession("atendimentos-tecnicos");
  const { aba = "todos", search = null, page = 1, pageSize = 20, enabled = true } = filters;

  const result = useQuery<AtendimentosResult>({
    queryKey: ["atendimentos-tecnicos", { aba, search, page, pageSize }, session.scope],
    enabled: enabled && session.ready,
    placeholderData: (previous, query) => query?.queryKey[query.queryKey.length - 1] === session.scope ? keepPreviousData(previous) : undefined,
    ...TECHNICAL_STALE_REVALIDATION,
    queryFn: async ({ signal }): Promise<AtendimentosResult> => {
      const assertCurrent = session.fence();
      assertCurrent(signal);
      const { data, error } = await supabase.rpc("rpc_listar_atendimentos_tecnicos_v1" as never, {
        p_aba: aba,
        p_search: search?.trim() || null,
        p_page: page,
        p_page_size: pageSize,
      } as never);
      assertCurrent(signal);
      if (error) throw error;
      const res = (data ?? {}) as Partial<AtendimentosResult> & { ok?: boolean; error?: string };
      // O backend valida a aba: valor desconhecido é rejeitado explicitamente.
      if (res.ok === false) throw new Error(res.error ?? "atendimentos_indisponivel");

      return {
        items: (res.items ?? []) as AtendimentoItem[],
        total: res.total ?? 0,
        page: res.page ?? page,
        page_size: res.page_size ?? pageSize,
        has_more: res.has_more ?? false,
      };
    },
  });
  return { ...result, data: session.ready ? result.data : undefined };
}

export function useAtendimentosResumo(enabled = true) {
  const session = useTechnicalQuerySession("atendimentos-tecnicos-resumo");
  const result = useQuery({
    queryKey: ["atendimentos-tecnicos-resumo", session.scope],
    enabled: enabled && session.ready,
    ...TECHNICAL_STALE_REVALIDATION,
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<AtendimentosResumo> => {
      const assertCurrent = session.fence();
      assertCurrent(signal);
      const { data, error } = await supabase.rpc("rpc_resumo_atendimentos_tecnicos_v1" as never);
      assertCurrent(signal);
      if (error) throw error;
      return { ...EMPTY_ATENDIMENTOS_RESUMO, ...((data ?? {}) as Partial<AtendimentosResumo>) };
    },
  });
  return { ...result, data: session.ready ? result.data : undefined };
}
