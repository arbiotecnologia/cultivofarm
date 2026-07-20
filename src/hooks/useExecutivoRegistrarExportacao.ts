import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useExecutivoRegistrarExportacao() {
  return useMutation({
    mutationFn: async (params: { id: string; tipo: "pdf" | "csv" | "print" }) => {
      const { error } = await supabase.rpc(
        "rpc_executivo_exportar_relatorio_evento" as any,
        { p_relatorio_id: params.id, p_tipo_exportacao: params.tipo }
      );
      if (error) throw error;
    },
  });
}
