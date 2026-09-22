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
import { anexarComprovanteBaixa } from "@/lib/financial/anexarComprovanteBaixa";
import { MoneyInput } from "@/components/ui/money-input";
import { Upload, FileText, X } from "lucide-react";
import { hojeSaoPaulo } from "@/lib/financeiro/contasReceber";
import {
  MSG_COMPROVANTE_PENDENTE,
  acumuladosParcela,
  calcularSaldoRecebivel,
  validarBaixaRecebimento,
} from "@/lib/financeiro/baixaRecebimento";
import { CHAVES_INVALIDACAO_RECEBER } from "@/lib/financeiro/contasReceber";

type Kind = "receivable" | "payable";

interface Props { open: boolean; onClose: () => void; kind: Kind; installment: any | null; }

export function BaixaDialog({ open, onClose, kind, installment }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  // H6-002: chave de idempotencia por tentativa de baixa (evita baixa duplicada em duplo clique/retry)
  const idempotencyRef = useRef<string>(crypto.randomUUID());
  const receber = kind === "receivable";

  const today = receber ? hojeSaoPaulo() : new Date().toISOString().slice(0, 10);
  const empty: any = { payment_date: today, amount: 0, payment_method_id: "", bank_account_id: "", discount_amount: 0, interest_amount: 0, penalty_amount: 0, notes: "" };
  const [form, setForm] = useState<any>(empty);
  const [file, setFile] = useState<File | null>(null);
  /** Baixa persistida cujo comprovante falhou: payload travado, só reenvio. */
  const [pendente, setPendente] = useState<{ paymentId: string } | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["fin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const settings = settingsQuery.data;

  const acum = acumuladosParcela(installment);
  const saldoInicial = receber
    ? calcularSaldoRecebivel(installment)
    : installment
      ? Number(installment.original_amount) - Number(installment.received_amount ?? installment.paid_amount ?? 0) - Number(installment.discount_amount ?? 0)
      : 0;

  useEffect(() => {
    if (open) {
      setForm({ ...empty, amount: Math.max(0, saldoInicial) });
      setFile(null);
      setPendente(null);
      idempotencyRef.current = crypto.randomUUID();
    } /* eslint-disable-line */
  }, [open, installment?.id]);

  const { data: pms = [] } = useQuery({
    queryKey: ["fin-pm-active"],
    queryFn: async () => { const { data, error } = await supabase.from("payment_methods").select("id, name").eq("active", true).order("name"); if (error) throw error; return data; },
  });
  const { data: bas = [] } = useQuery({
    queryKey: ["fin-ba-active"],
    queryFn: async () => { const { data, error } = await supabase.from("bank_accounts").select("id, name").eq("active", true).order("name"); if (error) throw error; return data; },
  });

  const requireReceipt = receber
    ? (settings as any)?.require_receipt_on_receivable_payment
    : (settings as any)?.require_receipt_on_payable_payment;

  function invalidarTudo() {
    if (receber) CHAVES_INVALIDACAO_RECEBER.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    else qc.invalidateQueries();
  }

  const save = useMutation({
    mutationFn: async () => {
      const ownerTypeBase = receber ? "PAYMENT_RECEIVABLE" : "PAYMENT_PAYABLE";

      // Reenvio do comprovante de uma baixa JÁ persistida: nenhuma nova baixa e
      // nenhuma RPC. Validamos apenas sessão, arquivo e identificador persistido —
      // método pode ter ficado inativo e o saldo já pode ser zero.
      if (pendente) {
        if (!user) throw new ErroBaixaLocal("Sessão expirada. Entre novamente para reenviar o comprovante.");
        if (!pendente.paymentId) throw new ErroBaixaLocal("Não foi possível identificar a baixa registrada.");
        if (!file) throw new ErroBaixaLocal("Selecione o comprovante para reenviar.");
        await anexarComprovanteBaixa(supabase, {
          ownerType: ownerTypeBase,
          paymentId: pendente.paymentId,
          idempotencyKey: idempotencyRef.current,
          file,
          uploadedBy: user.id,
        });
        return { reenvio: true as const };
      }

      if (receber) {
        const erro = validarBaixaRecebimento({
          parcela: installment,
          form,
          metodosAtivos: (pms as any[]).map((p) => String(p.id)),
          settingsCarregadas: settingsQuery.isSuccess,
          exigeComprovante: !!requireReceipt,
          temArquivo: !!file,
          temSessao: !!user,
        });
        if (erro) throw new ErroBaixaLocal(erro);
      } else {
        if (!user) throw new ErroBaixaLocal("Sessão expirada");
        if (!installment) throw new ErroBaixaLocal("Parcela não selecionada");
        if (!form.payment_method_id) throw new ErroBaixaLocal("Selecione a forma de pagamento");
        if (!form.amount || Number(form.amount) <= 0) throw new ErroBaixaLocal("Valor inválido");
        const _jaPago = Number(installment.received_amount ?? installment.paid_amount ?? 0);
        const _saldo = Number(installment.original_amount) + (Number(form.interest_amount) || 0) + (Number(form.penalty_amount) || 0) - (Number(form.discount_amount) || 0) - _jaPago;
        if (Number(form.amount) - _saldo > 0.005) throw new ErroBaixaLocal("Valor excede o saldo da parcela.");
        if (requireReceipt && !file) throw new ErroBaixaLocal("O anexo do comprovante é obrigatório para esta operação.");
      }

      const ownerType = ownerTypeBase;

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

      const rpcName = receber ? "rpc_register_receivable_payment" : "rpc_register_payable_payment";
      const amountKey = receber ? "amount_received" : "amount_paid";
      const { data: paymentId, error } = await supabase.rpc(rpcName as any, {
        p_installment_id: installment.id,
        p_payload: { ...payloadBase, [amountKey]: Number(form.amount) },
      });
      if (error) throw error;
      if (!paymentId) throw new Error("Falha ao registrar pagamento.");

      if (file) {
        // H6c-004: anexo idempotente por payment_id + tentativa lógica.
        try {
          await anexarComprovanteBaixa(supabase, {
            ownerType,
            paymentId: paymentId as unknown as string,
            idempotencyKey: idempotencyRef.current,
            file,
            uploadedBy: user!.id,
          });
        } catch {
          // Baixa persistida, comprovante não: estado explícito de falha parcial.
          return { comprovantePendente: true as const, paymentId: paymentId as unknown as string };
        }
      }
      return { ok: true as const };
    },
    onSuccess: (r: any) => {
      invalidarTudo();
      if (r?.comprovantePendente) {
        setPendente({ paymentId: r.paymentId });
        toast.error(MSG_COMPROVANTE_PENDENTE);
        return;
      }
      if (r?.reenvio) {
        setPendente(null);
        toast.success("Comprovante anexado");
        onClose();
        return;
      }
      toast.success(receber ? "Recebimento registrado" : "Pagamento registrado");
      onClose();
    },
    onError: (e: any) => {
      // Falha parcial anterior: consultas seguem invalidadas para refletir a baixa.
      if (pendente) invalidarTudo();
      toast.error(e?.message ? String(e.message) : "Não foi possível concluir a operação.");
    },
  });

  const jaRecebido = acum.recebido;
  const valorOriginal = acum.original;
  const desc = Number(form.discount_amount) || 0;
  const juros = Number(form.interest_amount) || 0;
  const multa = Number(form.penalty_amount) || 0;
  const valorBaixa = Number(form.amount) || 0;
  const saldoFinal = receber
    ? calcularSaldoRecebivel(installment, form)
    : valorOriginal + juros + multa - desc - jaRecebido;
  const saldoRestante = saldoFinal - valorBaixa;

  const settingsBloqueado = receber && !settingsQuery.isSuccess;
  const travado = !!pendente;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar {receber ? "Recebimento" : "Pagamento"}</DialogTitle>
        </DialogHeader>

        {travado && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
            {MSG_COMPROVANTE_PENDENTE}
          </div>
        )}
        {settingsBloqueado && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
            {settingsQuery.isError
              ? "Não foi possível carregar as configurações financeiras. Tente novamente antes de registrar."
              : "Carregando as configurações financeiras…"}
            {settingsQuery.isError && (
              <Button size="sm" variant="outline" className="ml-2" onClick={() => settingsQuery.refetch()}>Tentar novamente</Button>
            )}
          </div>
        )}

        {installment && (
          <div className="rounded-md border bg-muted/50 p-3 text-xs space-y-1">
            <p className="text-sm font-medium mb-1">Parcela #{installment.installment_number} · venc. {formatDateDisplay(installment.due_date + "T12:00:00")}</p>
            <div className="grid grid-cols-2 gap-x-3">
              <span className="text-muted-foreground">Valor original:</span><span className="text-right">{brl(valorOriginal)}</span>
              {receber && (<>
                <span className="text-muted-foreground">+ Juros acumulados:</span><span className="text-right">{brl(acum.juros)}</span>
                <span className="text-muted-foreground">+ Multa acumulada:</span><span className="text-right">{brl(acum.multa)}</span>
                <span className="text-muted-foreground">− Desconto acumulado:</span><span className="text-right">{brl(acum.desconto)}</span>
              </>)}
              <span className="text-muted-foreground">Já {receber ? "recebido" : "pago"}:</span><span className="text-right">{brl(jaRecebido)}</span>
              <span className="text-muted-foreground">+ Juros desta baixa:</span><span className="text-right">{brl(juros)}</span>
              <span className="text-muted-foreground">+ Multa desta baixa:</span><span className="text-right">{brl(multa)}</span>
              <span className="text-muted-foreground">− Desconto desta baixa:</span><span className="text-right">{brl(desc)}</span>
              <span className="font-semibold border-t pt-1 mt-1">Saldo a {receber ? "receber" : "pagar"}:</span>
              <span className="text-right font-semibold border-t pt-1 mt-1">{brl(saldoFinal)}</span>
              <span className="text-muted-foreground">Valor desta baixa:</span><span className="text-right">{brl(valorBaixa)}</span>
              <span className={`font-medium ${saldoRestante < -0.005 ? "text-destructive" : ""}`}>Saldo restante após baixa:</span>
              <span className={`text-right font-medium ${saldoRestante < -0.005 ? "text-destructive" : ""}`}>{brl(Math.max(0, saldoRestante))}</span>
            </div>
            {saldoRestante < -0.005 && <p className="text-destructive text-xs pt-1">⚠ Valor + ajustes excedem o saldo da parcela.</p>}
          </div>
        )}
        <fieldset disabled={travado} className="grid grid-cols-2 gap-3">
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
        </fieldset>
        <div className="space-y-2">
          <Label>
            Comprovante {settingsBloqueado ? "" : requireReceipt ? "*" : ""}
          </Label>
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
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{travado ? "Fechar" : "Cancelar"}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || settingsBloqueado || (travado && !file)}>
            {travado ? "Reenviar comprovante" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
