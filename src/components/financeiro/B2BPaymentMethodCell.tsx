import { usePartnerOrderPaymentConditionRead } from "@/hooks/usePaymentTermsApproval";

/** Forma via leitor autorizado de termos (snapshot); nunca o campo legado do cabeçalho do pedido. */
export function B2BPaymentMethodCell({ orderId }: { orderId: string }) {
  const q = usePartnerOrderPaymentConditionRead(orderId);
  if (q.ready && q.isLoading) return <span className="text-muted-foreground">Carregando…</span>;
  if (!q.ready || q.isError || q.data === undefined || q.data.state === "reader_unavailable")
    return <span className="text-muted-foreground">Indisponível</span>;
  if (q.data.state === "absent") return <span className="text-muted-foreground">Sem condição registrada</span>;
  const c = q.data.condition;
  return <span>{c.payment_method_name}{c.installment_count > 1 ? ` · ${c.installment_count}x` : ""}</span>;
}
