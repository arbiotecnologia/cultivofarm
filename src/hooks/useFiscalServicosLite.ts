/**
 * Fase Fiscal 3.16.2-B — Hook leve de serviços (via perfis fiscais) para o
 * wizard. Como `service_fiscal_profiles` já contém `service_name`, usamos
 * esse cadastro diretamente. Retorna apenas metadados sanitizados.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FiscalServicoLite {
  id: string;
  nome: string;
  service_id: string | null;
  fiscal_profile: {
    lc116_item: string | null;
    cnae: string | null;
    municipal_taxation_code: string | null;
    national_taxation_code: string | null;
    incidence_municipality_ibge_code: string | null;
    iss_rate: number | null;
    iss_withheld_default: boolean;
    profile_status: string | null;
    fiscal_description_template: string | null;
  };
}

export function useFiscalServicosLite(search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: ["fiscal", "servicos-lite", term],
    queryFn: async (): Promise<FiscalServicoLite[]> => {
      let q = (supabase as any)
        .from("service_fiscal_profiles")
        .select(
          "id, service_id, service_name, lc116_item, cnae, municipal_taxation_code, national_taxation_code, incidence_municipality_ibge_code, iss_rate, iss_withheld_default, profile_status, fiscal_description_template",
        )
        .eq("is_active", true)
        .order("service_name", { ascending: true })
        .limit(20);
      if (term.length >= 2) {
        q = q.ilike("service_name", `%${term}%`);
      }
      const { data, error } = await q;
      if (error) return [];
      return (data ?? []).map((row: any) => ({
        id: row.id,
        nome: row.service_name ?? "(sem nome)",
        service_id: row.service_id,
        fiscal_profile: {
          lc116_item: row.lc116_item,
          cnae: row.cnae,
          municipal_taxation_code: row.municipal_taxation_code,
          national_taxation_code: row.national_taxation_code,
          incidence_municipality_ibge_code: row.incidence_municipality_ibge_code,
          iss_rate: row.iss_rate,
          iss_withheld_default: row.iss_withheld_default,
          profile_status: row.profile_status,
          fiscal_description_template: row.fiscal_description_template,
        },
      }));
    },
  });
}
