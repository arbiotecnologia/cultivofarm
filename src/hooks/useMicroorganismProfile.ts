import { assertGlobalCatalogWriteBlocked } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MicroProfile {
  id: string;
  microrganismo_id: string;
  resumo_curto: string | null;
  mecanismo_acao: string | null;
  beneficios_agronomicos: string | null;
  explicacao_tecnica: string | null;
  explicacao_produtor: string | null;
  explicacao_b2b: string | null;
  indicacoes_uso: string | null;
  cuidados_aplicacao: string | null;
  compatibilidade: string | null;
  armazenamento: string | null;
  observacoes_regulatorias: string | null;
  status_validacao: "rascunho" | "em_revisao" | "aprovado" | "arquivado";
  validado_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface MicroTarget {
  id: string;
  microrganismo_id: string;
  alvo_nome: string;
  alvo_tipo: string;
  descricao: string | null;
  prioridade: number;
  ativo: boolean;
}

export interface MicroCrop {
  id: string;
  microrganismo_id: string;
  cultura_id: string | null;
  cultura_nome: string | null;
  fase_recomendada: string | null;
  objetivo_uso: string | null;
  observacao: string | null;
  ativo: boolean;
}

/** CAT-10 — lança se QUALQUER consulta falhar; nunca degrada erro em vazio. */
export async function fetchMicroProfileBundle(client: any, microId: string) {
  const [pRes, tRes, cRes] = await Promise.all([
    client.from("microorganism_technical_profiles").select("*").eq("microrganismo_id", microId).maybeSingle(),
    client.from("microorganism_targets").select("*").eq("microrganismo_id", microId).eq("ativo", true).order("prioridade"),
    client.from("microorganism_crop_recommendations").select("*").eq("microrganismo_id", microId).eq("ativo", true),
  ]);
  const erro = [pRes, tRes, cRes].find((r) => r?.error)?.error;
  if (erro) {
    throw new Error(erro.message || "Não foi possível carregar a ficha técnica");
  }
  return {
    profile: (pRes.data as MicroProfile | null) ?? null,
    targets: (tRes.data ?? []) as any[],
    crops: (cRes.data ?? []) as any[],
  };
}

export function useMicroorganismProfile(microId: string | null | undefined) {
  return useQuery({
    queryKey: ["micro-profile", microId],
    enabled: !!microId,
    retry: false,
    queryFn: () => fetchMicroProfileBundle(supabase as any, microId!),
  });
}


export function useUpsertMicroProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<MicroProfile> & { microrganismo_id: string }) => {
      assertGlobalCatalogWriteBlocked();
      const { data, error } = await (supabase as any)
        .from("microorganism_technical_profiles")
        .upsert(payload as any, { onConflict: "microrganismo_id" })
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["micro-profile", v.microrganismo_id] });
      qc.invalidateQueries({ queryKey: ["catalogo-tecnico"] });
    },
  });
}
