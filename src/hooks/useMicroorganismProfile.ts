import { saveTenantCatalogRoot } from "@/lib/catalogo/tenantCatalogRoots";
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
      // Catálogo exclusivo por empresa: ficha técnica só pela RPC (empresa do pai no servidor, CAS, idempotência);
      // status/validação nunca vêm do formulário — aprovação segue o fluxo auditado próprio.
      const { id: _id, updated_at: _u, status_validacao, validado_por: _vp, validado_em: _ve, created_at: _c, created_by: _cb, updated_by: _ub, ...fields } = payload as any;
      // versão OBSERVADA na leitura montada (CAS); nunca uma releitura no momento do envio
      const observed = (qc.getQueryData(["micro-profile", payload.microrganismo_id]) as any)?.profile ?? null;
      const id = observed?.id ?? null;
      const updated_at = observed?.updated_at ?? null;
      const currentStatus = observed?.status_validacao ?? "rascunho";
      if (status_validacao !== undefined && status_validacao !== currentStatus) {
        throw new Error("Mudança de status da ficha ainda não está disponível no catálogo por empresa; o conteúdo não foi salvo.");
      }
      if (id) delete fields.microrganismo_id;
      const ack = await saveTenantCatalogRoot(supabase as any, "microorganism_technical_profiles", id ?? null, fields, id ? (updated_at ?? null) : null);
      return { ...payload, id: ack.id, updated_at: ack.updated_at };
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["micro-profile", v.microrganismo_id] });
      qc.invalidateQueries({ queryKey: ["catalogo-tecnico"] });
    },
  });
}
