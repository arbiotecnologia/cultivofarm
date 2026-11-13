/**
 * Regra ÚNICA de grupo ICMS por CRT (NF-e 4.00 / MOC):
 *  - CRT 1 (Simples Nacional) e CRT 4 (MEI) → grupos ICMSSN (CSOSN).
 *  - CRT 2 (Simples com excesso de sublimite) e CRT 3 (regime normal) → grupos ICMS (CST).
 * Consumida pelo motor (buildNfeXml) e pela pré-emissão do aplicativo — nenhum
 * classificador paralelo.
 */
export type IcmsCodeKind = "CSOSN" | "CST";

export function icmsCodeKindForCrt(crt: string | number | null | undefined): IcmsCodeKind | null {
  const c = crt == null ? "" : String(crt).trim();
  if (c === "1" || c === "4") return "CSOSN";
  if (c === "2" || c === "3") return "CST";
  return null;
}
