import { useMutation, useQuery } from "@tanstack/react-query";
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
      const { data, error } = await (supabase as any)
        .from("culturas")
        .select("id, nome, descricao, ativo, desativada_em")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
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

/**
 * Escrita de culturas pelo cliente foi revogada (migration
 * global_culturas_client_write_containment). Não há writer servidor auditado;
 * estas mutações falham explicitamente, sem chamar o banco, para nunca
 * reportar sucesso com 0 linhas.
 */
export const CULTURAS_WRITE_BLOCKED_MESSAGE =
  "Culturas são um cadastro global somente para consulta. Alterações não estão disponíveis.";

export function useSaveCultura() {
  return useMutation({
    mutationFn: async (_input: { id?: string; nome: string; descricao: string | null }): Promise<void> => {
      throw new Error(CULTURAS_WRITE_BLOCKED_MESSAGE);
    },
  });
}

export function useToggleCulturaAtivo() {
  return useMutation({
    mutationFn: async (_input: { id: string; ativo: boolean }): Promise<void> => {
      throw new Error(CULTURAS_WRITE_BLOCKED_MESSAGE);
    },
  });
}
