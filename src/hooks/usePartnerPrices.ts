import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { round2 } from "@/lib/catalogo/formatUnidades";

export type PartnerPriceItemTipo = "produto" | "microrganismo";

export interface PartnerPriceRow {
  tipo: PartnerPriceItemTipo;
  item_id: string;
  item_nome: string;
  item_codigo: string | null;
  price_id: string | null;
  preco_tabela: number;
  desconto_percentual: number;
  preco_final: number;
  updated_at: string | null;
  /** Para produtos: dose mL/ha — necessário p/ calcular equivalente dose 100 mL e litro */
  dose_ml_ha: number | null;
}

// Compat: campos legados (caso outro local use a forma antiga só de produto)
export interface ProductPriceRow extends PartnerPriceRow {
  product_id: string;
  product_nome: string;
  product_codigo: string | null;
}

export function calcFinal(preco: number, desc: number): number {
  return Math.round(preco * (1 - (desc || 0) / 100) * 100) / 100;
}

/** Para produto: valor por dose 100 mL = preço_ha / (dose_ml_ha / 100) */
export function calcEquivDose100mlFromHa(precoHa: number, doseMlHa: number | null): number | null {
  if (!doseMlHa || doseMlHa <= 0 || !precoHa) return null;
  return precoHa / (doseMlHa / 100);
}

/** Para produto: valor por litro = valor por dose 100 mL × 10 */
export function calcEquivLitroFromHa(precoHa: number, doseMlHa: number | null): number | null {
  const dose = calcEquivDose100mlFromHa(precoHa, doseMlHa);
  return dose == null ? null : dose * 10;
}

/** Para microrganismo: valor por litro = dose 100 mL × 10 */
export function calcLitroFromDose100ml(precoDose: number): number {
  return precoDose * 10;
}

export function usePartnerPrices(partnerId: string | null | undefined) {
  return useScopedPortalQuery({
    queryKey: ["partner-prices", partnerId],
    enabled: !!partnerId,
    queryFn: async (): Promise<PartnerPriceRow[]> => {
      if (!partnerId) return [];
      const [produtosRes, microsRes, pricesRes] = await Promise.all([
        (supabase as any)
          .from("produtos")
          .select("id, nome, codigo, valor_ha_brl, valor_dose_brl, valor_litro_brl, dose_ml_ha")
          .eq("ativo", true)
          .order("nome"),
        (supabase as any)
          .from("microrganismos")
          .select("id, nome, codigo, valor_dose_brl")
          .eq("ativo", true)
          .order("nome"),
        (supabase as any)
          .from("partner_product_prices")
          .select("*")
          .eq("partner_id", partnerId)
          .eq("ativo", true),
      ]);
      if (produtosRes.error) throw produtosRes.error;
      if (microsRes.error) throw microsRes.error;
      if (pricesRes.error) throw pricesRes.error;

      const byProduct = new Map(
        (pricesRes.data ?? [])
          .filter((p: any) => p.product_id)
          .map((p: any) => [p.product_id as string, p]),
      );
      const byMicro = new Map(
        (pricesRes.data ?? [])
          .filter((p: any) => p.microrganismo_id)
          .map((p: any) => [p.microrganismo_id as string, p]),
      );

      const produtos: PartnerPriceRow[] = (produtosRes.data ?? []).map((p: any) => {
        const ex = byProduct.get(p.id) as any;
        const valorHa = Number(p.valor_ha_brl ?? 0);
        const valorDose = Number(p.valor_dose_brl ?? 0);
        const valorLitro = Number(p.valor_litro_brl ?? 0);
        const doseMlHa = Number(p.dose_ml_ha ?? 0);
        // Base sugerida: usa valor_ha_brl quando disponível; senão deriva de valor_dose_brl
        // (R$/100 mL × dose_ml_ha/100) ou de valor_litro_brl (R$/L × dose_ml_ha/1000).
        const base =
          valorHa > 0
            ? valorHa
            : valorDose > 0 && doseMlHa > 0
              ? round2((doseMlHa / 100) * valorDose)
              : valorLitro > 0 && doseMlHa > 0
                ? round2((doseMlHa / 1000) * valorLitro)
                : 0;
        return {
          tipo: "produto",
          item_id: p.id,
          item_nome: p.nome,
          item_codigo: p.codigo,
          price_id: ex?.id ?? null,
          preco_tabela: Number(ex?.preco_tabela ?? base),
          desconto_percentual: Number(ex?.desconto_percentual ?? 0),
          preco_final: Number(ex?.preco_final ?? base),
          updated_at: ex?.updated_at ?? null,
          dose_ml_ha: p.dose_ml_ha ?? null,
        };
      });

      const micros: PartnerPriceRow[] = (microsRes.data ?? []).map((m: any) => {
        const ex = byMicro.get(m.id) as any;
        const base = Number(m.valor_dose_brl ?? 0);
        return {
          tipo: "microrganismo",
          item_id: m.id,
          item_nome: m.nome,
          item_codigo: m.codigo,
          price_id: ex?.id ?? null,
          preco_tabela: Number(ex?.preco_tabela ?? base),
          desconto_percentual: Number(ex?.desconto_percentual ?? 0),
          preco_final: Number(ex?.preco_final ?? base),
          updated_at: ex?.updated_at ?? null,
          dose_ml_ha: null,
        };
      });

      return [...produtos, ...micros];
    },
  });
}

export interface PriceUpsert {
  tipo: PartnerPriceItemTipo;
  item_id: string;
  preco_tabela: number;
  desconto_percentual: number;
  preco_final: number;
}

export function useSavePartnerPrices(partnerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: PriceUpsert[]) => {
      if (!rows.length) return;
      const produtos = rows
        .filter((r) => r.tipo === "produto")
        .map((r) => ({
          partner_id: partnerId,
          product_id: r.item_id,
          preco_tabela: r.preco_tabela,
          desconto_percentual: r.desconto_percentual,
          preco_final: r.preco_final,
          ativo: true,
        }));
      const micros = rows
        .filter((r) => r.tipo === "microrganismo")
        .map((r) => ({
          partner_id: partnerId,
          microrganismo_id: r.item_id,
          preco_tabela: r.preco_tabela,
          desconto_percentual: r.desconto_percentual,
          preco_final: r.preco_final,
          ativo: true,
        }));
      if (produtos.length) {
        const { error } = await (supabase as any)
          .from("partner_product_prices")
          .upsert(produtos, { onConflict: "partner_id,product_id" });
        if (error) throw error;
      }
      if (micros.length) {
        const { error } = await (supabase as any)
          .from("partner_product_prices")
          .upsert(micros, { onConflict: "partner_id,microrganismo_id" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-prices", partnerId] });
      toast.success("Tabela de preços salva");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar tabela"),
  });
}
