import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSystemConfig } from "@/hooks/useSystemConfig";

export type BrandingScope = "cliente" | "parceiro";

export interface PortalBranding {
  nome: string | null;
  logoUrl: string | null;
  corPrimaria: string | null;
}

const TABELA: Record<BrandingScope, string> = {
  cliente: "clientes",
  parceiro: "partner_accounts",
};

/** Converte #RRGGBB em "H S% L%" (formato usado pelos tokens do tema). */
export function hexToHslTokens(hex: string): string | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Marca do contexto (cliente/parceiro) já resolvida com fallback para a marca geral. */
export function usePortalBranding(scope: BrandingScope, id: string | null | undefined) {
  const { config, defaults } = useSystemConfig();

  const query = useQuery({
    queryKey: ["portal-branding", scope, id],
    enabled: !!id,
    queryFn: async (): Promise<PortalBranding> => {
      const { data, error } = await (supabase as any)
        .from(TABELA[scope])
        .select("marca_nome, marca_logo_url, marca_cor_primaria")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return {
        nome: (data as any)?.marca_nome ?? null,
        logoUrl: (data as any)?.marca_logo_url ?? null,
        corPrimaria: (data as any)?.marca_cor_primaria ?? null,
      };
    },
  });

  const nomeGeral = config?.nome_empresa || defaults.nome_empresa;
  const nome = query.data?.nome || nomeGeral;
  const logoUrl = query.data?.logoUrl || config?.logo_url || null;
  const corPrimaria = query.data?.corPrimaria ?? null;

  useEffect(() => {
    if (!corPrimaria) return;
    const tokens = hexToHslTokens(corPrimaria);
    if (!tokens) return;
    const root = document.documentElement;
    const anterior = root.style.getPropertyValue("--primary");
    root.style.setProperty("--primary", tokens);
    return () => {
      if (anterior) root.style.setProperty("--primary", anterior);
      else root.style.removeProperty("--primary");
    };
  }, [corPrimaria]);

  return {
    nome,
    logoUrl,
    corPrimaria,
    marcaPropria: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
