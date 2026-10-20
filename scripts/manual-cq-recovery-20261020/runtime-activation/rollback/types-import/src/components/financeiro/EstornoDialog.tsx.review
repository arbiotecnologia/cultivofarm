import { formatDateDisplay } from "@/lib/date-utils";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { brl } from "@/lib/financial/format";
import { CHAVES_INVALIDACAO_RECEBER } from "@/lib/financeiro/contasReceber";
import { CHAVES_INVALIDACAO_PAGAR } from "@/lib/financeiro/contasPagar";

type CommonPayment = Pick<Tables<"receivable_payments">,
  "id" | "installment_id" | "organization_id" | "payment_date" | "is_reversal" | "reversed_payment_id">;
export type FinancialPayment = CommonPayment & {
  amount_received?: number;
  amount_paid?: number;
  payment_methods?: { name: string } | null;
  bank_account_id?: Tables<"receivable_payments">["bank_account_id"];
};
interface Props {
  open: boolean;
  onClose: () => void;
  kind: "receivable" | "payable";
  payment: FinancialPayment | null;
  wasReversed?: boolean;
}

export function EstornoDialog(props: Props) {
  const fence = useStorageAccessScope(`fin-reverse:${props.kind}:${props.payment?.id}`);
  return props.open && fence.ready ? (
    <EstornoForm key={`${fence.scope}:${props.kind}:${props.payment?.id}`} {...props} />
  ) : null;
}

function EstornoForm({ open, onClose, kind, payment, wasReversed = false }: Props) {
  const qc = useQueryClient();
  const { roles, profile, error: authError } = useAuth();
  const fence = useStorageAccessScope(`fin-reverse:${kind}:${payment?.id}`);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const eligible = fence.ready && !authError && roles.some((role) =>
    role === "administrador" || role === "gestor" || role === "financeiro") &&
    !!payment && payment.organization_id === profile?.organization_id &&
    !payment.is_reversal && !payment.reversed_payment_id && !wasReversed;

  const reverse = async () => {
    if (lock.current || !eligible || !payment) return;
    if (reason.trim().length < 5) {
      setError("Motivo deve ter pelo menos 5 caracteres");
      return;
    }
    const current = fence.capture();
    if (!current()) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("fn_reverse_payment", {
        _payment_id: payment.id, _kind: kind, _reason: reason.trim(),
      });
      if (!current()) return;
      if (rpcError) throw rpcError;
      if (!data) throw new Error("Estorno não confirmado.");
      const keys = kind === "receivable" ? CHAVES_INVALIDACAO_RECEBER : CHAVES_INVALIDACAO_PAGAR;
      keys.forEach((key) => void qc.invalidateQueries({ queryKey: [key] }));
      toast.success("Baixa estornada com sucesso");
      setReason("");
      onClose();
    } catch {
      if (current()) setError("Não foi possível confirmar o estorno. Verifique o histórico antes de tentar novamente.");
    } finally {
      lock.current = false;
      if (current()) setPending(false);
    }
  };
  const amount = kind === "receivable" ? payment?.amount_received : payment?.amount_paid;
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !lock.current) onClose(); }}>
      <DialogContent className="max-w-md" onEscapeKeyDown={(event) => { if (lock.current) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (lock.current) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>Estornar baixa</DialogTitle>
          <DialogDescription>Confirme o motivo do estorno.</DialogDescription>
        </DialogHeader>
        {payment && <div className="rounded-md bg-muted p-3 text-sm">
          <p>Data: {formatDateDisplay(payment.payment_date + "T12:00:00")}</p>
          <p>Valor: <strong>{brl(amount)}</strong></p>
          <p className="text-xs text-muted-foreground mt-1">Será criado um lançamento de estorno (valor negativo) e a parcela será reaberta automaticamente.</p>
        </div>}
        {!eligible && <p role="alert" className="text-sm text-destructive">Estorno indisponível para esta baixa ou sessão.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div>
          <Label htmlFor="estorno-motivo">Motivo do estorno *</Label>
          <Textarea id="estorno-motivo" value={reason} onChange={(event) => setReason(event.target.value)}
            disabled={pending || !eligible} rows={3} placeholder="Descreva o motivo (mín. 5 caracteres)" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button variant="destructive" onClick={() => void reverse()} disabled={pending || !eligible || reason.trim().length < 5}>
            {pending ? "Estornando…" : "Confirmar estorno"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
