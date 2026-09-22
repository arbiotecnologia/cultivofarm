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
  ErroBaixaLocal,
  MSG_COMPROVANTE_PENDENTE,
  acumuladosParcela,
  calcularSaldoRecebivel,
  mapearErroBaixaRecebimento,
  validarBaixaRecebimento,
} from "@/lib/financeiro/baixaRecebimento";
import {
  ErroAnexoPagarLocal,
  ErroBaixaIncerta,
  ErroBaixaPagarLocal,
  MSG_PAGAMENTO_COMPROVANTE_PENDENTE,
  MSG_PAGAMENTO_NAO_CONFIRMADO,
  acumuladosParcelaPagar,
  calcularSaldoPagavel,
  classificarErroBaixaPagar,
  executarComDeadlineBaixaPagar,
  lerTentativaIncerta,
  limparTentativaIncerta,
  salvarTentativaIncerta,
  validarBaixaPagar,
  type TentativaBaixaPagar,
} from "@/lib/financeiro/contasPagar";
import { CHAVES_INVALIDACAO_RECEBER } from "@/lib/financeiro/contasReceber";
import { CHAVES_INVALIDACAO_PAGAR } from "@/lib/financeiro/contasPagar";

type Kind = "receivable" | "payable";

interface Props { open: boolean; onClose: () => void; kind: Kind; installment: any | null; }

