export const PARTNER_ORDER_STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  pendente: "Pedido enviado",
  solicitado: "Pedido enviado",
  aguardando_aprovacao_credito: "Aguardando aprovação de crédito",
  em_analise_comercial: "Em análise comercial",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  confirmado: "Confirmado",
  em_producao: "Em produção",
  em_separacao: "Em separação",
  produzido: "Produzido — aguardando entrega",
  aguardando_entrega: "Aguardando entrega",
  enviado: "Enviado",
  entregue: "Entregue",
  faturado: "Faturado",
  cancelado: "Cancelado",
  aguardando_itens: "Aguardando itens",
  reprovado_sem_itens: "Reprovado — sem itens",
};

export const PARTNER_ORDER_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  rascunho: "outline",
  pendente: "secondary",
  solicitado: "secondary",
  aguardando_aprovacao_credito: "destructive",
  em_analise_comercial: "secondary",
  aprovado: "default",
  reprovado: "destructive",
  confirmado: "default",
  em_producao: "default",
  em_separacao: "default",
  produzido: "default",
  aguardando_entrega: "default",
  enviado: "default",
  entregue: "default",
  faturado: "default",
  cancelado: "destructive",
  aguardando_itens: "secondary",
  reprovado_sem_itens: "destructive",
};

export function partnerOrderStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return PARTNER_ORDER_STATUS_LABELS[status] ?? status;
}

export function partnerOrderStatusVariant(
  status: string | null | undefined,
): "default" | "secondary" | "outline" | "destructive" {
  if (!status) return "outline";
  return PARTNER_ORDER_STATUS_VARIANT[status] ?? "outline";
}

// Versões "voltadas ao parceiro": suavizam rótulos/cores que poderiam soar
// intimidadores no Portal do Parceiro, sem alterar o status canônico no banco
// nem a visão dos times internos.
const PARTNER_FACING_OVERRIDES: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  aguardando_aprovacao_credito: { label: "Em análise comercial", variant: "secondary" },
};

export function partnerOrderStatusLabelForPartner(status: string | null | undefined): string {
  if (!status) return "—";
  return PARTNER_FACING_OVERRIDES[status]?.label ?? partnerOrderStatusLabel(status);
}

export function partnerOrderStatusVariantForPartner(
  status: string | null | undefined,
): "default" | "secondary" | "outline" | "destructive" {
  if (!status) return "outline";
  return PARTNER_FACING_OVERRIDES[status]?.variant ?? partnerOrderStatusVariant(status);
}
