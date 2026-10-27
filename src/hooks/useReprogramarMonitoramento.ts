import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

export interface ReprogramarMonitoramentoArgs {
  id: string;
  date: string;
  expectedUpdatedAt: string;
}

const unavailable = "Não foi possível acessar este monitoramento. Atualize a lista e verifique seu acesso.";
const conflict = "Este monitoramento foi alterado. Atualize a lista antes de confirmar novamente; a data editada foi mantida.";

export function useReprogramarMonitoramento() {
  const fence = useStorageAccessScope("monitoramento-reprogramar");
  const qc = useQueryClient();
  const pending = useRef<symbol | null>(null);
  return useMutation({
    retry: false,
    mutationFn: async (args: ReprogramarMonitoramentoArgs) => {
      const valid = fence.capture();
      if (!valid()) throw new Error(unavailable);
      if (pending.current) throw new Error("A reprogramação já está em andamento.");
      // Preserve the exact server timestamp, including microseconds; never manufacture one.
      if (typeof args.expectedUpdatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(args.expectedUpdatedAt) || !Number.isFinite(Date.parse(args.expectedUpdatedAt))) throw new Error(conflict);
      const ticket = Symbol("monitoramento-save");
      pending.current = ticket;
      try {
        const { data, error } = await supabase.rpc("rpc_reprogramar_monitoramento_v1", {
          p_alerta_id: args.id, p_nova_data: args.date, p_expected_updated_at: args.expectedUpdatedAt,
        });
        if (!valid()) throw new Error(unavailable);
        if (error) {
          if (error.code === "PT409" || /conflict|conflito/i.test(error.message)) throw new Error(conflict);
          // Do not expose whether a foreign UUID exists.
          if (["42501", "PT403", "PT404", "P0002"].includes(error.code)) throw new Error(unavailable);
          throw new Error("Não foi possível reprogramar o monitoramento. A data editada foi mantida.");
        }
        // No null/error-shaped response is a confirmed update. JSON contract awaits audit.
        if (!data || typeof data !== "object" || Array.isArray(data) || data.success === false || data.ok === false || data.error || !((data.id === args.id || data.alerta_id === args.id) || data.success === true || data.ok === true)) throw new Error("Resposta não confirmada. Verifique o monitoramento antes de tentar novamente.");
        if (!valid()) throw new Error(unavailable);
        void qc.invalidateQueries({ queryKey: ["alertas-monitoramento-gestor"] });
        return data;
      } finally {
        if (pending.current === ticket) pending.current = null;
      }
    },
  });
}