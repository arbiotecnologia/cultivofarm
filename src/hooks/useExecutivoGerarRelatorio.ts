import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GerarRelatorioInput {
  tipo: string;
  filtros: Record<string, any>;
  titulo?: string | null;
}

export function useExecutivoGerarRelatorio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GerarRelatorioInput) => {
      const { data, error } = await supabase.rpc(
        "rpc_executivo_gerar_relatorio" as any,
        {
          p_tipo: input.tipo,
          p_filtros: input.filtros as any,
          p_titulo: input.titulo ?? null,
        }
      );
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      toast.success("Relatório gerado com sucesso.");
      qc.invalidateQueries({ queryKey: ["executivo-relatorios"] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Falha ao gerar relatório");
    },
  });
}
