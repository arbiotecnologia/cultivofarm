import type { Json } from "@/integrations/supabase/cultivofarm.types";
import { UF_OPTIONS } from "./fiscalOptions";

export const PIS_COFINS_REGIMES = ["CUMULATIVO", "NAO_CUMULATIVO", "MISTO", "SIMPLES_NACIONAL"] as const;
export function accreditationRecord(value: Json): Record<string, Json | undefined> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/** "yes" = true salvo, "no" = false salvo, "" = chave ausente/null/valor não booleano. */
export type AccreditationDeclaration = "yes" | "no" | "";
export type AccreditationLookup =
  | { kind: "new" }
  | { kind: "single"; declaration: AccreditationDeclaration; legacyValue: boolean }
  | { kind: "duplicate" };

export function declarationOf(record: Record<string, Json | undefined> | null): AccreditationDeclaration {
  if (record?.accredited === true) return "yes";
  if (record?.accredited === false) return "no";
  return "";
}

export function lookupAccreditation(records: Json[], uf: string): AccreditationLookup {
  const matches = records.map(accreditationRecord).filter((r) => r?.uf === uf);
  if (matches.length > 1) return { kind: "duplicate" };
  if (matches.length === 0) return { kind: "new" };
  const accredited = matches[0]?.accredited;
  return { kind: "single", declaration: declarationOf(matches[0]), legacyValue: accredited !== undefined && accredited !== null && typeof accredited !== "boolean" };
}

/** UFs com exatamente um registro identificável, na ordem gravada. */
export function accreditedUfs(records: Json[]): string[] {
  const seen = new Map<string, number>();
  for (const r of records) {
    const uf = accreditationRecord(r)?.uf;
    if (typeof uf === "string") seen.set(uf, (seen.get(uf) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n === 1).map(([uf]) => uf);
}

// Canonical F3 examples persist [{uf, accredited}]; preserve all extra keys and unrelated entries.
// accredited=null removes only the declaration key (absent ≠ false), keeping metadata.
export function mergeDeclaredAccreditation(records: Json[], uf: string, accredited: boolean | null): Json[] {
  if (!UF_OPTIONS.some((option) => option.value === uf)) throw new Error("UF inválida.");
  const matches = records.flatMap((entry, index) => accreditationRecord(entry)?.uf === uf ? [index] : []);
  if (matches.length > 1) throw new Error("Há registros duplicados para esta UF. Revisão necessária; nenhum registro foi alterado.");
  const index = matches[0];
  if (index === undefined) {
    if (accredited === null) throw new Error("Escolha a aptidão declarada para registrar uma nova UF.");
    return [...records, { uf, accredited }];
  }
  return records.map((entry, position) => {
    if (position !== index) return entry;
    const { accredited: _previous, ...rest } = accreditationRecord(entry) ?? {};
    return accredited === null ? rest as Json : { ...rest, accredited } as Json;
  });
}
