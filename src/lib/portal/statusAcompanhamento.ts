/**
 * Fase 10 — Portal do Produtor / Acompanhamento
 * Helper de apresentação para padronizar status técnicos entre OS e Produção.
 */

export type OSStatus =
  | "aberta"
  | "aprovada"
  | "programada"
  | "em_producao"
  | "em_cq"
  | "envase"
  | "pronto_entrega"
  | "entregue"
  | "finalizada";

export type ProducaoStatus =
  | "aguardando"
  | "em_producao"
  | "aguardando_cq"
  | "aprovado";

export type EntregaStatus =
  | "separado"
  | "em_rota"
  | "entregue"
  | "cancelada";

export const OS_STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  aprovada: "Aprovada",
  programada: "Programada",
  em_producao: "Em produção",
  em_cq: "Em controle de qualidade",
  envase: "Em envase",
  pronto_entrega: "Pronta para entrega",
  entregue: "Entregue",
  finalizada: "Finalizada",
};

export const PRODUCAO_STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando produção",
  em_producao: "Em produção",
  aguardando_cq: "Aguardando controle de qualidade",
  aprovado: "Aprovado",
};

export const ENTREGA_STATUS_LABEL: Record<string, string> = {
  separado: "Separado",
  em_rota: "Em rota",
  entregue: "Entregue",
  cancelada: "Cancelada",
};

export const OS_STATUS_DESCRIPTION: Record<string, string> = {
  em_producao: "Esta etapa representa a produção do bioinsumo dentro de uma ordem de serviço.",
  em_cq: "Amostra do lote em análise no laboratório antes da liberação.",
  envase: "Bioinsumo aprovado e sendo envasado para envio.",
  pronto_entrega: "Bioinsumo pronto, aguardando roteiro de entrega.",
};

export const OS_STATUS_FINAL = new Set<string>(["entregue", "finalizada"]);
export const PRODUCAO_STATUS_FINAL = new Set<string>(["aprovado"]);
export const ENTREGA_STATUS_FINAL = new Set<string>(["entregue", "cancelada"]);

export function labelOS(status: string): string {
  return OS_STATUS_LABEL[status] ?? status;
}
export function labelProducao(status: string): string {
  return PRODUCAO_STATUS_LABEL[status] ?? status;
}
export function labelEntrega(status: string): string {
  return ENTREGA_STATUS_LABEL[status] ?? status;
}

export function isOSFinal(status?: string | null): boolean {
  return !!status && OS_STATUS_FINAL.has(status);
}
export function isProducaoFinal(status?: string | null): boolean {
  return !!status && PRODUCAO_STATUS_FINAL.has(status);
}
export function isEntregaFinal(status?: string | null): boolean {
  return !!status && ENTREGA_STATUS_FINAL.has(status);
}
