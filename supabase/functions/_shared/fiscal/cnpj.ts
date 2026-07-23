/**
 * Fase Fiscal H3-B1 — CNPJ (numérico e alfanumérico) para Edge Functions.
 *
 * Espelho fiel de `src/lib/fiscal/cnpjAlpha.ts`. Existe uma suíte de
 * paridade em `src/test/fiscal/cnpjSharedParity.test.ts` que trava
 * divergências entre este arquivo e o cliente TypeScript.
 *
 * Edge Functions Deno não podem importar de `src/**`, por isso o
 * algoritmo é replicado aqui — nunca reimplementar em cada função.
 */

const CNPJ_ALPHA_BASE_CHAR = /^[0-9A-Z]$/;
const CNPJ_ALPHA_DIGIT = /^[0-9]$/;

const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function unmaskCnpjAlpha(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(/[\s.\-/]/g, "").toUpperCase();
}

function computeDv(base: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    const n = base.charCodeAt(i) - 48; // regra oficial RFB
    sum += n * weights[i];
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function validateCnpjAlpha(value: string | null | undefined): boolean {
  const v = unmaskCnpjAlpha(value);
  if (v.length !== 14) return false;
  for (let i = 0; i < 12; i++) if (!CNPJ_ALPHA_BASE_CHAR.test(v[i])) return false;
  if (!CNPJ_ALPHA_DIGIT.test(v[12]) || !CNPJ_ALPHA_DIGIT.test(v[13])) return false;
  if (/^\d+$/.test(v) && /^(\d)\1{13}$/.test(v)) return false;
  const base = v.slice(0, 12);
  const d1 = computeDv(base, W1);
  const d2 = computeDv(base + String(d1), W2);
  return v.slice(12) === `${d1}${d2}`;
}

export function isCnpjNumericOnly(value: string | null | undefined): boolean {
  return /^\d{14}$/.test(unmaskCnpjAlpha(value));
}
