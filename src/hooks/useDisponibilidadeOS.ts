import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LoteRow {
  id: string;
  codigo_lote: string | null;
  produto_id: string | null;
  microrganismo_id: string | null;
  volume_produzido: number | null;
  status: string | null;
}

export interface DisponibilidadeBucket {
  envasadoL: number;
  reservadoL: number;
  disponivelL: number;
  vencidoL: number;
}

export interface DisponibilidadeOSData {
  lotes: LoteRow[];
  /** chave: lote_id */
  porLote: Record<string, DisponibilidadeBucket>;
  /** chave: microrganismo_id (para Caso A direto e Caso C) */
  porMicrorganismo: Record<string, DisponibilidadeBucket>;
  /** Soma dos lotes do produto composto SEM microrganismo_id (Caso B) */
  consolidadoSemMicro: DisponibilidadeBucket;
  temLoteConsolidado: boolean;
  temLote: boolean;
}

const ML_TO_L = (ml: number | null | undefined) => (Number(ml) || 0) / 1000;

function emptyBucket(): DisponibilidadeBucket {
  return { envasadoL: 0, reservadoL: 0, disponivelL: 0, vencidoL: 0 };
}

export function useDisponibilidadeOS(osId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["disponibilidade-os", osId],
    enabled: !!osId,
    queryFn: async (): Promise<DisponibilidadeOSData> => {
      // 1) Lotes da OS via programacao_producao
      const { data: lotesData, error: lotesErr } = await supabase
        .from("lotes")
        .select(
          "id, codigo_lote, produto_id, microrganismo_id, volume_produzido, status, programacao_producao!inner(ordem_servico_id)",
        )
        .eq("programacao_producao.ordem_servico_id", osId!);
      if (lotesErr) throw lotesErr;

      const lotes: LoteRow[] = (lotesData ?? []).map((l: any) => ({
        id: l.id,
        codigo_lote: l.codigo_lote ?? null,
        produto_id: l.produto_id,
        microrganismo_id: l.microrganismo_id,
        volume_produzido: l.volume_produzido,
        status: l.status,
      }));

      const porLote: Record<string, DisponibilidadeBucket> = {};
      lotes.forEach((l) => (porLote[l.id] = emptyBucket()));

      const loteIds = lotes.map((l) => l.id);
      if (loteIds.length > 0) {
        // 2) Envase por lote
        const { data: envases, error: envErr } = await supabase
          .from("envase")
          .select("lote_id, quantidade, volume_por_unidade")
          .in("lote_id", loteIds);
        if (envErr) throw envErr;
        (envases ?? []).forEach((e: any) => {
          const litros = (Number(e.quantidade) || 0) * ML_TO_L(e.volume_por_unidade);
          if (porLote[e.lote_id]) porLote[e.lote_id].envasadoL += litros;
        });

        // 3) Estoque por lote, separado em disponível / reservado / vencido
        const { data: estoques, error: estErr } = await supabase
          .from("estoque_produto")
          .select(
            "lote_id, volume_total, status, validade, reservado_para_os_id, reservado_para_cliente_id, quantidade_reservada, expedido_em",
          )
          .in("lote_id", loteIds);
        if (estErr) throw estErr;

        const hoje = new Date().toISOString().slice(0, 10);
        (estoques ?? []).forEach((e: any) => {
          const bucket = porLote[e.lote_id];
          if (!bucket) return;
          // estoque_produto.volume_total já está em LITROS (diferente de envase.volume_por_unidade que é mL)
          const litros = Number(e.volume_total) || 0;
          if (!litros) return;
          const vencido = e.validade && e.validade < hoje;
          const expedido = !!e.expedido_em;
          const reservado =
            !!e.reservado_para_os_id ||
            !!e.reservado_para_cliente_id ||
            Number(e.quantidade_reservada || 0) > 0;
          if (vencido || expedido) {
            bucket.vencidoL += litros;
          } else if (reservado) {
            bucket.reservadoL += litros;
          } else if (e.status === "disponivel") {
            bucket.disponivelL += litros;
          } else {
            // outros status (em_qc, bloqueado, etc.) — conta como reservado/indisponível para fins de "livre"
            bucket.reservadoL += litros;
          }
        });
      }

      // 4) Agregação por microrganismo (Caso A/C) e consolidado (Caso B)
      const porMicrorganismo: Record<string, DisponibilidadeBucket> = {};
      const consolidadoSemMicro = emptyBucket();
      let temLoteConsolidado = false;

      lotes.forEach((l) => {
        const b = porLote[l.id];
        if (l.microrganismo_id) {
          const acc = (porMicrorganismo[l.microrganismo_id] ||= emptyBucket());
          acc.envasadoL += b.envasadoL;
          acc.reservadoL += b.reservadoL;
          acc.disponivelL += b.disponivelL;
          acc.vencidoL += b.vencidoL;
        } else if (l.produto_id) {
          temLoteConsolidado = true;
          consolidadoSemMicro.envasadoL += b.envasadoL;
          consolidadoSemMicro.reservadoL += b.reservadoL;
          consolidadoSemMicro.disponivelL += b.disponivelL;
          consolidadoSemMicro.vencidoL += b.vencidoL;
        }
      });

      return {
        lotes,
        porLote,
        porMicrorganismo,
        consolidadoSemMicro,
        temLoteConsolidado,
        temLote: lotes.length > 0,
      };
    },
  });

  const loteIds = (query.data?.lotes ?? []).map((l) => l.id);
  const loteIdsKey = loteIds.join(",");

  useEffect(() => {
    if (!osId) return;
    const channel = supabase.channel(`disp-os-${osId}`);

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["disponibilidade-os", osId] });
      qc.invalidateQueries({ queryKey: ["cockpit-laboratorio"] });
    };

    // programacao_producao filtrada pela OS — captura criação/remoção de lotes vinculados
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "programacao_producao", filter: `ordem_servico_id=eq.${osId}` },
      invalidate,
    );

    // Mudanças nas tabelas dependentes para os lotes desta OS
    if (loteIds.length > 0) {
      const filter = `lote_id=in.(${loteIds.join(",")})`;
      channel.on("postgres_changes", { event: "*", schema: "public", table: "envase", filter }, invalidate);
      channel.on("postgres_changes", { event: "*", schema: "public", table: "estoque_produto", filter }, invalidate);
      const lotesFilter = `id=in.(${loteIds.join(",")})`;
      channel.on("postgres_changes", { event: "*", schema: "public", table: "lotes", filter: lotesFilter }, invalidate);
    }

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [osId, loteIdsKey, qc]);

  return query;
}
