import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Receipt, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useAuth } from "@/hooks/useAuth";
import { useAuthenticatedAttachmentOpener } from "@/hooks/useAuthenticatedAttachmentOpener";
import { financialReceiptLocator } from "@/lib/financeiro/receiptStorageLocator";

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
 * - Geração mantém a Edge canônica; bytes usam o mesmo opener/locator da lista.
 * - Nenhuma URL da Edge é consumida. Download exige novo clique com escopo válido.
 */
export function EmitirReciboButton({ paymentId, label = "Emitir recibo", size = "sm", variant = "outline" }: Props) {
  const [busy, setBusy] = useState(false);
  const tenant = useAuth().profile?.organization_id ?? "";
  const resource = `receipt:${paymentId}`;
  const access = useStorageAccessScope(resource);
  const opener = useAuthenticatedAttachmentOpener(resource, "financial-receipts");
  const request = useRef<AbortController | null>(null);
  const [prepared, setPrepared] = useState({ scope: "", path: "", number: "" });
  useLayoutEffect(() => {
    setBusy(false); setPrepared({ scope: "", path: "", number: "" });
    return () => { request.current?.abort(); request.current = null; };
  }, [access.scope]);
  const downloadable = access.ready && prepared.scope === access.scope && !!opener.urls[prepared.path];

  const handle = async () => {
    const current = access.capture();
    if (!current() || request.current) return;
    if (downloadable) { opener.download(prepared.path, `${prepared.number}.pdf`); return; }
    const controller = new AbortController();
    request.current = controller;
    const valid = () => current() && !controller.signal.aborted && request.current === controller;
    const timeout = setTimeout(() => {
      if (request.current !== controller) return;
      controller.abort(); request.current = null;
      if (current()) { setBusy(false); toast.error("Recibo indisponível"); }
    }, 15_000);
    controller.signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("issue_financial_receipt", {
        _payment_id: paymentId,
      }).abortSignal(controller.signal);
      if (!valid()) return;
      if (error) throw error;
      const receiptId = data?.receipt_id;
      if (typeof receiptId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receiptId)) throw new Error("Recibo indisponível");
      // Actor-authenticated RLS read: never derive tenant/ownership from a URL.
      // Generated canonical types lag this table's tenant column; validate wire data below.
      const { data: receipt, error: readError } = await (supabase as any).from("financial_receipts")
        .select("id,payment_id,organization_id,receipt_year,receipt_number,storage_bucket,storage_path")
        .eq("id", receiptId).eq("payment_id", paymentId).eq("organization_id", tenant)
        .abortSignal(controller.signal).maybeSingle();
      if (!valid()) return;
      if (readError || !receipt || receipt.id !== receiptId || receipt.payment_id !== paymentId ||
          typeof receipt.receipt_number !== "string" || receipt.receipt_number !== data.receipt_number ||
          typeof receipt.organization_id !== "string" || typeof receipt.receipt_year !== "number" ||
          (receipt.storage_path !== null && typeof receipt.storage_path !== "string") ||
          (receipt.storage_bucket !== null && typeof receipt.storage_bucket !== "string")) throw new Error("Recibo indisponível");
      const path = financialReceiptLocator(receipt, tenant);
      const { data: pdfRes, error: pdfErr } = await supabase.functions.invoke("generate-financial-receipt", {
        body: { receipt_id: receiptId }, signal: controller.signal,
      });
      if (!valid()) return;
      if (pdfErr || pdfRes?.path !== path || pdfRes?.receipt_number !== receipt.receipt_number) throw new Error("Recibo indisponível");
      // Edge/RPC watchdog ends here; authenticated opener owns byte timeout/limits.
      clearTimeout(timeout);
      await opener.open(path, () => { if (valid()) toast.error("Recibo indisponível"); });
      if (valid()) setPrepared({ scope: access.scope, path, number: receipt.receipt_number });
    } catch {
      if (valid()) toast.error("Recibo indisponível");
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        if (current()) setBusy(false);
      }
    }
  };

  return (
    <Button type="button" size={size} variant={variant} onClick={handle} disabled={!access.ready || busy}>
      {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Receipt className="w-4 h-4 mr-1" />}
      {downloadable ? "Baixar PDF" : label}
    </Button>
  );
}
