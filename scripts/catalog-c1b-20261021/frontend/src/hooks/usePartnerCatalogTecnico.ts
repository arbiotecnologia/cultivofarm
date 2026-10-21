import { useEffect } from "react";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { readCatalogFamily } from "@/lib/catalogo/catalogFamilyRead";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CatalogItem, UnidadePrecoPrincipal } from "./usePartnerCatalog";
import { resolverUnidadePreco, valorDaUnidade } from "@/lib/catalogo/unidades";

const TECNICO_CATALOG_KEY = ["partner-catalog-tecnico", "C1B_DUAL_TENANT_V1"] as const;

/**
 * Catálogo para o parceiro B2B TÉCNICO.
 *
 * Fonte: RPC segura `get_partner_catalog_tecnico_secure`, que retorna
 * apenas itens ativos e liberados para B2B, com valores de tabela e
 * sem qualquer aplicação de desconto do parceiro.
 */
export function usePartnerCatalogTecnico(enabled = true) {
  return useScopedPortalQuery({
    enabled,
    queryKey: TECNICO_CATALOG_KEY,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (signal): Promise<CatalogItem[]> => {
      const { data, error } = await supabase.rpc(
        "get_partner_catalog_tecnico_secure" as any, { p_catalog_v2: true } as any,
      ).abortSignal(signal);
      if (error) throw error;
      const rows = (data ?? []) as any[];

      /** `null` = sem preço resolvido / papel sem visibilidade financeira. Nunca 0. */
      const num = (v: unknown): number | null => {
        if (v == null || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      return rows.map((r) => {
        if (r.catalog_contract !== "C1B_DUAL_TENANT_V1") throw new Error("catalog_contract_unavailable");
        const valorDose = num(r.valor_dose_brl);
        const valorLitro =
          num(r.valor_litro_brl) ??
          (valorDose != null && valorDose > 0 ? valorDose * 10 : null);
        const valorHa = num(r.valor_ha_brl);
        const isProduto = r.item_tipo === "produto";
        const unidade: UnidadePrecoPrincipal = resolverUnidadePreco({
          tipo: isProduto ? "produto" : "microrganismo",
          unidadeBackend: r.unidade_preco_principal,
          valorHa,
          valorLitro,
          valorDose,
        });
        const precoBase =
          valorDaUnidade(unidade, { valorHa, valorLitro, valorDose }) ?? null;
        return {
          familia_catalogo: readCatalogFamily(r.familia_catalogo),
          item_id: r.item_id,
          item_tipo: r.item_tipo,
          product_id: isProduto ? r.item_id : null,
          nome: r.nome,
          codigo: r.codigo ?? null,
          descricao_curta: r.descricao_curta ?? null,
          preco_tabela: precoBase,
          desconto_percentual: 0,
          preco_parceiro: precoBase,
          valor_dose_brl: valorDose,
          valor_litro_brl: valorLitro,
          valor_ha_brl: valorHa,
          preco_tabela_dose: num(r.preco_tabela_dose),
          preco_tabela_litro: num(r.preco_tabela_litro),
          preco_tabela_ha: num(r.preco_tabela_ha),
          unidade_preco_principal: unidade,
          resumo_curto: r.resumo_curto ?? null,
          explicacao_b2b: r.explicacao_b2b ?? null,
          beneficios_principais: r.beneficios_principais ?? null,
          ficha_status: r.ficha_status ?? null,
          ficha_aprovada: !!r.ficha_aprovada,
        } as CatalogItem;
      });
    },
  });
}

/**
 * Assina alterações em `produtos` e `microrganismos` via Realtime e
 * invalida a query do catálogo do técnico para refetch automático.
 * Deve ser chamado uma vez, alto na árvore (ex.: NovoPedido).
 */
export function useRealtimePartnerCatalogTecnico() {
  const qc = useQueryClient();
  const actor = useStorageAccessScope("portal-query-actor");
  useEffect(() => {
    if (!actor.ready) return;
    const current = actor.capture();
    const invalidate = () => { if (current()) void qc.invalidateQueries({ predicate: q => q.queryKey[0] === TECNICO_CATALOG_KEY[0] && q.queryKey.at(-2) === actor.scope }); };
    const channel = supabase
      .channel("partner-catalog-tecnico-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "produtos" },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "microrganismos" },
        invalidate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, actor.ready, actor.scope]);
}
