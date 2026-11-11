import type { RefObject } from "react";

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!el) return fallback ? fallback.slice(0, 10) : null;
  const v = (el.value ?? "").trim();
  if (!v) return null;
  return CIVIL_DATE.test(v) ? v : null;
}
