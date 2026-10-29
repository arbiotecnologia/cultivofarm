// Labels for partner_orders.credit_block_reason, shown by ResponderCotacaoDialog (the only screen
// that currently receives the reason, via respond_b2b_order_quote_secure).
// The two "configuração/limite" reasons only exist in the INACTIVE shared-credit-guard candidate.
export const CREDIT_BLOCK_REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  inadimplencia: "Bloqueado por títulos vencidos",
  limite_excedido: "Limite de crédito excedido — aguarda aprovação",
  limite_excedido_bloqueado: "Limite de crédito excedido — bloqueado",
  configuracao_financeira_inativa: "Configuração financeira do parceiro ausente ou inativa",
  limite_nao_definido: "Limite de crédito não definido",
});

/** Unknown reasons are shown as such (never mapped to a released/approved state). */
export function creditBlockReasonLabel(reason: string | null | undefined): string | null {
  if (reason == null || reason === "") return null;
  return CREDIT_BLOCK_REASON_LABELS[reason] ?? `Bloqueio de crédito (${reason})`;
}
