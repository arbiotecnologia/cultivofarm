/** Preserve the exact observed block; a page content save never edits the plan contract. */
export function monitoringBlock(text: string): string | null {
  const start = "[PLANO DE MONITORAMENTO]";
  const end = "[FIM DO PLANO]";
  if (!text.includes(start) && !text.includes(end)) return null;
  const first = text.indexOf(start); const last = text.indexOf(end);
  if (first < 0 || last < first || text.indexOf(start, first + start.length) !== -1 || text.indexOf(end, last + end.length) !== -1) {
    throw new Error("Plano de monitoramento inconsistente. Revise a visita antes de salvar.");
  }
  return text.slice(first, last + end.length);
}
export function preserveMonitoringPlan(observed: string, edited: string): string {
  const original = monitoringBlock(observed);
  const replacement = monitoringBlock(edited);
  if (replacement && replacement !== original) throw new Error("O plano deve ser alterado pelo editor de monitoramento.");
  return original && !replacement ? `${edited.trim()}\n\n${original}`.trim() : edited;
}