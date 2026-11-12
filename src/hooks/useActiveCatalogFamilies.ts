import { z } from "zod";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_FAMILY_TABS } from "@/lib/catalogo/productFamilies";
const families = z.array(z.object({ value: z.enum(["biologico","quimico","fertilizante_adubo"]), label: z.string().min(1).max(80) }).strict()).max(3);
export function useActiveCatalogFamilies() {
  const query = useScopedPortalQuery({ queryKey: ["catalog-active-families"], queryFn: async () => {
    const { data, error } = await supabase.rpc("tenant_catalog_active_families_v1" as never);
    if (error) throw error;
    return families.parse(data).flatMap(f => f.value && f.label ? [{ value: f.value, label: f.label }] : []);
  } });
  return { ...query, options: [{value:"todos",label:"Todas as famílias"},...(query.isSuccess ? query.data ?? [] : PRODUCT_FAMILY_TABS.filter(t => t.value !== "todos" && t.value !== "sem_classificacao")),{value:"sem_classificacao",label:"Sem classificação"}] };
}