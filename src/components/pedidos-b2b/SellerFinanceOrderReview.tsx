import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { brl } from "@/lib/financial/format";
import { formatDateDisplay as fd } from "@/lib/date-utils";
import { partnerOrderStatusLabel } from "@/lib/partnerOrderStatus";
import { C2PilotEconomicApproval } from "./C2PilotEconomicApproval";
import { useSellerFinanceOrderReview, useSellerFinanceReject, type RejectBlockReason } from "@/hooks/useSellerFinanceOrderReview";
import { useOrderEconomicDiagnosis } from "@/hooks/useOrderEconomicDiagnosis";
import { AccountingPendingNotice } from "@/components/pedidos/AccountingPendingNotice";

const TERMS_LABEL: Record<string, string> = {
  pending: "Termos aguardando decisão financeira",
  approved: "Termos aprovados",
  rejected: "Termos reprovados",
  not_required: "Termos sem exigência de aprovação financeira",
};
export const BLOCK_REASON_TEXT: Record<RejectBlockReason, string> = {
  terms_absent: "Pedido sem termos de pagamento vinculados. Nenhuma ação financeira disponível.",
  terms_not_required: "Os termos deste pedido foram registrados sem exigência de aprovação financeira e não podem ser convertidos em pendentes. Para revisão financeira, o parceiro precisa fazer um novo pedido com um plano que exija aprovação financeira.",
  terms_decided: "Os termos já foram decididos. Uma decisão anterior não pode ser revertida aqui.",
  commercial_approved: "O pedido já recebeu aprovação comercial; a reprovação dos termos não está mais disponível.",
  order_closed: "Pedido encerrado. Nenhuma ação disponível.",
  reserved: "Já existe reserva de estoque para este pedido; a reprovação dos termos não está mais disponível.",
};

interface Props { orderId: string | null; open: boolean; onOpenChange: (open: boolean) => void }

export function SellerFinanceOrderReview({ orderId, open, onOpenChange }: Props) {
  const q = useSellerFinanceOrderReview(open ? orderId : null);
  const reject = useSellerFinanceReject();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const read = q.data;
  const review = read?.state === "ready" ? read.review : null;
  const diagnosis = useOrderEconomicDiagnosis(open && review?.accounting_pending ? review.order_id : null);

  const submit = () => {
    if (!review || !review.reject_eligible || reject.isPending) return;
    if (!reason.trim()) { toast.error("Informe o motivo da reprovação."); return; }
    reject.mutate({ orderId: review.order_id, reason: reason.trim() }, {
      onSuccess: () => { toast.success("Termos reprovados"); setConfirming(false); setReason(""); },
      onError: (e: any) => toast.error(e?.message ?? "Não foi possível reprovar. Nada foi alterado."),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
        <SheetHeader><SheetTitle>Revisão financeira do pedido</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4 text-sm" data-testid="seller-finance-review">
          {q.isError ? (
            <p className="text-destructive">Pedido indisponível para revisão financeira. Nenhuma ação foi tomada.</p>
          ) : !read ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : read.state === "reader_unavailable" ? (
            <p className="text-muted-foreground">Leitura financeira deste pedido ainda não está disponível. Isso não significa que o pedido esteja vazio.</p>
          ) : review && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-lg font-bold">{review.numero}</span>
                <Badge variant="outline">Pedido do parceiro</Badge>
                <Badge variant="secondary">{partnerOrderStatusLabel(review.status)}</Badge>
                {review.accounting_pending && <Badge variant="destructive">Pendência contábil</Badge>}
              </div>
              {review.accounting_pending && (
                <AccountingPendingNotice audience="commercial" diagnosis={diagnosis.isError ? null : diagnosis.data} />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Emissão {fd(review.created_at)}</span>
              </div>

              <div>
                <div className="font-semibold mb-2">Itens ({review.items.length})</div>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Produto</TableHead><TableHead>Embalagem</TableHead>
                    <TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {review.items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>{i.produto_nome}{i.produto_codigo ? ` (${i.produto_codigo})` : ""}</TableCell>
                        <TableCell>{i.embalagem ?? "—"}</TableCell>
                        <TableCell className="text-right">{i.quantidade}{i.unidade ? ` ${i.unidade}` : ""}</TableCell>
                        <TableCell className="text-right">{brl(i.preco_unitario)}</TableCell>
                        <TableCell className="text-right">{brl(i.subtotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Condição de pagamento</span>
                  {review.terms && <Badge variant="outline" data-testid="terms-status">{TERMS_LABEL[review.terms.approval_status]}</Badge>}
                </div>
                {review.terms ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div><div className="text-xs text-muted-foreground">Plano</div>{review.terms.plan_name_snapshot} ({review.terms.plan_code_snapshot})</div>
                    <div><div className="text-xs text-muted-foreground">Parcelas</div>{review.terms.installment_count}x</div>
                    <div><div className="text-xs text-muted-foreground">Valor de tabela</div>{brl(review.terms.table_amount)}</div>
                    <div><div className="text-xs text-muted-foreground">Valor final</div><span className="font-semibold">{brl(review.terms.final_amount)}</span></div>
                  </div>
                ) : <p className="text-muted-foreground">Sem termos de pagamento vinculados.</p>}
                {review.terms?.approval_notes && <p className="text-xs whitespace-pre-wrap">Observação: {review.terms.approval_notes}</p>}
                <p className="text-xs text-muted-foreground">
                  Situação financeira do cabeçalho (registro congelado do pedido): {review.header_financial.financial_approval_status ?? "—"}. Ela não indica se os termos estão pendentes.
                </p>
              </div>

              <C2PilotEconomicApproval orderId={review.order_id} />

              {review.reject_eligible ? (
                confirming ? (
                  <div className="space-y-2">
                    <Textarea rows={3} placeholder="Motivo da reprovação" value={reason} onChange={(e) => setReason(e.target.value)} />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setConfirming(false); setReason(""); }} disabled={reject.isPending}>Cancelar</Button>
                      <Button variant="destructive" size="sm" onClick={submit} disabled={reject.isPending}>Confirmar reprovação</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>Reprovar termos</Button>
                )
              ) : (
                <p className="text-muted-foreground" data-testid="reject-block-reason">
                  {BLOCK_REASON_TEXT[review.reject_block_reason as RejectBlockReason]}
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
