import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type CatalogOrigem =
  | "protocolos"
  | "portal_parceiro"
  | "portal_produtor"
  | "app_mobile"
  | "ordem_servico"
  | "recomendacao"
  | "pedido_b2b";

export function useLogCatalogAccess() {
  const { user, role } = useAuth();
  return useCallback(
    (params: { entidade_tipo: "microrganismo" | "produto"; entidade_id: string; origem: CatalogOrigem }) => {
      if (!user) return;
      void supabase.from("catalog_access_events").insert({
        user_id: user.id,
        role,
        entidade_tipo: params.entidade_tipo,
        entidade_id: params.entidade_id,
        origem: params.origem,
      });
    },
    [user, role],
  );
}
