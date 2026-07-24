/**
 * Fase SINIEF 3 — Gate de permissão para operações do Ajuste SINIEF 49/2025.
 *
 * Somente `administrador` e `financeiro` podem enxergar/usar o painel de
 * operações especiais. Gate puro, sem I/O e sem RLS.
 */
import type { AppRole } from "@/lib/permissions";

export const SINIEF49_ALLOWED_ROLES: readonly AppRole[] = Object.freeze([
  "administrador",
  "financeiro",
]);

export function canUseSinief49Operations(role: AppRole | null | undefined): boolean {
  if (!role) return false;
  return (SINIEF49_ALLOWED_ROLES as readonly string[]).includes(role);
}
