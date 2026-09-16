import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hexToHsl } from "@/lib/utils";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import logoCultivoFarm from "@/assets/logo-cultivofarm.png.asset.json";

export type BrandingKind = "cliente" | "parceiro";
export interface PortalBranding {
  name: string;
  logoUrl: string;
  primaryColor: string;
  customName: string | null;
  customLogoUrl: string | null;
  customPrimaryColor: string | null;
}

export function useBranding(kind: BrandingKind, entityId: string | null, fallbackName?: string | null) {
  const { config, defaults } = useSystemConfig();
  const query = useQuery({
    queryKey: ["portal-branding", kind, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const table = kind === "cliente" ? "clientes" : "partner_accounts";
      const { data, error } = await (supabase as any).from(table)
        .select("marca_nome, marca_logo_url, marca_cor_primaria").eq("id", entityId).single();
      if (error) throw error;
      return data as { marca_nome: string | null; marca_logo_url: string | null; marca_cor_primaria: string | null };
    },
  });
  const systemName = config?.nome_empresa || defaults.nome_empresa;
  const branding: PortalBranding = {
    name: query.data?.marca_nome || fallbackName || systemName,
    logoUrl: query.data?.marca_logo_url || config?.logo_url || logoCultivoFarm.url,
    primaryColor: query.data?.marca_cor_primaria || "#087f5b",
    customName: query.data?.marca_nome ?? null,
    customLogoUrl: query.data?.marca_logo_url ?? null,
    customPrimaryColor: query.data?.marca_cor_primaria ?? null,
  };
  useEffect(() => {
    if (!query.data?.marca_cor_primaria) return;
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--primary");
    root.style.setProperty("--primary", hexToHsl(query.data.marca_cor_primaria));
    return () => root.style.setProperty("--primary", previous || config?.cor_primaria || defaults.cor_primaria);
  }, [query.data?.marca_cor_primaria, config?.cor_primaria, defaults.cor_primaria]);
  return { ...query, branding };
}
