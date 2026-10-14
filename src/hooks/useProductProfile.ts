import { assertGlobalCatalogWriteBlocked } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProductProfile {
  id: string;
  produto_id: string;
  resumo_curto: string | null;
  beneficio_combinado: string | null;
  explicacao_tecnica: string | null;
  explicacao_produtor: string | null;
  explicacao_b2b: string | null;
  indicacoes_uso: string | null;
  janela_aplicacao: string | null;
  cuidados_aplicacao: string | null;
  compatibilidade: string | null;
  observacoes_regulatorias: string | null;
  status_validacao: "rascunho" | "em_revisao" | "aprovado" | "arquivado";
  validado_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductTarget {
  id: string;
  produto_id: string;
  alvo_nome: string;
  alvo_tipo: string;
  descricao: string | null;
  prioridade: number;
  ativo: boolean;
}

export interface ProductCrop {
  id: string;
  produto_id: string;
  cultura_id: string | null;
  cultura_nome: string | null;
  fase_recomendada: string | null;
  objetivo_uso: string | null;
  dose_recomendada: string | null;
  observacao: string | null;
  ativo: boolean;
}

export interface ProductComposicao {
  microrganismo_id: string | null;
  component_insumo_id: string | null;
  volume_ml: number | null;
  proporcao: number | null;
  microrganismo: {
    id: string;
    nome: string;
    nome_cientifico: string | null;
    funcao_agronomica: string | null;
    tipo: string;
  } | null;
  insumo_nome: string | null;
}

/** CAT-10 — lança se QUALQUER consulta falhar; nunca degrada erro em vazio. */
export async function fetchProductProfileBundle(client: any, produtoId: string) {
  const [pRes, tRes, cRes, fRes] = await Promise.all([
    client.from("product_technical_profiles").select("*").eq("produto_id", produtoId).maybeSingle(),
    client.from("product_target_recommendations").select("*").eq("produto_id", produtoId).eq("ativo", true).order("prioridade"),
    client.from("product_crop_recommendations").select("*").eq("produto_id", produtoId).eq("ativo", true),
    client
      .from("formulacoes")
      .select("microrganismo_id, component_insumo_id, volume_ml, proporcao, microrganismos(id,nome,nome_cientifico,funcao_agronomica,tipo), insumo:produtos!formulacoes_component_insumo_id_fkey(nome)")
      .eq("produto_id", produtoId),
  ]);
  const erro = [pRes, tRes, cRes, fRes].find((r) => r?.error)?.error;
  if (erro) {
    throw new Error(erro.message || "Não foi possível carregar a ficha técnica");
  }
  const composicao: ProductComposicao[] = ((fRes.data ?? []) as any[]).map((f) => ({
    microrganismo_id: f.microrganismo_id,
    component_insumo_id: f.component_insumo_id,
    volume_ml: f.volume_ml,
    proporcao: f.proporcao,
    microrganismo: f.microrganismos
      ? {
          id: f.microrganismos.id,
          nome: f.microrganismos.nome,
          nome_cientifico: f.microrganismos.nome_cientifico,
          funcao_agronomica: f.microrganismos.funcao_agronomica,
          tipo: f.microrganismos.tipo,
        }
      : null,
    insumo_nome: f.insumo?.nome ?? null,
  }));
  return {
    profile: (pRes.data as ProductProfile | null) ?? null,
    targets: (tRes.data ?? []) as any[],
    crops: (cRes.data ?? []) as any[],
    composicao,
  };
}

export function useProductProfile(produtoId: string | null | undefined) {
  return useQuery({
    queryKey: ["product-profile", produtoId],
    enabled: !!produtoId,
    retry: false,
    queryFn: () => fetchProductProfileBundle(supabase as any, produtoId!),
  });
}


export function useUpsertProductProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ProductProfile> & { produto_id: string }) => {
      assertGlobalCatalogWriteBlocked();
      const { data, error } = await (supabase as any)
        .from("product_technical_profiles")
        .upsert(payload as any, { onConflict: "produto_id" })
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["product-profile", v.produto_id] });
      qc.invalidateQueries({ queryKey: ["catalogo-tecnico"] });
    },
  });
}
