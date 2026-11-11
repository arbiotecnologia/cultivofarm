import type { RefObject } from "react";

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidCivilDate(v: string): boolean {
  if (!CIVIL_DATE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

/**
 * Lê a data civil (AAAA-MM-DD) exatamente como o campo nativo exibe no
 * momento do salvamento. Cobre preenchimento automático/programático que
 * altera o DOM sem disparar o onChange do React e salvamento sem blur.
 * O DOM é a fonte de verdade quando montado; sem campo, usa o estado.
 */
export function readCivilDateInput(
  ref: RefObject<HTMLInputElement | null>,
  fallback: string | null | undefined,
): string | null {
  const el = ref.current;
  if (!el) { const f = fallback ? fallback.slice(0, 10) : ""; return f && isValidCivilDate(f) ? f : null; }
  const v = (el.value ?? "").trim();
  if (!v) return null;
  return isValidCivilDate(v) ? v : null;
}
