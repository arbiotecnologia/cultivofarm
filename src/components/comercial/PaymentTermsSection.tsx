import { useEffect, useRef, useState } from "react";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import {
  usePartnerOrderPaymentTerms,
  usePartnerOrderPaymentCondition,
  useApprovePaymentTerms,
  useRejectPaymentTerms,
  useRequestPaymentTermsAdjustment,
  useAddPaymentTermsNote,
} from "@/hooks/usePaymentTermsApproval";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { brl as fmt } from "@/lib/financial/format";
import { formatDateDisplay as fmtDate } from "@/lib/date-utils";
import { ShieldCheck, ShieldAlert, MessageCircle, RefreshCw } from "lucide-react";

interface Props {
  partnerOrderId: string;
  canApprove: boolean;
  accountingPending?: boolean;
  requiresFinancialApproval?: boolean;
  requiresCreditApproval?: boolean;
  requiresGuarantee?: boolean;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default",
  pending: "secondary",
  rejected: "destructive",
  not_required: "outline",
};

const statusLabel: Record<string, string> = {
  approved: "Aprovada",
  pending: "Aguardando aprovação",
  rejected: "Reprovada",
  not_required: "Não requer aprovação",
};

export function PaymentTermsSection({
  partnerOrderId,
  canApprove,
  accountingPending = false,
  requiresFinancialApproval,
  requiresCreditApproval,
  requiresGuarantee,
}: Props) {
  const termsQuery = usePartnerOrderPaymentTerms(partnerOrderId);
  const conditionQuery = usePartnerOrderPaymentCondition(partnerOrderId);
  const condition = conditionQuery.data;
  const read = termsQuery.data;
  const terms = read?.state === "present" ? read.terms : null;
  const approve = useApprovePaymentTerms();
  const reject = useRejectPaymentTerms();
  const adjust = useRequestPaymentTermsAdjustment();
  const addNote = useAddPaymentTermsNote();

  const [dialog, setDialog] = useState<null | "reject" | "adjust" | "note">(null);
  const [text, setText] = useState("");
  const actionScope = useStorageAccessScope(`payment-terms-actions:${partnerOrderId}`);
  const decisionsUnavailable = accountingPending || !canApprove || !actionScope.ready ||
    termsQuery.isError || !terms || conditionQuery.isError || conditionQuery.data === undefined;
  const current = useRef({ orderId: partnerOrderId, scope: actionScope.scope, unavailable: decisionsUnavailable, approved: false });
  current.current = { orderId: partnerOrderId, scope: actionScope.scope, unavailable: decisionsUnavailable, approved: terms?.approval_status === "approved" };
  const dialogContext = useRef<null | { orderId: string; scope: string; valid: () => boolean }>(null);
  const closeDialog = () => { dialogContext.current = null; setDialog(null); setText(""); };
  const captureAction = () => {
    const valid = actionScope.capture();
    return () => valid() && current.current.orderId === partnerOrderId && current.current.scope === actionScope.scope && !current.current.unavailable;
  };
  const renderValid = captureAction();
  const openDialog = (kind: "reject" | "adjust" | "note") => {
    if (!renderValid() || (kind === "reject" && current.current.approved)) return;
    dialogContext.current = { orderId: partnerOrderId, scope: actionScope.scope, valid: captureAction() };
    setDialog(kind);
  };
  useEffect(() => {
    const ctx = dialogContext.current;
    if (ctx && (!ctx.valid() || ctx.orderId !== partnerOrderId || ctx.scope !== actionScope.scope ||
        (dialog === "reject" && current.current.approved))) closeDialog();
  }, [partnerOrderId, actionScope.scope, decisionsUnavailable, terms?.approval_status, dialog]);

  if (termsQuery.isError || read?.state === "unverified") {
    return (
      <Card data-testid="payment-terms-unavailable">
        <CardHeader><CardTitle className="text-base">Condição Comercial e Financeira</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <p className="text-destructive">Não foi possível carregar a condição de pagamento deste pedido agora.</p>
          <p className="text-muted-foreground text-xs">Isso não significa que o pedido esteja sem condição. Nenhuma ação foi tomada.</p>
          <Button size="sm" variant="outline" onClick={() => void termsQuery.refetch()} disabled={termsQuery.isFetching}>Tentar novamente</Button>
        </CardContent>
      </Card>
    );
  }
  if (!read) return <div className="text-sm text-muted-foreground">Carregando condição comercial...</div>;
  if (!terms) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Condição Comercial e Financeira</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Sem condição de pagamento registrada para este pedido.
        </CardContent>
      </Card>
    );
  }

  const submit = () => {
    const ctx = dialogContext.current;
    if (!renderValid() || !ctx?.valid() || ctx.orderId !== current.current.orderId || ctx.scope !== current.current.scope ||
        (dialog === "reject" && current.current.approved)) { closeDialog(); return; }
    if (!text.trim()) { toast.error("Informe o texto."); return; }
    const done = () => { if (ctx.valid()) closeDialog(); };
    if (dialog === "reject") {
      reject.mutate({ orderId: partnerOrderId, reason: text }, {
        onSuccess: () => { toast.success("Condição reprovada"); done(); },
        onError: (e: any) => toast.error(e.message ?? "Erro"),
      });
    } else if (dialog === "adjust") {
      adjust.mutate({ orderId: partnerOrderId, notes: text }, {
        onSuccess: () => { toast.success("Ajuste solicitado"); done(); },
        onError: (e: any) => toast.error(e.message ?? "Erro"),
      });
    } else if (dialog === "note") {
      addNote.mutate({ orderId: partnerOrderId, note: text }, {
        onSuccess: () => { toast.success("Observação registrada"); done(); },
        onError: (e: any) => toast.error(e.message ?? "Erro"),
      });
    }
  };

  const disabled = terms.approval_status === "approved" || decisionsUnavailable;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Condição Comercial e Financeira</CardTitle>
          <Badge variant={statusVariant[terms.approval_status] ?? "outline"}>
            {statusLabel[terms.approval_status] ?? terms.approval_status}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Field label="Plano" value={`${terms.plan_name_snapshot} (${terms.plan_code_snapshot})`} />
            <Field label="Valor de tabela" value={fmt(terms.table_amount)} />
            <Field label="Desconto" value={`${fmt(terms.discount_amount)} (${terms.discount_percent_snapshot}%)`} />
            <Field label="Base líquida" value={fmt(terms.net_amount_after_discount)} />
            <Field label="Juros" value={condition
              ? `${fmt(terms.financial_interest_amount)} (Price · ${condition.monthly_rate}% a.m. · ${condition.installment_count} parcela(s))`
              : `${fmt(terms.financial_interest_amount)} (${terms.monthly_interest_percent_snapshot}% a.m. × ${terms.months_count_snapshot}m)`} />
            <Field label="Valor final" value={fmt(terms.final_amount)} highlight />
            {/* Data-base é a NF: o snapshot do pedido nunca é vencimento definitivo. */}
            <Field label="1º vencimento estimado" value={terms.first_due_date ? `${fmtDate(terms.first_due_date)} (estimativa)` : "A definir após confirmação fiscal"} />
            <Field label="Parcelas" value={`${condition?.installment_count ?? terms.installment_count}x`} />
          </div>
          <p className="text-xs text-muted-foreground" data-testid="due-date-estimate-note">Datas estimadas: os vencimentos serão definidos a partir da emissão da NF, que é a data-base do pagamento.</p>
          {conditionQuery.isError && <p className="text-destructive text-xs">Snapshot da condição indisponível. Decisões financeiras bloqueadas.</p>}
          {accountingPending && <p className="text-destructive text-xs">Decisões financeiras indisponíveis enquanto a validação fiscal/contábil do pedido estiver pendente.</p>}

          <div className="flex flex-wrap gap-1 pt-1">
            {requiresFinancialApproval && <Badge variant="outline">Exige aprovação financeira</Badge>}
            {requiresCreditApproval && <Badge variant="outline">Exige aprovação de crédito</Badge>}
            {requiresGuarantee && <Badge variant="outline">Exige garantia</Badge>}
          </div>

          {terms.approval_notes && (
            <div className="rounded-md border p-2 bg-muted/40 whitespace-pre-wrap text-xs">
              <div className="font-medium mb-1">Observações</div>
              {terms.approval_notes}
            </div>
          )}

          {canApprove && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                size="sm"
                onClick={() => { if (!renderValid() || current.current.approved || approve.isPending) return;
                  const valid = captureAction(); approve.mutate({ orderId: partnerOrderId }, {
                  onSuccess: () => { if (valid()) toast.success("Condição aprovada"); },
                  onError: (e: any) => { if (valid()) toast.error(e.message ?? "Erro"); },
                }); }}
                disabled={disabled || approve.isPending}
              >
                <ShieldCheck className="h-4 w-4 mr-1" /> Aprovar
              </Button>
              <Button size="sm" variant="destructive" onClick={() => openDialog("reject")} disabled={disabled}>
                <ShieldAlert className="h-4 w-4 mr-1" /> Reprovar
              </Button>
              <Button size="sm" variant="outline" onClick={() => openDialog("adjust")} disabled={decisionsUnavailable}>
                <RefreshCw className="h-4 w-4 mr-1" /> Solicitar ajuste
              </Button>
              <Button size="sm" variant="outline" onClick={() => openDialog("note")} disabled={decisionsUnavailable}>
                <MessageCircle className="h-4 w-4 mr-1" /> Observação/Garantia
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!dialog} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "reject" && "Reprovar condição"}
              {dialog === "adjust" && "Solicitar ajuste"}
              {dialog === "note" && "Registrar observação/garantia"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            rows={4}
            placeholder={dialog === "reject" ? "Motivo da reprovação" : "Descreva..."}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={submit} disabled={decisionsUnavailable}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={highlight ? "font-semibold" : ""}>{value}</div>
    </div>
  );
}
