import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { fetchCatalogoVolumesDirect, indexVolumes, type CatalogoVolume } from "./useCatalogoVolumes";

export const PARTNER_VOLUMES_CONTRACT = "B2B_PARTNER_VOLUMES_V1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PartnerVolumesResult = ReturnType<typeof indexVolumes> & {
  sellerName: string | null;
  source: "scoped" | "legacy_direct";
};

/**
 * Parser estrito do leitor escopado. Volumes vêm SEM preço: o preço é do motor
 * canônico (catálogo/simulação); `preco_brl` fica 0 para que o fallback do
 * diálogo nunca invente valor.
 */
export function parsePartnerVolumes(raw: unknown, partnerId: string): PartnerVolumesResult {
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || Array.isArray(d) || d.contract !== PARTNER_VOLUMES_CONTRACT ||
      d.partner_id !== partnerId || !Array.isArray(d.volumes) || !d.seller || typeof d.seller !== "object")
    throw new Error("partner_volumes_contract_unavailable");
  const sellerRaw = (d.seller as Record<string, unknown>).name;
  if (sellerRaw !== null && typeof sellerRaw !== "string") throw new Error("partner_volumes_contract_unavailable");
  const ids = new Set<string>();
  const rows: CatalogoVolume[] = d.volumes.map((r) => {
    if (!r || typeof r !== "object" || Array.isArray(r)) throw new Error("partner_volumes_contract_unavailable");
    const v = r as Record<string, unknown>;
    const ml = typeof v.volume_ml === "number" ? v.volume_ml : NaN;
    const tipo = v.item_tipo;
    if (typeof v.id !== "string" || !UUID.test(v.id) || ids.has(v.id) ||
        (tipo !== "produto" && tipo !== "microrganismo") || !Number.isFinite(ml) || ml <= 0 ||
        (tipo === "produto" ? typeof v.produto_id !== "string" : typeof v.microrganismo_id !== "string"))
      throw new Error("partner_volumes_contract_unavailable");
    ids.add(v.id);
    return {
      id: v.id, item_tipo: tipo, produto_id: (v.produto_id as string | null) ?? null,
      microrganismo_id: (v.microrganismo_id as string | null) ?? null, volume_ml: ml,
      rotulo: typeof v.rotulo === "string" ? v.rotulo : null, preco_brl: 0, moeda: "BRL",
      ativo: true, ordem: Number(v.ordem ?? 0),
    };
  });
  const sellerName = typeof sellerRaw === "string" && sellerRaw.trim() ? sellerRaw.trim() : null;
  return { ...indexVolumes(rows), sellerName, source: "scoped" };
}

/**
 * Ausência EXATA do endpoint (pré-instalação): somente PGRST202 do PostgREST cuja
 * mensagem nomeia public.get_partner_catalog_volumes_secure. 42883 NÃO é aceito: com o
 * endpoint instalado ele indica função interna ausente (instalação quebrada) e deve
 * falhar fechado, nunca cair na leitura direta.
 */
const ENDPOINT_RE = /\bpublic\.get_partner_catalog_volumes_secure\(\s*p_partner_id\s*\)/;
export function isRpcAbsent(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error || error.code !== "PGRST202" || typeof error.message !== "string") return false;
  if (!/^Could not find the function /.test(error.message) || !ENDPOINT_RE.test(error.message)) return false;
  return true;
}

/** Leitura escopada; REST direto só na ausência exata do endpoint (isRpcAbsent). */
export async function fetchPartnerCatalogVolumes(partnerId: string, signal: AbortSignal): Promise<PartnerVolumesResult> {
  const { data, error } = await supabase
    .rpc("get_partner_catalog_volumes_secure" as never, { p_partner_id: partnerId } as never)
    .abortSignal(signal);
  if (error) {
    if (isRpcAbsent(error)) {
      const legacy = await fetchCatalogoVolumesDirect(signal);
      return { ...legacy, sellerName: null, source: "legacy_direct" };
    }
    throw error;
  }
  return parsePartnerVolumes(data, partnerId);
}

export function usePartnerCatalogVolumes(partnerId: string | null | undefined) {
  return useScopedPortalQuery({
    queryKey: ["partner-catalog-volumes", PARTNER_VOLUMES_CONTRACT, partnerId],
    enabled: !!partnerId,
    retry: false,
    staleTime: 60_000,
    queryFn: (signal) => {
      if (!partnerId) throw new Error("partner_required");
      return fetchPartnerCatalogVolumes(partnerId, signal);
    },
  });
}
