import { useCockpitQuery } from "@/hooks/useCockpitQuery";

import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

export type Gravidade = "baixa" | "media" | "alta" | "critica";

export interface Inconsistencia {
  id: string;
  tipo: string;
  gravidade: Gravidade;
  os_id: string;
  cliente: string;
  fazenda: string;
  produto: string;
  lote?: string;
  data_ocorrencia: string;
  tempo_parado_horas: number;
  proxima_acao: string;
  status: "ativa" | "analisada";
}

export function usePendenciasEsteira() {
  const { data: rawItems = [], isLoading, isError, refetch } = useCockpitQuery({
    queryKey: ["pendencias-esteira"],
    queryFn: async ({ signal }) => {
      const { data, error } = await (supabase as any)
        .from("vw_esteira_laboratorio")
        .select("*")
        .neq("status_os" as any, "finalizada")
        .abortSignal(signal);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 300000,
  });

  const inconsistencias = useMemo(() => {
    const list: Inconsistencia[] = [];

    rawItems.forEach((item: any) => {
      const now = new Date().getTime();
      const createdAt = new Date(item.created_at || new Date()).getTime();
      const horasParadas = Math.floor((now - createdAt) / (1000 * 60 * 60));

      // Usar os bloqueios calculados pela view de integridade (Pendências Críticas)
      const bloqueiosAtuais = item.bloqueios || [];
      if (bloqueiosAtuais && bloqueiosAtuais.length > 0) {

        bloqueiosAtuais.forEach((bloqueio: string, index: number) => {

          list.push({
            id: `critica-${item.os_id}-${index}`,
            tipo: bloqueio,
            gravidade: "critica", // Todos os bloqueios da view agora são críticos
            os_id: item.os_id,
            cliente: item.cliente_nome,
            fazenda: item.fazenda_nome,
            produto: item.produto_nome,
            lote: item.codigo_lote,
            data_ocorrencia: item.created_at,
            tempo_parado_horas: horasParadas,
            proxima_acao: item.proxima_acao,
            status: "ativa"
          });
        });
      }

      // Adicionar pendências informativas da view
      if (item.pendencias_informativas && item.pendencias_informativas.length > 0) {
        item.pendencias_informativas.forEach((pendencia: string, index: number) => {
          list.push({
            id: `info-${item.os_id}-${index}`,
            tipo: pendencia === 'aplicacao_nao_registrada' ? 'Aplicação não registrada (Informativo)' : pendencia,
            gravidade: "baixa",
            os_id: item.os_id,
            cliente: item.cliente_nome,
            fazenda: item.fazenda_nome,
            produto: item.produto_nome,
            data_ocorrencia: item.created_at,
            tempo_parado_horas: horasParadas,
            proxima_acao: "Acompanhar aplicação pós-entrega",
            status: "ativa"
          });
        });
      }


      // Adicionar alertas de atraso que não são necessariamente bloqueios de fluxo
      if (item.atrasado) {
        list.push({
          id: `atraso-${item.os_id}`,
          tipo: "OS em Atraso (Cronograma)",
          gravidade: "alta",
          os_id: item.os_id,
          cliente: item.cliente_nome,
          fazenda: item.fazenda_nome,
          produto: item.produto_nome,
          data_ocorrencia: item.data_programada || item.created_at,
          tempo_parado_horas: horasParadas,
          proxima_acao: item.proxima_acao,
          status: "ativa"
        });
      }
    });

    return list;
  }, [rawItems]);

  return { inconsistencias, isLoading, isError, refetch };
}
