import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolverUnidadePreco, type UnidadePreco } from "@/lib/catalogo/unidades";
import { round2 } from "@/lib/catalogo/formatUnidades";

export type CatalogItemTipo = "produto" | "microrganismo";
/** Unidade canônica de preço (ver src/lib/catalogo/unidades.ts). */
export type UnidadePrecoPrincipal = UnidadePreco;

export interface CatalogItem {
  item_id: string;
  item_tipo: CatalogItemTipo;
  product_id: string | null;
  nome: string;
  codigo: string | null;
  descricao_curta: string | null;
  /**
   * IMPORTANTE (Fase 1 — motor canônico): `null` significa "sem preço resolvido"
   * (sob consulta). NUNCA converter para 0 — zero é preço válido e falsearia o
   * catálogo. O backend já devolve NULL quando não há regra aplicável ou quando
   * o papel não pode ver valor financeiro (parceiro_b2b_tecnico).
   */
  preco_tabela: number | null;
  desconto_percentual: number;
  preco_parceiro: number | null;
  /** Valor da dose 100 mL já com desconto do parceiro (quando disponível) */
  valor_dose_brl: number | null;
  /** Valor por litro já com desconto do parceiro (quando disponível) */
  valor_litro_brl: number | null;
  /** Custo por hectare já com desconto do parceiro (apenas produtos) */
  valor_ha_brl: number | null;
  /** Preço cheio (sem desconto) por dose 100 mL — derivado de valor_dose_brl + desconto. */
  preco_tabela_dose: number | null;
  /** Preço cheio (sem desconto) por litro — derivado de valor_litro_brl + desconto. */
  preco_tabela_litro: number | null;
  /** Preço cheio (sem desconto) por hectare — derivado de valor_ha_brl + desconto (apenas produtos). */
  preco_tabela_ha: number | null;
  /** Unidade principal exibida ao parceiro */
  unidade_preco_principal: UnidadePrecoPrincipal;
  resumo_curto: string | null;
  explicacao_b2b: string | null;
  beneficios_principais: string | null;
  ficha_status: string | null;
  ficha_aprovada: boolean;
}

const cheio = (final: number, descPct: number): number => {
  if (!Number.isFinite(final) || final <= 0) return 0;
  if (descPct <= 0.0001 || descPct >= 100) return final;
  return round2(final / (1 - descPct / 100));
};

export function usePartnerCatalog(partnerId: string | null | undefined) {
  return useQuery({
    queryKey: ["partner-catalog-secure", partnerId],
    enabled: !!partnerId,
    queryFn: async (): Promise<CatalogItem[]> => {
      const { data, error } = await supabase.rpc(
        "get_partner_catalog_secure" as any,
        { p_partner_id: partnerId! },
      );
      if (error) throw error;
      return (data ?? []).map((r: any) => {
        const tipo = (r.item_tipo ?? "produto") as CatalogItemTipo;
        const precoFallback = Number(r.preco_parceiro ?? 0);
        const valorDose = Number(r.valor_dose_brl ?? 0);
        const valorLitro = Number(r.valor_litro_brl ?? (valorDose > 0 ? valorDose * 10 : 0));
        const valorHaRaw = r.valor_ha_brl == null ? null : Number(r.valor_ha_brl);
        const unidade: UnidadePrecoPrincipal = resolverUnidadePreco({
          tipo,
          unidadeBackend: r.unidade_preco_principal,
          valorHa: valorHaRaw,
          valorLitro: valorLitro,
          valorDose: valorDose,
        });
        const descPct = Number(r.desconto_percentual ?? 0);
        return {
          item_id: r.item_id,
          item_tipo: tipo,
          product_id: r.product_id ?? null,
          nome: r.produto_nome,
          codigo: r.produto_codigo,
          descricao_curta: r.descricao_curta ?? null,
          preco_tabela: Number(r.preco_tabela ?? 0),
          desconto_percentual: descPct,
          preco_parceiro: precoFallback,
          valor_dose_brl: valorDose,
          valor_litro_brl: valorLitro,
          valor_ha_brl: valorHaRaw,
          preco_tabela_dose: cheio(valorDose, descPct),
          preco_tabela_litro: cheio(valorLitro, descPct),
          preco_tabela_ha: valorHaRaw == null ? null : cheio(valorHaRaw, descPct),
          unidade_preco_principal: unidade,
          resumo_curto: r.resumo_curto ?? null,
          explicacao_b2b: r.explicacao_b2b ?? null,
          beneficios_principais: r.beneficios_principais ?? null,
          ficha_status: r.ficha_status ?? null,
          ficha_aprovada: !!r.ficha_aprovada,
        };
      });
    },
  });
}
