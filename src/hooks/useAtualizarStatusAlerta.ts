import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

export type StatusAlerta = "ativo" | "monitoramento" | "encerrado";
export interface AtualizarStatusAlertaArgs { id: string; status: StatusAlerta; expectedUpdatedAt: string }
export interface AtualizarStatusAlertaResult { id: string; status: StatusAlerta; updated_at: string }

export const STATUS_UNAVAILABLE = "Não foi possível acessar este alerta. Atualize a lista e verifique seu acesso.";
export const STATUS_CONFLICT = "Este alerta foi alterado por outra pessoa. Atualize a lista antes de tentar novamente.";
export const STATUS_UNCONFIRMED = "Resposta não confirmada. Atualize a lista antes de tentar novamente.";
export const STATUS_IN_FLIGHT = "A atualização do alerta já está em andamento.";
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const TS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;
const isTs = (v: unknown): v is string => typeof v === "string" && TS.test(v) && Number.isFinite(Date.parse(v));

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: "rpc_atualizar_status_alerta_agronomico_v1",
  args: { p_alerta_id: string; p_novo_status: string; p_updated_at_esperado: string },
) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;

/** Canonical status change with server CAS. Server authorizes; client fences and validates only. */
export function useAtualizarStatusAlerta() {
  const fence = useStorageAccessScope("alerta-agronomico-status");
  const qc = useQueryClient();
  const pending = useRef<symbol | null>(null);
  return useMutation<AtualizarStatusAlertaResult, Error, AtualizarStatusAlertaArgs>({
    retry: false,
    mutationFn: async (args) => {
      const valid = fence.capture();
      if (!valid() || !isUuid(args.id)) throw new Error(STATUS_UNAVAILABLE);
      if (pending.current) throw new Error(STATUS_IN_FLIGHT);
      // Exact server timestamp (microseconds preserved); never fabricated.
      if (!isTs(args.expectedUpdatedAt)) throw new Error(STATUS_CONFLICT);
      const ticket = Symbol("alerta-status");
      pending.current = ticket;
      try {
        const { data, error } = await rpc("rpc_atualizar_status_alerta_agronomico_v1", {
          p_alerta_id: args.id, p_novo_status: args.status, p_updated_at_esperado: args.expectedUpdatedAt,
        });
        if (!valid()) throw new Error(STATUS_UNAVAILABLE);
        if (error) {
          if (["42501", "PT403", "PT404", "P0002", "403", "404"].includes(error.code ?? "")) throw new Error(STATUS_UNAVAILABLE);
          if (error.code === "PT409") throw new Error(STATUS_CONFLICT);
          throw new Error("Não foi possível atualizar o alerta.");
        }
        const row = Array.isArray(data) && data.length === 1 && data[0] && typeof data[0] === "object" ? data[0] as Record<string, unknown> : null;
        if (!row || row.id !== args.id || row.status !== args.status || !isTs(row.updated_at) ||
          Date.parse(row.updated_at) <= Date.parse(args.expectedUpdatedAt)) throw new Error(STATUS_UNCONFIRMED);
        void qc.invalidateQueries({ queryKey: ["alertas_agronomicos"] });
        return { id: row.id as string, status: args.status, updated_at: row.updated_at };
      } finally {
        if (pending.current === ticket) pending.current = null;
      }
    },
  });
}
