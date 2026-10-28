import { useEffect, useMemo, useState } from "react";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { supabase } from "@/integrations/supabase/client";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useDeliveryFinanceReconciliation } from "@/hooks/useDeliveryFinanceReconciliation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl } from "@/lib/financial/format";
import { MoneyInput } from "@/components/ui/money-input";
import { ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  entrega: any | null;
}

type Parcela = { installment_number: number; due_date: string; amount: number };

function genParcelas(total: number, count: number, firstDue: string, intervalDays: number): Parcela[] {
  const base = Math.round((total / count) * 100) / 100;
  let acc = 0;
  const out: Parcela[] = [];
  const [y, m, d] = firstDue.split("-").map(Number);
  for (let i = 0; i < count; i++) {
    const amount = i < count - 1 ? base : Math.round((total - acc) * 100) / 100;
    acc += amount;
    const dt = new Date(y, m - 1, d + i * intervalDays);
    out.push({
      installment_number: i + 1,
      due_date: dt.toISOString().slice(0, 10),
      amount,
    });
  }
  return out;
}

export function ConfirmarEntregaFinanceiroDialog({ open, onClose, entrega }: Props) {
  const access = useStorageAccessScope(`delivery-finance-form:${entrega?.id}`);
  return <DeliveryFinanceDialog key={access.scope} open={open} onClose={onClose} entrega={entrega} />;
}

