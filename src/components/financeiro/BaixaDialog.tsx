import { formatDateDisplay } from "@/lib/date-utils";
import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { brl } from "@/lib/financial/format";
import { MoneyInput } from "@/components/ui/money-input";
import { Upload, FileText, X } from "lucide-react";

type Kind = "receivable" | "payable";

interface Props { open: boolean; onClose: () => void; kind: Kind; installment: any | null; }

export function BaixaDialog({ open, onClose, kind, installment }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const empty: any = { payment_date: today, amount: 0, payment_method_id: "", bank_account_id: "", discount_amount: 0, interest_amount: 0, penalty_amount: 0, notes: "" };
  const [form, setForm] = useState<any>(empty);
  const [file, setFile] = useState<File | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["fin-settings"],
    queryFn: async () => { const { data } = await supabase.from("financial_settings").select("*").maybeSingle(); return data; },
  });

  const saldo = installment ? Number(installment.original_amount) - Number(installment.received_amount ?? installment.paid_amount ?? 0) - Number(installment.discount_amount ?? 0) : 0;

  useEffect(() => { if (open) { setForm({ ...empty, amount: Math.max(0, saldo) }); setFile(null); } /* eslint-disable-line */ }, [open, installment?.id]);

  const { data: pms = [] } = useQuery({
    queryKey: ["fin-pm-active"],
    queryFn: async () => { const { data, error } = await supabase.from("payment_methods").select("id, name").eq("active", true).order("name"); if (error) throw error; return data; },
  });
  const { data: bas = [] } = useQuery({
    queryKey: ["fin-ba-active"],
    queryFn: async () => { const { data, error } = await supabase.from("bank_accounts").select("id, name").eq("active", true).order("name"); if (error) throw error; return data; },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sessão expirada");
      if (!installment) throw new Error("Parcela não selecionada");
      if (!form.payment_method_id) throw new Error("Selecione a forma de pagamento");
      if (!form.amount || Number(form.amount) <= 0) throw new Error("Valor inválido");
      const _jaRec = Number(installment.received_amount ?? installment.paid_amount ?? 0);
      const _saldo = Number(installment.original_amount) + (Number(form.interest_amount)||0) + (Number(form.penalty_amount)||0) - (Number(form.discount_amount)||0) - _jaRec;
      if (Number(form.amount) - _saldo > 0.005) throw new Error("Valor excede o saldo da parcela.");

      const requireReceipt = kind === "receivable" 
        ? (settings as any)?.require_receipt_on_receivable_payment 
        : (settings as any)?.require_receipt_on_payable_payment;
      
      if (requireReceipt && !file) {
        throw new Error("O anexo do comprovante é obrigatório para esta operação.");
      }

      const payloadBase: any = {
        payment_date: form.payment_date,
        payment_method_id: form.payment_method_id,
        bank_account_id: form.bank_account_id || null,
        discount_amount: Number(form.discount_amount) || 0,
        interest_amount: Number(form.interest_amount) || 0,
        penalty_amount: Number(form.penalty_amount) || 0,
        notes: form.notes || null,
        has_receipt: !!file,
        idempotency_key: idempotencyRef.current,
      };


      const rpcName = kind === "receivable" ? "rpc_register_receivable_payment" : "rpc_register_payable_payment";
      const amountKey = kind === "receivable" ? "amount_received" : "amount_paid";
      const { data: paymentId, error } = await supabase.rpc(rpcName as any, {
        p_installment_id: installment.id,
        p_payload: { ...payloadBase, [amountKey]: Number(form.amount) },
      });
      if (error) throw error;
      if (!paymentId) throw new Error("Falha ao registrar pagamento.");

      if (file) {
        const ownerType = kind === "receivable" ? "PAYMENT_RECEIVABLE" : "PAYMENT_PAYABLE";
        const path = `${ownerType}/${paymentId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("financial-docs").upload(path, file);
        if (upErr) throw upErr;

        const { error: insErr } = await supabase.from("financial_documents").insert({
          owner_type: ownerType as any,
          owner_id: paymentId as any,
          document_type: "RECEIPT" as any,
          file_name: file.name as any,
          storage_path: path as any,
          mime_type: file.type as any,
          file_size: file.size as any,
          uploaded_by: user.id as any,
        } as any);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      toast.success(kind === "receivable" ? "Recebimento registrado" : "Pagamento registrado");
      qc.invalidateQueries();
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const jaRecebido = Number(installment?.received_amount ?? installment?.paid_amount ?? 0);
  const valorOriginal = Number(installment?.original_amount ?? 0);
  const desc = Number(form.discount_amount) || 0;
  const juros = Number(form.interest_amount) || 0;
  const multa = Number(form.penalty_amount) || 0;
  const valorBaixa = Number(form.amount) || 0;
  const saldoFinal = valorOriginal + juros + multa - desc - jaRecebido;
  const saldoRestante = saldoFinal - valorBaixa;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar {kind === "receivable" ? "Recebimento" : "Pagamento"}</DialogTitle>
        </DialogHeader>
        {installment && (
          <div className="rounded-md border bg-muted/50 p-3 text-xs space-y-1">
            <p className="text-sm font-medium mb-1">Parcela #{installment.installment_number} · venc. {formatDateDisplay(installment.due_date + "T12:00:00")}</p>
            <div className="grid grid-cols-2 gap-x-3">
              <span className="text-muted-foreground">Valor original:</span><span className="text-right">{brl(valorOriginal)}</span>
              <span className="text-muted-foreground">Já {kind === "receivable" ? "recebido" : "pago"}:</span><span className="text-right">{brl(jaRecebido)}</span>
              <span className="text-muted-foreground">+ Juros:</span><span className="text-right">{brl(juros)}</span>
              <span className="text-muted-foreground">+ Multa:</span><span className="text-right">{brl(multa)}</span>
              <span className="text-muted-foreground">− Desconto:</span><span className="text-right">{brl(desc)}</span>
              <span className="font-semibold border-t pt-1 mt-1">Saldo a {kind === "receivable" ? "receber" : "pagar"}:</span>
              <span className="text-right font-semibold border-t pt-1 mt-1">{brl(saldoFinal)}</span>
              <span className="text-muted-foreground">Valor desta baixa:</span><span className="text-right">{brl(valorBaixa)}</span>
              <span className={`font-medium ${saldoRestante < -0.005 ? "text-destructive" : ""}`}>Saldo restante após baixa:</span>
              <span className={`text-right font-medium ${saldoRestante < -0.005 ? "text-destructive" : ""}`}>{brl(Math.max(0, saldoRestante))}</span>
            </div>
            {saldoRestante < -0.005 && <p className="text-destructive text-xs pt-1">⚠ Valor + ajustes excedem o saldo da parcela.</p>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Data</Label><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></div>
          <div>
            <Label>Valor *</Label>
            <MoneyInput
              value={form.amount}
              onValueChange={(v) => setForm({ ...form, amount: v })}
            />
          </div>
          <div className="col-span-2">
            <Label>Forma de pagamento *</Label>
            <Select value={form.payment_method_id} onValueChange={(v) => setForm({ ...form, payment_method_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>{pms.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Conta bancária</Label>
            <Select value={form.bank_account_id || "none"} onValueChange={(v) => setForm({ ...form, bank_account_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Não informada" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não informada</SelectItem>
                {bas.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Desconto</Label>
            <MoneyInput
              value={form.discount_amount}
              onValueChange={(v) => setForm({ ...form, discount_amount: v })}
            />
          </div>
          <div>
            <Label>Juros</Label>
            <MoneyInput
              value={form.interest_amount}
              onValueChange={(v) => setForm({ ...form, interest_amount: v })}
            />
          </div>
          <div className="col-span-2">
            <Label>Multa</Label>
            <MoneyInput
              value={form.penalty_amount}
              onValueChange={(v) => setForm({ ...form, penalty_amount: v })}
            />
          </div>
          <div className="col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <div className="col-span-2 space-y-2">
            <Label>Comprovante { (kind === "receivable" ? (settings as any)?.require_receipt_on_receivable_payment : (settings as any)?.require_receipt_on_payable_payment) ? "*" : "" }</Label>
            <div className="flex items-center gap-2">
              <input type="file" ref={fileRef} className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {file ? (
                <div className="flex items-center gap-2 border rounded p-2 text-sm bg-muted flex-1 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate flex-1">{file.name}</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)} className="h-6 w-6"><X className="h-3 w-3" /></Button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" /> Selecionar comprovante
                </Button>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
