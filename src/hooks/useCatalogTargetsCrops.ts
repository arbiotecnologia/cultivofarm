import { assertGlobalCatalogWriteBlocked } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ParentKind = "micro" | "produto";

const targetTable = (k: ParentKind) =>
  k === "micro" ? "microorganism_targets" : "product_target_recommendations";
const cropTable = (k: ParentKind) =>
  k === "micro" ? "microorganism_crop_recommendations" : "product_crop_recommendations";
const parentCol = (k: ParentKind) => (k === "micro" ? "microrganismo_id" : "produto_id");

export const TARGET_TYPES = [
  "praga",
  "doenca",
  "nematoide",
  "nutricao",
  "solo",
  "estresse",
  "crescimento",
] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export interface TargetRow {
  id: string;
  alvo_nome: string;
  alvo_tipo: string;
  descricao: string | null;
  prioridade: number;
  ativo: boolean;
}

export interface CropRow {
  id: string;
  cultura_id: string | null;
  cultura_nome: string | null;
  fase_recomendada: string | null;
  objetivo_uso: string | null;
  dose_recomendada?: string | null;
  observacao: string | null;
  ativo: boolean;
}

export function useTargets(kind: ParentKind, parentId: string | null | undefined) {
  return useQuery({
    queryKey: ["catalog-targets", kind, parentId],
    enabled: !!parentId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(targetTable(kind) as any)
        .select("id, alvo_nome, alvo_tipo, descricao, prioridade, ativo")
        .eq(parentCol(kind), parentId!)
        .order("prioridade", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown) as TargetRow[];
    },
  });
}

export function useUpsertTarget(kind: ParentKind, parentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<TargetRow> & { alvo_nome: string; alvo_tipo: string }) => {
      assertGlobalCatalogWriteBlocked();
      const row: any = { ...payload, [parentCol(kind)]: parentId };
      if (payload.id) {
        const { error } = await (supabase as any).from(targetTable(kind) as any).update(row).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from(targetTable(kind) as any).insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog-targets", kind, parentId] }),
  });
}

export function useDeactivateTarget(kind: ParentKind, parentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      assertGlobalCatalogWriteBlocked();
      const { error } = await (supabase as any).from(targetTable(kind) as any).update({ ativo: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog-targets", kind, parentId] }),
  });
}

export function useCrops(kind: ParentKind, parentId: string | null | undefined) {
  return useQuery({
    queryKey: ["catalog-crops", kind, parentId],
    enabled: !!parentId,
    queryFn: async () => {
      const cols =
        kind === "produto"
          ? "id, cultura_id, cultura_nome, fase_recomendada, objetivo_uso, dose_recomendada, observacao, ativo"
          : "id, cultura_id, cultura_nome, fase_recomendada, objetivo_uso, observacao, ativo";
      const { data, error } = await (supabase as any)
        .from(cropTable(kind) as any)
        .select(cols)
        .eq(parentCol(kind), parentId!);
      if (error) throw error;
      return ((data ?? []) as unknown) as CropRow[];
    },
  });
}

export function useUpsertCrop(kind: ParentKind, parentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<CropRow>) => {
      assertGlobalCatalogWriteBlocked();
      const row: any = { ...payload, [parentCol(kind)]: parentId };
      if (kind === "micro") delete row.dose_recomendada;
      if (payload.id) {
        const { error } = await (supabase as any).from(cropTable(kind) as any).update(row).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from(cropTable(kind) as any).insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog-crops", kind, parentId] }),
  });
}

export function useDeactivateCrop(kind: ParentKind, parentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      assertGlobalCatalogWriteBlocked();
      const { error } = await (supabase as any).from(cropTable(kind) as any).update({ ativo: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog-crops", kind, parentId] }),
  });
}

export function useCulturasOptions() {
  return useQuery({
    queryKey: ["culturas-options"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("culturas").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
}