export function BaixaDialog({ open, onClose, kind, installment }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  // H6-002: chave de idempotencia por tentativa de baixa (evita baixa duplicada em duplo clique/retry)
  const idempotencyRef = useRef<string>(crypto.randomUUID());
  const receber = kind === "receivable";

  const today = hojeSaoPaulo();
  const empty: any = { payment_date: today, amount: 0, payment_method_id: "", bank_account_id: "", discount_amount: 0, interest_amount: 0, penalty_amount: 0, notes: "" };
  const [form, setForm] = useState<any>(empty);
  const [file, setFile] = useState<File | null>(null);
  /** Baixa persistida cujo comprovante falhou: payload travado, só reenvio. */
  const [pendente, setPendente] = useState<{ paymentId: string } | null>(null);
  /** Resultado incerto (timeout/rede/desconhecido): bloqueia novo envio até conferência. */
  const [exigeConferencia, setExigeConferencia] = useState(false);
  /** Journal local ilegível/corrompido: bloqueia envio sem apagar nada. */
  const [journalFalha, setJournalFalha] = useState(false);

  /** Tentativa incerta preservada (mesma chave e mesmo payload) para repetição idempotente. */
  const tentativaRef = useRef<TentativaBaixaPagar | null>(null);
  /** Guarda síncrona contra duplo clique (o estado de pendência do React é assíncrono). */
  const enviandoRef = useRef(false);
  /** Token da execução dona da guarda: só ela libera a flag. */
  const donoRef = useRef(0);

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
    : calcularSaldoPagavel(installment);

  useEffect(() => {
    if (open) {
      setFile(null);
      setPendente(null);
      // Payable: uma tentativa anterior (mesmo usuário + mesma parcela) sobrevive
      // a fechar/reabrir e remontar. Nunca geramos chave nova em silêncio.
      const leitura = receber
        ? ({ estado: "ausente" } as const)
        : lerJournalTentativa(user?.id, installment?.id);
      const anterior = leitura.estado === "ok" ? leitura.tentativa : null;
      setJournalFalha(leitura.estado === "falha");
      if (anterior) {
        tentativaRef.current = anterior;
        idempotencyRef.current = anterior.idempotencyKey;
        setExigeConferencia(true);
        const p = anterior.payload as any;
        setForm({
          ...empty,
          payment_date: p.payment_date ?? today,
          amount: Number(p.amount_paid) || 0,
          payment_method_id: p.payment_method_id ?? "",
          bank_account_id: p.bank_account_id ?? "",
          discount_amount: Number(p.discount_amount) || 0,
          interest_amount: Number(p.interest_amount) || 0,
          penalty_amount: Number(p.penalty_amount) || 0,
          notes: p.notes ?? "",
        });
      } else {
        tentativaRef.current = null;
        setExigeConferencia(false);
        setForm({ ...empty, amount: Math.max(0, saldoInicial) });
        idempotencyRef.current = crypto.randomUUID();
      }
    } /* eslint-disable-line */
  }, [open, installment?.id, user?.id]);


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
    else CHAVES_INVALIDACAO_PAGAR.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }

  const save = useMutation({
    retry: false,
    mutationFn: async (vars?: { repetir?: boolean; token?: number }) => {
      const ownerTypeBase = receber ? "PAYMENT_RECEIVABLE" : "PAYMENT_PAYABLE";
      const repetir = !receber && !!vars?.repetir;

      // Reenvio do comprovante de uma baixa JÁ persistida: nenhuma nova baixa e
      // nenhuma RPC. Validamos apenas sessão, arquivo e identificador persistido —
      // método pode ter ficado inativo e o saldo já pode ser zero.
      if (pendente) {
        const erroAnexo = (m: string) =>
          receber ? new ErroBaixaLocal(m) : new ErroAnexoPagarLocal(m);
        if (!user) throw erroAnexo("Sessão expirada. Entre novamente para reenviar o comprovante.");
        if (!pendente.paymentId) throw erroAnexo("Não foi possível identificar a baixa registrada.");
        if (!file) throw erroAnexo("Selecione o comprovante para reenviar.");
        // Toda falha aqui é falha de ANEXO de uma baixa já confirmada: nunca
        // vira resultado incerto, nunca persiste tentativa, nunca dispara RPC.
        try {
          await anexarComprovanteBaixa(supabase, {
            ownerType: ownerTypeBase,
            paymentId: pendente.paymentId,
            idempotencyKey: idempotencyRef.current,
            file,
            uploadedBy: user.id,
          });
        } catch {
          throw erroAnexo(
            "Não foi possível anexar o comprovante. O pagamento continua registrado; tente enviar o arquivo novamente.",
          );
        }
        return { reenvio: true as const };
      }

      // Resultado incerto anterior: nenhum novo envio com nova chave até conferência.
      // Só a repetição explícita da MESMA tentativa (mesma chave e mesmo payload) é aceita.
      if (!receber && exigeConferencia && !repetir) {
        throw new ErroBaixaPagarLocal(MSG_PAGAMENTO_NAO_CONFIRMADO);
      }
      if (repetir && !tentativaRef.current) {
        throw new ErroBaixaPagarLocal(MSG_PAGAMENTO_NAO_CONFIRMADO);
      }

      if (!repetir) {
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
          const erro = validarBaixaPagar({
            parcela: installment,
            form,
            metodosAtivos: (pms as any[]).map((p) => String(p.id)),
            settingsCarregadas: settingsQuery.isSuccess,
            exigeComprovante: !!requireReceipt,
            temArquivo: !!file,
            temSessao: !!user,
          });
          if (erro) throw new ErroBaixaPagarLocal(erro);
        }
      }

      const ownerType = ownerTypeBase;

      const rpcName = receber ? "rpc_register_receivable_payment" : "rpc_register_payable_payment";
      const amountKey = receber ? "amount_received" : "amount_paid";

      // Repetição idempotente usa EXATAMENTE o payload e a chave da tentativa original.
      const payloadFinal: any = repetir
        ? { ...(tentativaRef.current as TentativaBaixaPagar).payload }
        : {
            payment_date: form.payment_date,
            payment_method_id: form.payment_method_id,
            bank_account_id: form.bank_account_id || null,
            discount_amount: Number(form.discount_amount) || 0,
            interest_amount: Number(form.interest_amount) || 0,
            penalty_amount: Number(form.penalty_amount) || 0,
            notes: form.notes || null,
            has_receipt: !!file,
            idempotency_key: idempotencyRef.current,
            [amountKey]: Number(form.amount),
          };

      // Payable: a tentativa fica registrada em memória antes do envio para que um
      // resultado incerto possa ser repetido sem gerar nova chave.
      if (!receber && user && installment?.id) {
        tentativaRef.current = {
          idempotencyKey: String(payloadFinal.idempotency_key),
          parcelaId: String(installment.id),
          usuarioId: user.id,
          payload: payloadFinal,
          criadoEm: new Date().toISOString(),
        };
      }

      const chamar = async (signal: AbortSignal | undefined) => {
        let req = (supabase as any).rpc(rpcName as any, {
          p_installment_id: installment.id,
          p_payload: payloadFinal,
        });
        if (signal && typeof req?.abortSignal === "function") req = req.abortSignal(signal);
        return await req;
      };

      // Payable: prazo rígido cobrindo pré-fetch/auth + RPC. Receivable mantém o
      // fluxo original.
      const { data: paymentId, error } = receber
        ? await supabase.rpc(rpcName as any, {
            p_installment_id: installment.id,
            p_payload: payloadFinal,
          })
        : await executarComDeadlineBaixaPagar(chamar);
      if (error) throw error;
      // Sucesso estrito: a RPC deve retornar um UUID de pagamento.
      const pid = typeof paymentId === "string" ? paymentId : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pid)) {
        throw receber ? new ErroBaixaLocal("Falha ao registrar pagamento.") : new ErroBaixaIncerta();
      }

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
      } else if (payloadFinal.has_receipt === true) {
        // Repetição recuperada: o payload original previa comprovante, mas o
        // arquivo não sobrevive ao remount. Pagamento confirmado + comprovante
        // pendente (nunca sucesso completo).
        return { comprovantePendente: true as const, paymentId: pid };
      }
      return { ok: true as const };
    },
    onSuccess: (r: any) => {
      if (r?.ignorado) return;
      invalidarTudo();
      if (!receber && !r?.reenvio) {
        // Pagamento confirmado: a tentativa deixa de estar incerta.
        limparTentativaIncerta(user?.id, installment?.id);
        tentativaRef.current = null;
        setExigeConferencia(false);
      }
      if (r?.comprovantePendente) {
        setPendente({ paymentId: r.paymentId });
        toast.error(receber ? MSG_COMPROVANTE_PENDENTE : MSG_PAGAMENTO_COMPROVANTE_PENDENTE);
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
    onSettled: (_d: unknown, _e: unknown, vars: any) => {
      // Só a execução dona da guarda libera a flag.
      if (!vars || vars.token === undefined || vars.token === donoRef.current) {
        enviandoRef.current = false;
      }
    },
    onError: (e: unknown) => {
      // Falha parcial anterior: consultas seguem invalidadas para refletir a baixa.
      if (pendente) invalidarTudo();
      if (receber) {
        // Erro local tipado mantém a mensagem; remoto passa por allowlist (nunca texto cru).
        toast.error(mapearErroBaixaRecebimento(e));
        return;
      }
      // Classificação única ponta a ponta: incerto trava novo envio até conferência.
      const c = classificarErroBaixaPagar(e);
      if (c.exigeConferencia) {
        setExigeConferencia(true);
        // Preserva chave + payload da tentativa para repetição idempotente após
        // fechar/reabrir ou remontar (nada de arquivo, token ou credencial).
        if (tentativaRef.current) salvarTentativaIncerta(tentativaRef.current);
      } else if (!pendente && !exigeConferencia) {
        // Recusa comprovada antes de qualquer tentativa incerta: nada a preservar.
        limparTentativaIncerta(user?.id, installment?.id);
        tentativaRef.current = null;
      }
      toast.error(c.mensagem);
    },
  });

  const acumP = acumuladosParcelaPagar(installment);
  // Payable mantém exatamente o fallback original (received_amount ?? paid_amount).
  const jaRecebido = receber ? acum.recebido : acumP.pago;
  const valorOriginal = receber ? acum.original : acumP.original;
  const desc = Number(form.discount_amount) || 0;
  const juros = Number(form.interest_amount) || 0;
  const multa = Number(form.penalty_amount) || 0;
  const valorBaixa = Number(form.amount) || 0;
  const saldoFinal = receber
    ? calcularSaldoRecebivel(installment, form)
    : calcularSaldoPagavel(installment, form);
  const saldoRestante = saldoFinal - valorBaixa;

  const settingsBloqueado = !settingsQuery.isSuccess;
  const gravando = save.isPending;
  // Edição travada por pendência de comprovante, resultado incerto OU enquanto grava.
  const travado = !!pendente || gravando || exigeConferencia;
  /** Arquivo: sempre travado enquanto grava; livre apenas em pendência ociosa. */
  const arquivoTravado = gravando || (!pendente && exigeConferencia);

  /** Handler único: adquire a guarda síncrona ANTES de disparar a mutação. */
  function iniciarEnvio(vars: { repetir?: boolean } = {}) {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    const token = donoRef.current + 1;
    donoRef.current = token;
    save.mutate({ ...vars, token });
  }

  /** Fechar nunca apaga pendência/resultado incerto em silêncio: exige confirmação. */
  function tentarFechar() {
    if (gravando) return;
    if (pendente) {
      const ok = window.confirm(
        `O ${receber ? "recebimento" : "pagamento"} já foi registrado, mas o comprovante ainda não foi anexado. Se fechar agora, retome o envio pelo drawer de anexos da conta. Deseja fechar mesmo assim?`,
      );
      if (!ok) return;
    } else if (exigeConferencia) {
      const ok = window.confirm(
        "Não foi possível confirmar se este pagamento foi registrado. Ao fechar, a tentativa fica guardada: reabra esta baixa e confira a conta antes de repetir. Deseja fechar mesmo assim?",
      );
      if (!ok) return;
    }
    onClose();
  }

  /** Conferência explícita do usuário: libera o formulário e descarta a tentativa guardada. */
  function confirmarConferencia() {
    if (gravando) return;
    limparTentativaIncerta(user?.id, installment?.id);
    tentativaRef.current = null;
    setExigeConferencia(false);
    idempotencyRef.current = crypto.randomUUID();
    setForm({ ...empty, amount: Math.max(0, saldoInicial) });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) tentarFechar(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar {receber ? "Recebimento" : "Pagamento"}</DialogTitle>
        </DialogHeader>

        {exigeConferencia && !pendente && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2" role="alert">
            <p>
              {MSG_PAGAMENTO_NAO_CONFIRMADO} A tentativa fica guardada: nenhum novo pagamento é enviado e nenhuma
              chave nova é gerada, mesmo fechando e reabrindo esta janela.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => iniciarEnvio({ repetir: true })} disabled={gravando}>
                Repetir a mesma tentativa
              </Button>
              <Button size="sm" variant="ghost" onClick={confirmarConferencia} disabled={gravando}>
                Já conferi a conta — liberar novo pagamento
              </Button>
            </div>
          </div>
        )}
        {pendente && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
            {receber ? MSG_COMPROVANTE_PENDENTE : MSG_PAGAMENTO_COMPROVANTE_PENDENTE} Se fechar esta janela, retome o envio pelo drawer de anexos da conta.
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
              <span className="text-muted-foreground">+ Juros acumulados:</span><span className="text-right">{brl(receber ? acum.juros : acumP.juros)}</span>
              <span className="text-muted-foreground">+ Multa acumulada:</span><span className="text-right">{brl(receber ? acum.multa : acumP.multa)}</span>
              <span className="text-muted-foreground">− Desconto acumulado:</span><span className="text-right">{brl(receber ? acum.desconto : acumP.desconto)}</span>
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
        {/* Arquivo travado enquanto grava ou com resultado incerto; liberado para o
            reenvio de um comprovante pendente (baixa já confirmada, zero RPC). */}
        <div className="space-y-2">
          <Label>
            Comprovante {settingsBloqueado ? "" : requireReceipt ? "*" : ""}
          </Label>
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileRef}
              className="hidden"
              disabled={arquivoTravado}
              onChange={(e) => { if (!arquivoTravado) setFile(e.target.files?.[0] || null); }}
            />
            {file ? (
              <div className="flex items-center gap-2 border rounded p-2 text-sm bg-muted flex-1 min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate flex-1">{file.name}</span>
                <Button type="button" variant="ghost" size="icon" disabled={arquivoTravado} onClick={() => setFile(null)} className="h-6 w-6"><X className="h-3 w-3" /></Button>
              </div>
            ) : (
              <Button type="button" variant="outline" className="w-full" disabled={arquivoTravado} onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Selecionar comprovante
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={tentarFechar} disabled={gravando}>{pendente ? "Fechar" : "Cancelar"}</Button>
          <Button
            onClick={() => iniciarEnvio()}
            // Reenvio só exige arquivo (baixa já persistida, zero RPC de baixa).
            // Resultado incerto trava novo envio até conferência explícita.
            // Nova baixa: settings carregadas obrigatórias.
            disabled={gravando || (pendente ? !file : exigeConferencia || settingsBloqueado)}
          >
            {pendente ? "Reenviar comprovante" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
