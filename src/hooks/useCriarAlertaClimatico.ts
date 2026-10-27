import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

export interface CriarAlertaClimaticoArgs {
  fazendaId: string;
  talhaoId: string;
  tipoAlerta: "praga" | "doenca" | "daninha" | "nematoide" | "estresse_hidrico";
  nivelRisco: "baixo" | "medio" | "alto" | "critico";
  descricao: string;
}
export interface CriarAlertaClimaticoResult { id: string; criado: boolean }

export const ALERTA_UNAVAILABLE = "Não foi possível acessar esta fazenda ou talhão. Atualize a página e verifique seu acesso.";
export const ALERTA_UNCONFIRMED = "Resposta não confirmada. Verifique os alertas antes de tentar novamente.";
export const ALERTA_IN_FLIGHT = "A criação de alerta já está em andamento.";
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: "rpc_criar_alerta_climatico_v1",
  args: { p_fazenda_id: string; p_talhao_id: string; p_tipo_alerta: string; p_nivel_risco: string; p_descricao: string },
) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;

/** Canonical climatic alert creation. The RPC authorizes; this hook only fences and validates. */
export function useCriarAlertaClimatico() {
  const fence = useStorageAccessScope("alerta-climatico-criar");
  const qc = useQueryClient();
  const pending = useRef<symbol | null>(null);
  return useMutation<CriarAlertaClimaticoResult, Error, CriarAlertaClimaticoArgs>({
    retry: false,
    mutationFn: async (args) => {
      const valid = fence.capture();
      if (!valid()) throw new Error(ALERTA_UNAVAILABLE);
      if (pending.current) throw new Error(ALERTA_IN_FLIGHT);
      if (!isUuid(args.fazendaId) || !isUuid(args.talhaoId)) throw new Error(ALERTA_UNAVAILABLE);
      const ticket = Symbol("alerta-climatico");
      pending.current = ticket;
      try {
        const { data, error } = await rpc("rpc_criar_alerta_climatico_v1", {
          p_fazenda_id: args.fazendaId, p_talhao_id: args.talhaoId,
          p_tipo_alerta: args.tipoAlerta, p_nivel_risco: args.nivelRisco, p_descricao: args.descricao,
        });
        if (!valid()) throw new Error(ALERTA_UNAVAILABLE);
        if (error) {
          if (["42501", "PT403", "PT404", "P0002", "403", "404"].includes(error.code ?? "")) throw new Error(ALERTA_UNAVAILABLE);
          if (error.code === "PT409") throw new Error("Outro alerta está sendo criado para este talhão. Atualize a lista antes de tentar novamente.");
          throw new Error("Não foi possível criar o alerta.");
        }
        // RETURNS TABLE(id, criado): exactly one row with exactly these fields.
        const row = Array.isArray(data) && data.length === 1 ? data[0] as Record<string, unknown> : null;
        if (!row || typeof row !== "object" || Object.keys(row).length !== 2 || !isUuid(row.id) || typeof row.criado !== "boolean") {
          throw new Error(ALERTA_UNCONFIRMED);
        }
        void qc.invalidateQueries({ queryKey: ["alertas_agronomicos"] });
        return { id: row.id, criado: row.criado };
      } finally {
        if (pending.current === ticket) pending.current = null;
      }
    },
  });
}
