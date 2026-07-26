/**
 * Normaliza um valor de Inscrição Estadual para persistência.
 * - null/undefined/vazio ⇒ null
 * - "ISENTO" (case-insensitive) ⇒ "ISENTO" quando `allowIsento`
 * - Caso contrário ⇒ apenas dígitos (ou "P" + dígitos p/ produtor rural SP).
 *
 * Não valida DV — use `validateIE` antes.
 */
export function normalizeIE(
  uf: string | null | undefined,
  value: string | number | null | undefined,
  opts: { allowIsento?: boolean } = {},
): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (raw === "") return null;
  if (opts.allowIsento && raw.toUpperCase() === "ISENTO") return "ISENTO";
  const ufKey = String(uf ?? "").trim().toUpperCase();
  if (ufKey === "SP" && /^P/i.test(raw)) {
    return "P" + raw.slice(1).replace(/\D/g, "");
  }
  const digits = raw.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}
