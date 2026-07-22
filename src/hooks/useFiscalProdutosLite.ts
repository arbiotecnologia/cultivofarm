/**
 * Fase Fiscal 3.16.2-B — Hook leve de produtos com perfil fiscal para o
 * wizard. Retorna apenas metadados sanitizados; nunca senha, chave ou
 * campos administrativos. Se a RLS negar, devolve [].
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FiscalProdutoLite {
  id: string;
  nome: string;
  codigo: string | null;
  fiscal_profile: {
    ncm: string | null;
    cest: string | null;
    cfop_in_state: string | null;
    cfop_interstate: string | null;
    origin_code: string | null;
    icms_cst: string | null;
    icms_csosn: string | null;
    ipi_cst: string | null;
    pis_cst: string | null;
    cofins_cst: string | null;
    commercial_unit: string | null;
    profile_status: string | null;
  } | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = supabase.from.bind(supabase) as unknown as (t: string) => any;

export function useFiscalProdutosLite(search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: ["fiscal", "produtos-lite", term],
    queryFn: async (): Promise<FiscalProdutoLite[]> => {
      let q = anyFrom("produtos")
        .select(
          "id, nome, codigo, product_fiscal_profiles(ncm, cest, cfop_in_state, cfop_interstate, origin_code, icms_cst, icms_csosn, ipi_cst, pis_cst, cofins_cst, commercial_unit, profile_status)",
        )
        .eq("ativo", true)
        .order("nome", { ascending: true })
        .limit(20);
      if (term.length >= 2) {
        q = q.or(`nome.ilike.%${term}%,codigo.ilike.%${term}%`);
      }
      const { data, error } = await q;
      if (error) return [];
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
        const profileRaw = row.product_fiscal_profiles;
        const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
        return {
          id: String(row.id),
          nome: String(row.nome ?? ""),
          codigo: (row.codigo as string | null) ?? null,
          fiscal_profile: profile
            ? {
                ncm: (profile.ncm as string | null) ?? null,
                cest: (profile.cest as string | null) ?? null,
                cfop_in_state: (profile.cfop_in_state as string | null) ?? null,
                cfop_interstate: (profile.cfop_interstate as string | null) ?? null,
                origin_code: (profile.origin_code as string | null) ?? null,
                icms_cst: (profile.icms_cst as string | null) ?? null,
                icms_csosn: (profile.icms_csosn as string | null) ?? null,
                ipi_cst: (profile.ipi_cst as string | null) ?? null,
                pis_cst: (profile.pis_cst as string | null) ?? null,
                cofins_cst: (profile.cofins_cst as string | null) ?? null,
                commercial_unit: (profile.commercial_unit as string | null) ?? null,
                profile_status: (profile.profile_status as string | null) ?? null,
              }
            : null,
        };
      });
    },
  });
}
