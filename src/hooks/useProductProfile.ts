import { saveTenantCatalogRoot } from "@/lib/catalogo/tenantCatalogRoots";
import { assertGlobalCatalogWriteBlocked } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { useTenantCatalogEditor } from "./useTenantCatalogEditor";
import { useStorageAccessScope } from "./useStorageAccessScope";
import { useRef } from "react";
import {
  parseProductEvidenceEnvelope,
  matchingProductEvidence,
} from "@/lib/catalogo/productDocumentary";
import type { DocumentaryEvidence } from "@/lib/catalogo/documentarySuggestions";
import { parseProductProfileRows } from "@/lib/catalogo/productProfileSchema";
import type { ProductRelation } from "@/lib/catalogo/productRelations";
import { validateProductRelation } from "@/lib/catalogo/productRelations";

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
export async function fetchProductProfileBundle(
  client: any,
  produtoId: string,
  signal?: AbortSignal,
) {
  const [pRes, tRes, cRes, fRes] = await Promise.all(
    [
      client
        .from("product_technical_profiles")
        .select("*")
        .eq("produto_id", produtoId)
        .maybeSingle(),
      client
        .from("product_target_recommendations")
        .select("*")
        .eq("produto_id", produtoId)
        .eq("ativo", true)
        .order("prioridade"),
      client
        .from("product_crop_recommendations")
        .select("*")
        .eq("produto_id", produtoId)
        .eq("ativo", true),
      client
        .from("formulacoes")
        .select(
          "microrganismo_id, component_insumo_id, volume_ml, proporcao, microrganismos(id,nome,nome_cientifico,funcao_agronomica,tipo), insumo:produtos!formulacoes_component_insumo_id_fkey(nome)",
        )
        .eq("produto_id", produtoId),
    ].map((q) => (signal ? q.abortSignal(signal) : q)),
  );
  const erro = [pRes, tRes, cRes, fRes].find((r) => r?.error)?.error;
  if (erro) {
    throw new Error(
      erro.message || "Não foi possível carregar a ficha técnica",
    );
  }
  const parsed = parseProductProfileRows(
    pRes.data,
    tRes.data,
    cRes.data,
    fRes.data,
    produtoId,
  );
  const composicao: ProductComposicao[] = parsed.formulas.map((f) => ({
    microrganismo_id: f.microrganismo_id ?? null,
    component_insumo_id: f.component_insumo_id ?? null,
    volume_ml: f.volume_ml ?? null,
    proporcao: f.proporcao ?? null,
    microrganismo: f.microrganismos
      ? {
          id: f.microrganismos.id,
          nome: f.microrganismos.nome,
          nome_cientifico: f.microrganismos.nome_cientifico ?? null,
          funcao_agronomica: f.microrganismos.funcao_agronomica ?? null,
          tipo: f.microrganismos.tipo,
        }
      : null,
    insumo_nome: f.insumo?.nome ?? null,
  }));
  return {
    profile: parsed.profile as ProductProfile | null,
    targets: parsed.targets,
    crops: parsed.crops,
    composicao,
  };
}

export function useProductProfile(produtoId: string | null | undefined) {
  return useScopedPortalQuery({
    queryKey: ["product-profile", produtoId],
    enabled: !!produtoId,
    retry: false,
    queryFn: async (signal) => {
      if (!produtoId) throw new Error("Produto indisponível");
      return fetchProductProfileBundle(supabase as any, produtoId, signal);
    },
  });
}

