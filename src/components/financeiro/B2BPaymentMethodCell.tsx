import { usePartnerOrderPaymentCondition } from "@/hooks/usePaymentTermsApproval";

/** Forma via leitor autorizado de termos (snapshot); nunca o campo legado do cabeçalho do pedido. */
export function B2BPaymentMethodCell({ orderId }: { orderId: string }) {
  const q = usePartnerOrderPaymentCondition(orderId);
  if (q.isLoading) return <span className="text-muted-foreground">Carregando…</span>;
  if (q.isError || q.data === undefined) return <span className="text-muted-foreground">Indisponível</span>;
  if (q.data === null) return <span className="text-muted-foreground">Sem condição registrada</span>;
  return <span>{q.data.payment_method_name}{q.data.installment_count > 1 ? ` · ${q.data.installment_count}x` : ""}</span>;
}
