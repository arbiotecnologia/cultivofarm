import { formatDateDisplay } from "@/lib/date-utils";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { brl } from "@/lib/financial/format";

interface Props {
  open: boolean;
  onClose: () => void;
  kind: "receivable" | "payable";
  payment: any | null;
}

export function EstornoDialog({ open, onClose, kind, payment }: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");

  const reverse = useMutation({
    mutationFn: async () => {
      if (!payment) throw new Error("Pagamento não selecionado");
      if (reason.trim().length < 5) throw new Error("Motivo deve ter pelo menos 5 caracteres");
      const { error } = await supabase.rpc("fn_reverse_payment" as any, {
        _payment_id: payment.id,
        _kind: kind,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Baixa estornada com sucesso");
      qc.invalidateQueries();
      setReason("");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const amount = kind === "receivable" ? payment?.amount_received : payment?.amount_paid;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Estornar baixa</DialogTitle>
        </DialogHeader>
        {payment && (
          <div className="rounded-md bg-muted p-3 text-sm">
            <p>Data: {formatDateDisplay(payment.payment_date + "T12:00:00")}</p>
            <p>Valor: <strong>{brl(amount)}</strong></p>
            <p className="text-xs text-muted-foreground mt-1">
              Será criado um lançamento de estorno (valor negativo) e a parcela será reaberta automaticamente.
            </p>
          </div>
        )}
        <div>
          <Label>Motivo do estorno *</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Descreva o motivo (mín. 5 caracteres)" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={() => reverse.mutate()} disabled={reverse.isPending}>Confirmar estorno</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