function DeliveryFinanceDialog({ open, onClose, entrega }: Props) {
  const recovery = useDeliveryFinanceReconciliation(entrega?.id, open);
  const { access } = recovery;
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

  const qtd = Number(entrega?.quantidade_entregue || 0);
  const precoUnit = Number(entrega?.produtos?.valor_litro_brl || 0);

  const [form, setForm] = useState<any>({
    valor_unit: precoUnit || 0,
    first_due_date: today,
    installment_count: 1,
    interval_days: 30,
    category_id: "",
    cost_center_id: "",
    fiscal_invoice_required: "indeterminado", // tri-state: "sim", "nao", "indeterminado"
    payment_method_id: "",
    notes: "",
  });
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    if (open && entrega) {
      const p = Number(entrega?.produtos?.valor_litro_brl || 0);
      setForm((f: any) => ({ 
        ...f, 
        valor_unit: p, 
        first_due_date: today, 
        installment_count: 1, 
        interval_days: 30, 
        payment_method_id: "", 
        fiscal_invoice_required: "indeterminado",
        notes: "" 
      }));
      setEdited(false);
    }
  }, [entrega?.id]);

  const total = useMemo(
    () => Math.round(qtd * Number(form.valor_unit || 0) * 100) / 100,
    [qtd, form.valor_unit]
  );

  // Regera parcelas quando muda total/contagem/intervalo/firstDue (se não editado manualmente)
  useEffect(() => {
    if (edited) return;
    setParcelas(genParcelas(total, Number(form.installment_count) || 1, form.first_due_date, Number(form.interval_days) || 30));
  }, [total, form.installment_count, form.first_due_date, form.interval_days, edited]);

  const somaParcelas = useMemo(() => Math.round(parcelas.reduce((a, p) => a + Number(p.amount || 0), 0) * 100) / 100, [parcelas]);
  const somaOk = Math.abs(somaParcelas - total) < 0.01;

  const categoryQuery = useScopedPortalQuery({
    queryKey: ["fin-cat-rcv"],
    enabled: recovery.eligible, retry: false, staleTime: 0, refetchOnMount: "always",
    queryFn: async () => {
      const current = access.capture();
      if (!current()) throw new Error("Contexto indisponível");
      const { data, error } = await supabase.from("financial_categories").select("id, name, active, type").eq("active", true).eq("type", "RECEITA").order("name");
      if (!current()) throw new Error("Contexto alterado");
      if (error) throw error; return data;
    },
  }, { request: access, actor: access });
  const costQuery = useScopedPortalQuery({
    queryKey: ["fin-cc-act"],
    enabled: recovery.eligible, retry: false, staleTime: 0, refetchOnMount: "always",
    queryFn: async () => {
      const current = access.capture();
      if (!current()) throw new Error("Contexto indisponível");
      const { data, error } = await supabase.from("financial_cost_centers").select("id, name, active").eq("active", true).order("name");
      if (!current()) throw new Error("Contexto alterado");
      if (error) throw error; return data;
    },
  }, { request: access, actor: access });

  const paymentQuery = useScopedPortalQuery({
    queryKey: ["fin-pm-act"],
    enabled: recovery.eligible, retry: false, staleTime: 0, refetchOnMount: "always",
    queryFn: async () => {
      const current = access.capture();
      if (!current()) throw new Error("Contexto indisponível");
      const { data, error } = await supabase.from("payment_methods").select("id, name, active").eq("active", true).order("name");
      if (!current()) throw new Error("Contexto alterado");
      if (error) throw error; return data;
    },
  }, { request: access, actor: access });

  const catalogsReady = recovery.eligible && [categoryQuery, costQuery, paymentQuery].every(q => q.isSuccess && !q.error && !q.isFetching);
  const categories = catalogsReady ? (categoryQuery.data ?? []).filter(c => c.active === true && c.type === "RECEITA") : [];
  const ccs = catalogsReady ? (costQuery.data ?? []).filter(c => c.active === true) : [];
  const paymentMethods = catalogsReady ? (paymentQuery.data ?? []).filter(p => p.active === true) : [];
  const draftValid = catalogsReady && categories.some(c => c.id === form.category_id) && paymentMethods.some(p => p.id === form.payment_method_id);
  const jaFaturada = !!recovery.receipt;

  if (!entrega) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar contas a receber da entrega</DialogTitle>
        </DialogHeader>

        {recovery.eligible && <div className="rounded-md border bg-muted/30 p-3 text-sm grid grid-cols-2 gap-2">
          <div><span className="text-muted-foreground">Cliente:</span> <strong>{entrega.clientes?.nome || "—"}</strong></div>
          <div><span className="text-muted-foreground">Produto:</span> {entrega.produtos?.nome || "—"}</div>
          <div><span className="text-muted-foreground">Quantidade:</span> <strong>{qtd}</strong></div>
          <div><span className="text-muted-foreground">Lote:</span> <span className="font-mono">{entrega.lotes?.codigo_lote || "—"}</span></div>
        </div>}

        <div role="status" className="text-sm text-muted-foreground">
          {!recovery.eligible ? "Entrega indisponível neste contexto." :
            recovery.state === "fiscal_pendente" ? "Recebível confirmado. Fiscal pendente; nenhuma segunda cobrança será enviada." :
            recovery.state === "recebivel_confirmado" ? "Recebível confirmado por consulta autorizada." :
            recovery.state === "rejeitado" ? recovery.message : "Resposta incerta. Reconsulte o lançamento antes de qualquer nova cobrança."}
        </div>
        {recovery.eligible && !jaFaturada && <p className="text-sm text-muted-foreground">{recovery.message}</p>}

        {jaFaturada ? (
          <div className="rounded-md border border-border bg-muted p-3 text-sm">
            <p>Esta entrega já possui faturamento gerado.</p>
            <p>Total confirmado: {brl(Number(recovery.receipt?.total_amount))}</p>
            <Button size="sm" variant="link" className="px-0" onClick={() => {
              if (access.capture()() && recovery.receipt) navigate(`/financeiro/receber?id=${recovery.receipt.id}`);
            }}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir lançamento financeiro
            </Button>
          </div>
        ) : recovery.eligible ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
              <div><Label>Valor unitário</Label><MoneyInput value={form.valor_unit} onValueChange={(v) => { setForm({ ...form, valor_unit: v }); setEdited(false); }} /></div>
              <div><Label>Total estimado (não confirmado)</Label><Input value={brl(total)} readOnly className="font-mono-data font-bold text-primary" /></div>

              <div>
                <Label>Categoria *</Label>
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>{categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Centro de custo</Label>
                <Select value={form.cost_center_id || "none"} onValueChange={(v) => setForm({ ...form, cost_center_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Sem centro" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem centro</SelectItem>
                    {ccs.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div><Label>1º vencimento</Label><Input type="date" value={form.first_due_date} onChange={(e) => { setForm({ ...form, first_due_date: e.target.value }); setEdited(false); }} /></div>
              <div><Label>Nº de parcelas</Label><Input type="number" min={1} max={36} value={form.installment_count} onChange={(e) => { setForm({ ...form, installment_count: Math.max(1, Number(e.target.value)) }); setEdited(false); }} /></div>

              <div>
                <Label>Intervalo entre parcelas (dias)</Label>
                <Input type="number" min={1} max={180} value={form.interval_days} onChange={(e) => { setForm({ ...form, interval_days: Math.max(1, Number(e.target.value)) }); setEdited(false); }} />
              </div>
              <div>
                <Label>Forma de pagamento *</Label>
                <Select value={form.payment_method_id} onValueChange={(v) => setForm({ ...form, payment_method_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((pm: any) => <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2 space-y-2 border rounded-md p-3">
                <Label>Exigirá emissão de NF-e?</Label>
                <Select value={form.fiscal_invoice_required} onValueChange={(v) => setForm({ ...form, fiscal_invoice_required: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim (Obrigatório)</SelectItem>
                    <SelectItem value="nao">Não (Isento/Outro)</SelectItem>
                    <SelectItem value="indeterminado">Definir depois</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2"><Label>Observações financeiras</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
            </div>

            <p className="text-sm text-muted-foreground">Agenda apenas para revisão. Parcelas personalizadas dependem de contrato financeiro revisado; parcelas existentes não serão substituídas.</p>
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label>Parcelas</Label>
                <span className={`text-xs ${somaOk ? "text-muted-foreground" : "text-destructive font-medium"}`}>
                  Soma: {brl(somaParcelas)} / {brl(total)}
                </span>
              </div>
              <div className="rounded-md border divide-y">
                {parcelas.map((p, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 text-sm">
                    <div className="col-span-1 text-muted-foreground">#{p.installment_number}</div>
                    <div className="col-span-6">
                      <Input type="date" value={p.due_date}
                        onChange={(e) => { const c = [...parcelas]; c[idx] = { ...c[idx], due_date: e.target.value }; setParcelas(c); setEdited(true); }} />
                    </div>
                    <div className="col-span-5">
                      <MoneyInput value={p.amount}
                        onValueChange={(v) => { const c = [...parcelas]; c[idx] = { ...c[idx], amount: v }; setParcelas(c); setEdited(true); }}
                        className="h-9 text-sm" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button variant="outline" onClick={() => void recovery.reconsultar()} disabled={!recovery.eligible || recovery.pending}>
            {recovery.pending ? "Consultando…" : "Reconsultar lançamento"}
          </Button>
          {!jaFaturada && <Button onClick={recovery.reject} disabled={!recovery.eligible || !draftValid || !somaOk || !Number.isFinite(total) || total <= 0}>Revisar cobrança indisponível</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
