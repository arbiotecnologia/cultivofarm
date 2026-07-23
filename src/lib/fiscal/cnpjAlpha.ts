/**
 * Fase Fiscal 3.19 — CNPJ Alfanumérico (IN RFB 2.229/2024).
 *
 * A partir de 07/2026 o CNPJ passa a ter 14 posições:
 *   - Posições 1..12: letras A–Z (uppercase) ou dígitos 0–9.
 *   - Posições 13..14: dígitos verificadores (0–9).
 *
 * DV segundo a RFB: para cada caractere da base, usa-se
 * `código ASCII − 48` (portanto '0'..'9' → 0..9 e 'A'..'Z' → 17..42),
 * multiplicando pelos pesos usuais do módulo-11.
 *
 * REGRAS DESTE MÓDULO:
 * - Preservar CNPJ numérico existente (compatibilidade total).
 * - NUNCA remover letras. `unmaskCnpjAlpha` remove apenas
 *   pontuação/espaços e força uppercase.
 * - `formatCnpjAlpha` aplica a máscara XX.XXX.XXX/XXXX-XX aceitando
 *   letras nas 12 primeiras posições e apenas dígitos nas 2 últimas.
 * - `validateCnpjAlpha` aceita numérico OU alfanumérico e valida DV.
 */

const CNPJ_ALPHA_BASE_CHAR = /^[0-9A-Z]$/;
const CNPJ_ALPHA_DIGIT = /^[0-9]$/;

/** Remove apenas pontuação e espaços; força uppercase. Preserva letras. */
export function unmaskCnpjAlpha(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/[\s.\-/]/g, "")
    .toUpperCase();
}

/** Formata máscara CNPJ (XX.XXX.XXX/XXXX-XX) permitindo letras nas 12 primeiras posições. */
export function formatCnpjAlpha(value: string | null | undefined): string {
  const v = unmaskCnpjAlpha(value).slice(0, 14);
  if (!v) return "";
  const parts: string[] = [];
  if (v.length > 0) parts.push(v.slice(0, Math.min(2, v.length)));
  if (v.length > 2) parts.push("." + v.slice(2, Math.min(5, v.length)));
  if (v.length > 5) parts.push("." + v.slice(5, Math.min(8, v.length)));
  if (v.length > 8) parts.push("/" + v.slice(8, Math.min(12, v.length)));
  if (v.length > 12) parts.push("-" + v.slice(12, 14));
  return parts.join("");
}

function computeDv(base: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    // Regra oficial RFB: (ASCII − 48)
    const n = base.charCodeAt(i) - 48;
    sum += n * weights[i];
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Valida CNPJ (numérico legado OU alfanumérico 2026). */
export function validateCnpjAlpha(value: string | null | undefined): boolean {
  const v = unmaskCnpjAlpha(value);
  if (v.length !== 14) return false;
  // Base (12) só aceita [0-9A-Z]; DV (2) só aceita [0-9].
  for (let i = 0; i < 12; i++) if (!CNPJ_ALPHA_BASE_CHAR.test(v[i])) return false;
  if (!CNPJ_ALPHA_DIGIT.test(v[12]) || !CNPJ_ALPHA_DIGIT.test(v[13])) return false;
  // Rejeita repetido óbvio apenas quando 100% numérico (CNPJ numérico legado).
  if (/^\d+$/.test(v) && /^(\d)\1{13}$/.test(v)) return false;

  const base = v.slice(0, 12);
  const d1 = computeDv(base, W1);
  const d2 = computeDv(base + String(d1), W2);
  return v.slice(12) === `${d1}${d2}`;
}

/** True se contém pelo menos uma letra (é o novo formato alfanumérico). */
export function isCnpjAlphanumeric(value: string | null | undefined): boolean {
  const v = unmaskCnpjAlpha(value);
  return v.length > 0 && /[A-Z]/.test(v);
}
