import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useExecutivoArquivarRelatorio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; motivo?: string }) => {
      const { data, error } = await supabase.rpc(
        "rpc_executivo_arquivar_relatorio" as any,
        { p_relatorio_id: params.id, p_motivo: params.motivo ?? null }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Relatório arquivado.");
      qc.invalidateQueries({ queryKey: ["executivo-relatorios"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Falha ao arquivar"),
  });
}
