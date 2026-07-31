import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Cultura {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  desativada_em: string | null;
}

export const CULTURAS_QUERY_KEY = ["culturas-admin"] as const;

export function useCulturas() {
  return useQuery({
    queryKey: CULTURAS_QUERY_KEY,
    queryFn: async (): Promise<Cultura[]> => {
      const { data, error } = await supabase
        .from("culturas")
        .select("id, nome, descricao, ativo, desativada_em")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Cultura[];
    },
    staleTime: 60 * 1000,
  });
}

/** Mensagens amigáveis para erros conhecidos do cadastro de culturas. */
export function mapCulturaError(error: { message?: string; code?: string } | null): string {
  const msg = (error?.message || "").toLowerCase();
  if (error?.code === "23505" || msg.includes("culturas_nome_ci_uidx") || msg.includes("duplicate key")) {
    return "Já existe uma cultura com esse nome (a comparação ignora maiúsculas e espaços).";
  }
  if (msg.includes("cultura em uso")) {
    return "Cultura em uso: não é possível excluir. Desative a cultura em vez de excluir.";
  }
  if (error?.code === "42501" || msg.includes("row-level security")) {
    return "Você não tem permissão para alterar culturas.";
  }
  return error?.message || "Erro inesperado ao salvar a cultura.";
}

export function useSaveCultura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; nome: string; descricao: string | null }) => {
      const payload = { nome: input.nome.trim(), descricao: input.descricao };
      if (input.id) {
        const { error } = await supabase.from("culturas").update(payload).eq("id", input.id);
        if (error) throw new Error(mapCulturaError(error));
      } else {
        const { error } = await supabase.from("culturas").insert([payload]);
        if (error) throw new Error(mapCulturaError(error));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CULTURAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["culturas-options"] });
    },
  });
}

export function useToggleCulturaAtivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("culturas")
        .update({ ativo: input.ativo })
        .eq("id", input.id);
      if (error) throw new Error(mapCulturaError(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CULTURAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["culturas-options"] });
    },
  });
}
