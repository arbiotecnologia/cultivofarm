/** Fixed non-sensitive choices only. Never store free text, IDs, quantities, dates or media. */
export interface SafeOSRenewalDraft {
  open: boolean;
  tipo_item: "produto" | "microrganismo";
  modo_aplicacao: "foliar" | "solo" | "fertirrigacao" | "tratamento_semente";
  prioridade: "baixa" | "media" | "alta";
}
export function safeOSRenewalDraft(value: SafeOSRenewalDraft): SafeOSRenewalDraft | null {
  if (value.open !== true || !["produto", "microrganismo"].includes(value.tipo_item) ||
    !["foliar", "solo", "fertirrigacao", "tratamento_semente"].includes(value.modo_aplicacao) ||
    !["baixa", "media", "alta"].includes(value.prioridade)) return null;
  return { open: true, tipo_item: value.tipo_item, modo_aplicacao: value.modo_aplicacao, prioridade: value.prioridade };
}