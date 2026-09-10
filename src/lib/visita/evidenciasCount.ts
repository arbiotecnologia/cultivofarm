/**
 * Contagem canônica de evidências da visita técnica (H9-G bloco 2A).
 *
 * "Evidências" no domínio da visita engloba fotos, áudios, anexos e notas
 * rápidas. O título do bloco/acordeão deve refletir o total, não apenas os
 * arquivos, para não divergir dos contadores das abas internas.
 */

export function contarEvidencias(
  arquivos?: unknown[] | null,
  notas?: unknown[] | null,
): number {
  return (arquivos?.length ?? 0) + (notas?.length ?? 0);
}
