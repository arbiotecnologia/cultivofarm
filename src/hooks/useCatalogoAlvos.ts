import { assertGlobalCatalogWriteBlocked } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ParentKind } from "@/hooks/useCatalogTargetsCrops";

export interface CatalogoAlvo {
  id: string;
  nome: string;
  nome_normalizado: string;
  tipo: string;
  nome_cientifico: string | null;
  descricao: string | null;
  sinonimos: string[];
  ativo: boolean;
}

export interface AlvoInput {
  nome: string;
  tipo: string;
  prioridade?: number;
  descricao?: string | null;
}

export interface BulkResult {
  criados_no_catalogo: number;
  vinculados: number;
  ignorados: number;
}

export function useCatalogoAlvos() {
  return useQuery({
    queryKey: ["catalogo-alvos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogo_alvos" as any)
        .select("id, nome, nome_normalizado, tipo, nome_cientifico, descricao, sinonimos, ativo")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return ((data ?? []) as unknown) as CatalogoAlvo[];
    },
  });
}

export function useBulkInserirAlvos(kind: ParentKind, parentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alvos: AlvoInput[]) => {
      assertGlobalCatalogWriteBlocked();
      const { data, error } = await supabase.rpc("bulk_inserir_alvos" as any, {
        p_kind: kind,
        p_parent_id: parentId,
        p_alvos: alvos as any,
      });
      if (error) throw error;
      return (data as unknown) as BulkResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog-targets", kind, parentId] });
      qc.invalidateQueries({ queryKey: ["catalogo-alvos"] });
    },
  });
}

export interface AlvoSugerido {
  nome: string;
  tipo: string;
  prioridade?: number;
  justificativa?: string;
}

export function useSugerirAlvosIA() {
  return useMutation({
    mutationFn: async (vars: { entidade_tipo: "produto" | "microrganismo"; entidade_id: string; max?: number }) => {
      const { data, error } = await supabase.functions.invoke("ai-sugerir-alvos", { body: vars });
      if (error) throw error;
      const alvos = (data?.alvos ?? []) as AlvoSugerido[];
      return alvos;
    },
  });
}

// Parser de texto colado: aceita "nome", "nome; tipo", "nome; tipo; prioridade"
export function parseAlvosTexto(texto: string, tipoPadrao: string, prioridadePadrao: number): AlvoInput[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map((l) => {
      const parts = l.split(/[;|\t]/).map((p) => p.trim());
      const nome = parts[0];
      const tipo = parts[1] || tipoPadrao;
      const prio = parts[2] ? Number(parts[2]) : prioridadePadrao;
      return {
        nome,
        tipo,
        prioridade: Number.isFinite(prio) && prio >= 1 && prio <= 10 ? prio : prioridadePadrao,
      };
    })
    .filter((a) => a.nome.length > 0);
}
