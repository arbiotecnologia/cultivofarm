import type { Json } from "@/integrations/supabase/cultivofarm.types";
import { UF_OPTIONS } from "./fiscalOptions";

export const PIS_COFINS_REGIMES = ["CUMULATIVO", "NAO_CUMULATIVO", "MISTO", "SIMPLES_NACIONAL"] as const;
export function accreditationRecord(value: Json): Record<string, Json | undefined> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

// Canonical F3 examples persist [{uf, accredited}]; preserve all extra keys and unrelated entries.
export function mergeDeclaredAccreditation(records: Json[], uf: string, accredited: boolean): Json[] {
  if (!UF_OPTIONS.some((option) => option.value === uf)) throw new Error("UF inválida.");
  const matches = records.flatMap((entry, index) => accreditationRecord(entry)?.uf === uf ? [index] : []);
  if (matches.length > 1) throw new Error("Há registros duplicados para esta UF. Revisão necessária; nenhum registro foi alterado.");
  const index = matches[0];
  if (index === undefined) return [...records, { uf, accredited }];
  return records.map((entry, position) => position === index ? { ...accreditationRecord(entry), accredited } : entry);
}