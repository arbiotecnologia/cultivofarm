import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Receipt, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

interface Props {
  paymentId: string;
  /** Optional label override */
  label?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline" | "ghost" | "secondary";
}

/**
 * Emite recibo financeiro a partir de um receivable_payments.id.
 * - Chama issue_financial_receipt (bloqueia duplicidade no banco).
 * - Após emissão (ou se duplicate=true), gera/baixa o PDF via generate-financial-receipt.
 */
export function EmitirReciboButton({ paymentId, label = "Emitir recibo", size = "sm", variant = "outline" }: Props) {
  const [busy, setBusy] = useState(false);
  const access = useStorageAccessScope(`receipt:${paymentId}`);

  const handle = async () => {
    if (!access.ready) return;
    const current = access.capture();
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("issue_financial_receipt", {
        _payment_id: paymentId,
      });
      if (!current()) return;
      if (error) throw error;
      const res = data as any;
      const receiptId = res?.receipt_id;
      if (!receiptId) throw new Error("Falha ao emitir recibo");

      if (res?.duplicate) {
        toast.info(`Recibo já existente: ${res.receipt_number}. Baixando PDF…`);
      } else {
        toast.success(`Recibo ${res.receipt_number} emitido`);
      }
      const { data: pdfRes, error: pdfErr } = await supabase.functions.invoke("generate-financial-receipt", {
        body: { receipt_id: receiptId },
      });
      if (!current()) return;
      if (pdfErr) throw pdfErr;
      if ((pdfRes as any)?.url) window.open((pdfRes as any).url, "_blank");
    } catch (e: any) {
      if (!current()) return;
      toast.error(e.message ?? "Erro ao emitir recibo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size={size} variant={variant} onClick={handle} disabled={busy}>
      {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Receipt className="w-4 h-4 mr-1" />}
      {label}
    </Button>
  );
}
