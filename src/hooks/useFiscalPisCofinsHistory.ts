/**
 * Leitor do histórico de regime/vigência PIS/COFINS. Somente leitura:
 * escrita exclusiva pelo gatilho transacional do banco. Tenant/RLS no servidor.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { FISCAL_COMPANY_KEYS } from "@/hooks/useFiscalCompanySettings";

export interface PisCofinsHistoryEntry {
  id: string;
  old_regime: string | null;
  new_regime: string | null;
  old_effective_from: string | null;
  new_effective_from: string | null;
  changed_by: string | null;
  changed_at: string;
}

export type PisCofinsHistoryResult =
  | { status: "ok"; entries: PisCofinsHistoryEntry[] }
  | { status: "unavailable" };

const NOT_INSTALLED = new Set(["42P01", "PGRST205", "PGRST200"]);

export function parsePisCofinsHistory(rows: unknown): PisCofinsHistoryEntry[] | null {
  if (!Array.isArray(rows)) return null;
  const out: PisCofinsHistoryEntry[] = [];
  const s = (v: unknown) => v === null || typeof v === "string";
  for (const r of rows) {
    if (!r || typeof r !== "object") return null;
    const x = r as Record<string, unknown>;
    if (typeof x.id !== "string" || typeof x.changed_at !== "string") return null;
    if (![x.old_regime, x.new_regime, x.old_effective_from, x.new_effective_from, x.changed_by].every(s)) return null;
    out.push(x as unknown as PisCofinsHistoryEntry);
  }
  return out;
}

export function useFiscalPisCofinsHistory(companySettingsId: string | null | undefined, enabled = true) {
  const scope = useStorageAccessScope("fiscal-company-settings");
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;
  return useQuery<PisCofinsHistoryResult, Error>({
    queryKey: [...FISCAL_COMPANY_KEYS.settings, "pis-cofins-history", companySettingsId ?? null, scope.scope],
    enabled: enabled && scope.ready && !!companySettingsId && !!organizationId,
    retry: false,
    queryFn: async () => {
      const valid = scope.capture();
      if (!valid()) throw new Error("permission_denied");
      // Tabela aditiva ainda ausente do cliente gerado; leitura estreita via cliente canônico.
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => { order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown; error: { code?: string } | null }> } } } } };
      })
        .from("company_fiscal_pis_cofins_history")
        .select("id,old_regime,new_regime,old_effective_from,new_effective_from,changed_by,changed_at")
        .eq("company_settings_id", companySettingsId as string)
        .eq("organization_id", organizationId as string)
        .order("changed_at", { ascending: false })
        .limit(100);
      if (!valid()) throw new Error("permission_denied");
      if (error) {
        if (error.code && NOT_INSTALLED.has(error.code)) return { status: "unavailable" };
        throw new Error("history_failed");
      }
      const entries = parsePisCofinsHistory(data);
      if (!entries) throw new Error("history_failed");
      return { status: "ok", entries };
    },
  });
}
