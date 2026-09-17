/**
 * Fase H11-A — Consulta aos catálogos fiscais oficiais versionados.
 *
 * O frontend nunca inventa código fiscal: apenas lê o catálogo ACTIVE
 * publicado no servidor (`rpc_fiscal_catalog_search_v1`, SECURITY INVOKER,
 * sujeito à RLS fiscal). Nada é calculado nem gravado aqui.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FiscalCatalogType =
  | "NCM"
  | "CFOP"
  | "CNAE"
  | "MUNICIPIO_IBGE"
  | "NFSE_SERVICO_NACIONAL"
  | "CCLASSTRIB"
  | "CCREDPRES"
  | "CBS_RATE"
  | "FCP_UF"
  | "RTC_NORMA";

export interface FiscalCatalogEntry {
  code: string;
  description: string;
  parent_code: string | null;
  metadata: Record<string, unknown> | null;
  is_preferred: boolean;
  catalog_version: string | null;
}

export interface FiscalCatalogResolvedEntry {
  code: string;
  description: string;
  parent_code: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
}

/** Erros técnicos traduzidos sem expor SQL nem detalhe de permissão. */
export function traduzirErroCatalogo(message: string | null | undefined): string {
  const m = String(message ?? "");
  if (m.includes("permission denied") || m.includes("FORBIDDEN")) {
    return "Seu perfil não tem permissão para consultar os catálogos fiscais.";
  }
  if (m.includes("does not exist")) {
    return "Catálogo fiscal indisponível neste ambiente.";
  }
  return "Não foi possível consultar o catálogo fiscal agora.";
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export function useFiscalCatalogSearch(params: {
  catalogType: FiscalCatalogType;
  query: string;
  parentCode?: string | null;
  preferredCodes?: string[];
  limit?: number;
  enabled?: boolean;
}) {
  const { catalogType, query, parentCode = null, preferredCodes, limit = 25, enabled = true } = params;
  return useQuery({
    queryKey: ["fiscal", "catalog", catalogType, query, parentCode, preferredCodes, limit],
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FiscalCatalogEntry[]> => {
      const { data, error } = await (supabase as unknown as RpcClient).rpc("rpc_fiscal_catalog_search_v1", {
        p_catalog_type: catalogType,
        p_query: query.trim() || null,
        p_parent_code: parentCode,
        p_preferred_codes: preferredCodes && preferredCodes.length > 0 ? preferredCodes : null,
        p_limit: limit,
      });
      if (error) throw new Error(traduzirErroCatalogo(error.message));
      if (!Array.isArray(data)) throw new Error("Resposta inválida do catálogo fiscal.");
      return data as FiscalCatalogEntry[];
    },
  });
}

/** Resolve a descrição de códigos já gravados (inclusive legados/inativos). */
export function useFiscalCatalogResolve(catalogType: FiscalCatalogType, codes: string[], enabled = true) {
  const unique = Array.from(new Set(codes.filter((c) => typeof c === "string" && c.trim().length > 0)));
  return useQuery({
    queryKey: ["fiscal", "catalog-resolve", catalogType, unique],
    enabled: enabled && unique.length > 0,
    retry: false,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<FiscalCatalogResolvedEntry[]> => {
      const { data, error } = await (supabase as unknown as RpcClient).rpc("rpc_fiscal_catalog_resolve_v1", {
        p_catalog_type: catalogType,
        p_codes: unique,
      });
      if (error) throw new Error(traduzirErroCatalogo(error.message));
      if (!Array.isArray(data)) throw new Error("Resposta inválida do catálogo fiscal.");
      return data as FiscalCatalogResolvedEntry[];
    },
  });
}
