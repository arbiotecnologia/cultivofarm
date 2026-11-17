import { z } from "zod";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { supabase } from "@/integrations/supabase/client";
import { READ_CATALOG_FAMILIES, READ_FAMILY_LABEL } from "@/lib/catalogo/catalogFamilyRead";
import { useAuth } from "./useAuth";
const families = z.array(z.object({ value: z.enum(["biologico","quimico","fertilizante_adubo"]), label: z.string().min(1).max(80) }).strict()).max(3);
export function useActiveCatalogFamilies() {
  const { roles = [] } = useAuth();
  // Existing partner readers remain the only source for external catalogues.
  const internal = roles.length > 0 && !roles.some(role => ["parceiro_b2b", "parceiro_b2b_tecnico", "cliente", "superadmin"].includes(role));
  const query = useScopedPortalQuery({ queryKey: ["catalog-active-families"], enabled: internal, queryFn: async () => {
    const { data, error } = await supabase.rpc("tenant_catalog_active_families_v1" as never);
    if (error) throw error;
    return families.parse(data).flatMap(f => f.value && f.label ? [{ value: f.value, label: f.label }] : []);
  } });
  return { ...query, options: [{value:"todos",label:"Todas as famílias"},...(query.isSuccess ? query.data ?? [] : READ_CATALOG_FAMILIES.map(value => ({ value, label: READ_FAMILY_LABEL[value] }))),{value:"sem_classificacao",label:"Sem classificação"}] };
}