export function useUpsertProductProfile() {
  const qc = useQueryClient();
  const editor = useTenantCatalogEditor();
  const actor = useStorageAccessScope("portal-query-actor");
  const attempt = useRef<{
    sig: string;
    key: string;
    scope: string;
    productId: string;
    definitive: boolean;
  } | null>(null);
  const busy = useRef(false);
  const mutation = useMutation({
    retry: false,
    onMutate: () => ({ current: editor.capture(), actorScope: actor.scope }),
    mutationFn: async (
      payload: Partial<ProductProfile> & {
        produto_id: string;
        relations?: ProductRelation[];
        documentaryEvidence?: DocumentaryEvidence[];
        observedProfile?: {
          id: string;
          updated_at: string;
          status_validacao: string;
        } | null;
      },
    ) => {
      const current = editor.capture();
      if (!editor.canEdit || !current())
        throw new Error("catalog_context_unavailable");
      if (busy.current) throw new Error("Aguarde o salvamento em andamento.");
      busy.current = true;
      try {
        // Catálogo exclusivo por empresa: ficha técnica só pela RPC (empresa do pai no servidor, CAS, idempotência);
        // status/validação nunca vêm do formulário — aprovação segue o fluxo auditado próprio.
        const {
          relations,
          documentaryEvidence,
          observedProfile,
          id: _id,
          updated_at: _u,
          status_validacao,
          validado_por: _vp,
          validado_em: _ve,
          created_at: _c,
          created_by: _cb,
          updated_by: _ub,
          ...fields
        } = payload as any;
        if (attempt.current?.scope !== editor.scope) attempt.current = null;
        if (attempt.current?.definitive)
          throw new Error(
            "Recusa confirmada: releia a ficha para reconciliar antes de retomar.",
          );
        // versão OBSERVADA na leitura montada (CAS); nunca uma releitura no momento do envio
        const observed =
          observedProfile !== undefined
            ? observedProfile
            : ((
                qc.getQueriesData({
                  queryKey: ["product-profile", payload.produto_id],
                  predicate: (q) => q.queryKey.at(-2) === actor.scope,
                })[0]?.[1] as any
              )?.profile ?? null);
        const id = observed?.id ?? null;
        const updated_at = observed?.updated_at ?? null;
        const currentStatus = observed?.status_validacao ?? "rascunho";
        if (
          status_validacao !== undefined &&
          status_validacao !== currentStatus
        ) {
          throw new Error(
            "Mudança de status da ficha ainda não está disponível no catálogo por empresa; o conteúdo não foi salvo.",
          );
        }
        if (id) delete fields.produto_id;
        if (documentaryEvidence !== undefined)
          fields.documentary_evidence = matchingProductEvidence(
            documentaryEvidence,
            fields,
            payload.produto_id,
          );
        if (relations?.length)
          fields.product_relations = relations.map(validateProductRelation);
        const sig = JSON.stringify([editor.scope, id, fields, updated_at]);
        if (attempt.current && attempt.current.sig !== sig)
          throw new Error(
            "Tentativa inconclusiva; rascunho preservado, não altere a intenção pendente.",
          );
        if (attempt.current?.sig !== sig)
          attempt.current = {
            sig,
            key: crypto.randomUUID(),
            scope: editor.scope,
            productId: payload.produto_id,
            definitive: false,
          };
        let ack;
        try {
          ack = await saveTenantCatalogRoot(
            supabase as any,
            "product_technical_profiles",
            id ?? null,
            fields,
            id ? (updated_at ?? null) : null,
            attempt.current.key,
          );
        } catch (error) {
          const code = (error as { serverCode?: string })?.serverCode;
          // SQL business refusals roll back. Network/timeout/invalid ACK remain uncertain.
          const definitive =
            !!code &&
            (code === "PT409" ||
              /^(22|23|28|42)/.test(code) ||
              code === "P0002");
          if (attempt.current && definitive) attempt.current.definitive = true;
          throw Object.assign(
            error instanceof Error
              ? error
              : new Error("Salvamento não confirmado"),
            { definitive },
          );
        }
        if (!current()) throw new Error("catalog_context_changed");
        attempt.current = null;
        return { ...payload, id: ack.id, updated_at: ack.updated_at };
      } finally {
        busy.current = false;
      }
    },
    onSuccess: (_d, v, context) => {
      if (!context?.current()) return;
      return qc.invalidateQueries({
        predicate: (q) =>
          [
            "product-profile",
            "product-ficha-children",
            "product-documentary-evidence",
            "tenant-product-details",
            "catalogo-tecnico",
          ].includes(String(q.queryKey[0])) &&
          q.queryKey.at(-2) === context.actorScope,
      });
    },
  });
  return {
    ...mutation,
    reconcile: async (productId: string) => {
      if (
        !attempt.current?.definitive ||
        attempt.current.productId !== productId ||
        attempt.current.scope !== editor.scope ||
        busy.current
      )
        throw new Error(
          "Tentativa incerta: repita a mesma intenção; não reconcilie sem recusa definitiva.",
        );
      const current = editor.capture();
      const fresh = await fetchProductProfileBundle(supabase, productId);
      if (!current()) throw new Error("catalog_context_changed");
      attempt.current = null;
      mutation.reset();
      return fresh;
    },
  };
}

/** Additive read: only an exact pre-install absence means no documentary extension. */
export function useProductDocumentaryEvidence(
  productId: string | undefined,
  enabled: boolean,
) {
  const query = useScopedPortalQuery({
    queryKey: ["product-documentary-evidence", productId],
    enabled: enabled && !!productId,
    retry: false,
    queryFn: async (signal) => {
      const { data, error } = await (supabase as any)
        .rpc("tenant_product_documentary_read_v1", { p_product_id: productId })
        .abortSignal(signal);
      if (
        error?.code === "PGRST202" &&
        error.message?.includes("tenant_product_documentary_read_v1")
      )
        return {
          product_id: productId,
          profile_id: null,
          profile_revision: null,
          evidence: [],
        };
      if (error) throw error;
      if (!productId) throw new Error("Produto indisponível");
      return parseProductEvidenceEnvelope(data, productId);
    },
  });
  return {
    ...query,
    data: query.data?.evidence,
    profileRevision: query.data?.profile_revision,
    profileId: query.data?.profile_id,
  };
}
