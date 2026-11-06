import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface SystemConfig {
  id: string;
  logo_url: string | null;
  nome_empresa: string;
  cor_primaria: string;
  cor_sidebar_bg: string;
  cor_sidebar_primary: string;
  updated_at: string;
}

const DEFAULTS: Omit<SystemConfig, "id" | "updated_at"> = {
  logo_url: null,
  nome_empresa: "Cultivo Farm",
  cor_primaria: "160 84% 22%",
  cor_sidebar_bg: "215 25% 12%",
  cor_sidebar_primary: "160 84% 39%",
};

function applyColors(config: Pick<SystemConfig, "cor_primaria" | "cor_sidebar_bg" | "cor_sidebar_primary" | "logo_url">) {
  const root = document.documentElement;
  root.style.setProperty("--primary", config.cor_primaria);
  root.style.setProperty("--sidebar-background", config.cor_sidebar_bg);
  root.style.setProperty("--sidebar-primary", config.cor_sidebar_primary);

  // Atualiza dinamicamente o favicon e o ícone de toque da Apple se houver um logo_url
  if (config.logo_url) {
    let favicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = config.logo_url;

    let appleIcon = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
    if (!appleIcon) {
      appleIcon = document.createElement('link');
      appleIcon.rel = 'apple-touch-icon';
      document.head.appendChild(appleIcon);
    }
    appleIcon.href = config.logo_url;
  }
}

export function useSystemConfig() {
  const query = useQuery({
    queryKey: ["system-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes_sistema")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SystemConfig) || null;
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (query.data) {
      applyColors(query.data);
    }
  }, [query.data]);

  return {
    config: query.data,
    defaults: DEFAULTS,
    isLoading: query.isLoading,
  };
}
