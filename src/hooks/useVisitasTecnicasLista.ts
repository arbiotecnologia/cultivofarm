/**
 * Lista de visitas técnicas — fonte única paginada e filtrada no servidor.
 *
 * Substitui os `select("*")` com limite fixo espalhados pelas telas.
 * A RPC `rpc_listar_visitas_tecnicas_v1` aplica visibilidade (can_view_technical_visit),
 * projeção mínima e devolve `can_edit` calculado pelo backend — o front nunca
 * decide editabilidade por Set local.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TECHNICAL_STALE_REVALIDATION, useTechnicalQuerySession } from "@/hooks/useVisitaWorkspace";

export interface VisitaListaItem {
  id: string;
  codigo_visita: string | null;
  status: string;
  data_vistoria: string | null;
  tipo_visita: string | null;
  objetivo_visita: string | null;
  problema_principal: string | null;
  categoria_problema: string | null;
  nivel_pressao: string | null;
  urgencia: string | null;
  risco_produtivo: string | null;
  necessidade_intervencao: string | null;
  created_at: string | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  fazenda_id: string | null;
  fazenda_nome: string | null;
  talhao_nome: string | null;
  can_edit: boolean;
}

export interface VisitasListaResult {
  items: VisitaListaItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface VisitasListaFilters {
  search?: string | null;
  status?: string[] | null;
  de?: string | null;
  ate?: string | null;
  clienteId?: string | null;
  fazendaId?: string | null;
  page?: number;
  pageSize?: number;
  enabled?: boolean;
}

export const EMPTY_VISITAS_LISTA: VisitasListaResult = {
  items: [],
  total: 0,
  page: 1,
  page_size: 25,
  has_more: false,
};

/** Converte o filtro de período das telas em intervalo de datas ISO. */
export function periodoParaIntervalo(
  periodo: string,
  hoje: Date = new Date(),
): { de: string | null; ate: string | null } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (periodo === "today") return { de: iso(hoje), ate: iso(hoje) };
  if (periodo === "week") {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - 7);
    return { de: iso(d), ate: iso(hoje) };
  }
  if (periodo === "month") {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return { de: iso(d), ate: iso(hoje) };
  }
  return { de: null, ate: null };
}

export function useVisitasTecnicasLista(filters: VisitasListaFilters = {}) {
  const session = useTechnicalQuerySession("visitas-tecnicas-lista");
  const {
    search = null,
    status = null,
    de = null,
    ate = null,
    clienteId = null,
    fazendaId = null,
    page = 1,
    pageSize = 25,
    enabled = true,
  } = filters;

  const result = useQuery({
    queryKey: ["visitas-tecnicas-lista", { search, status, de, ate, clienteId, fazendaId, page, pageSize }, session.scope],
    enabled: enabled && session.ready,
    ...TECHNICAL_STALE_REVALIDATION,
    placeholderData: (previous, query) => query?.queryKey.at(-1) === session.scope ? keepPreviousData(previous) : undefined,
    queryFn: async ({ signal }): Promise<VisitasListaResult> => {
      const assertCurrent = session.fence();
      assertCurrent(signal);
      const { data, error } = await supabase.rpc("rpc_listar_visitas_tecnicas_v1" as never, {
        p_search: search || null,
        p_status: status && status.length ? status : null,
        p_de: de || null,
        p_ate: ate || null,
        p_cliente_id: clienteId || null,
        p_fazenda_id: fazendaId || null,
        p_page: page,
        p_page_size: pageSize,
      } as never).abortSignal(signal);
      assertCurrent(signal);
      if (error) throw error;
      const res = (data ?? {}) as Partial<VisitasListaResult>;
      return {
        items: (res.items ?? []) as VisitaListaItem[],
        total: res.total ?? 0,
        page: res.page ?? page,
        page_size: res.page_size ?? pageSize,
        has_more: res.has_more ?? false,
      };
    },
  });
  return { ...result, data: session.ready ? result.data : undefined };
}
