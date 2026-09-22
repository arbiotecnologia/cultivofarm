import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { brl, generateInstallments } from "@/lib/financial/format";
import { MoneyInput } from "@/components/ui/money-input";
import { getClienteLabel } from "@/lib/clienteLabel";
import { hojeSaoPaulo } from "@/lib/financeiro/contasReceber";
import {
  ErroNovaContaLocal,
  MSG_NOVA_CONTA_NAO_CONFIRMADA,
  PARCELAS_MAX,
  PARCELAS_MIN,
  criacaoBemSucedida,
  gerarParcelasReceber,
  mapearErroNovaConta,
  validarNovaContaReceber,
} from "@/lib/financeiro/novaContaReceber";

type Kind = "receivable" | "payable";

interface Props { open: boolean; onClose: () => void; kind: Kind; }

const PAGINA = 1000;

/** Carrega todas as páginas em ordem estável, sem truncar em 1000. */
async function carregarTudo(tabela: string, colunas: string, aplicar: (q: any) => any) {
  const linhas: any[] = [];
  for (let pagina = 0; ; pagina++) {
    let q = (supabase as any).from(tabela).select(colunas);
    q = aplicar(q);
    const { data, error } = await q.range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    if (error) throw error;
    const lote = data ?? [];
    linhas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return linhas;
}

export function NovaContaDialog({ open, onClose, kind }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isReceivable = kind === "receivable";
  const today = isReceivable ? hojeSaoPaulo() : new Date().toISOString().slice(0, 10);
  const empty: any = {
    customer_id: "",
    supplier_name: "",
    description: "",
    category_id: "",
    cost_center_id: "",
    total_amount: 0,
    issue_date: today,
    first_due_date: today,
    installment_count: 1,
    notes: "",
    fiscal_invoice_required: false,
    supplier_invoice_date: "",
    origin_type: "MANUAL",
  };
  const [form, setForm] = useState<any>(empty);
  const [installments, setInstallments] = useState<{ installment_number: number; due_date: string; amount: number }[]>([]);
  const [erroParcelas, setErroParcelas] = useState<string | null>(null);
  const [exigeConferencia, setExigeConferencia] = useState(false);
  const [tentouEnviar, setTentouEnviar] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(empty);
    setErroParcelas(null);
    setExigeConferencia(false);
    setTentouEnviar(false);
    setInstallments(
      isReceivable ? gerarParcelasReceber(0, 1, today).parcelas : generateInstallments(0, 1, today),
    );
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open]);

  useEffect(() => {
    if (!isReceivable) {
      setInstallments(generateInstallments(Number(form.total_amount) || 0, Number(form.installment_count) || 1, form.first_due_date));
      return;
    }
    const r = gerarParcelasReceber(form.total_amount, Number(form.installment_count), form.first_due_date);
    setErroParcelas(r.erro);
    if (!r.erro) setInstallments(r.parcelas);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [form.total_amount, form.installment_count, form.first_due_date, isReceivable]);

  const clientesQ = useQuery({
    queryKey: ["fin-clientes"],
    queryFn: () => carregarTudo("clientes", "id, nome, codigo_cliente", (q) => q.order("nome").order("id")),
    enabled: isReceivable,
  });
  const categoriasQ = useQuery({
    queryKey: ["fin-categories-active", kind],
    queryFn: () => {
      const tipos = isReceivable ? ["RECEITA", "AMBOS"] : ["DESPESA", "AMBOS"];
      return carregarTudo("financial_categories", "id, name, type, active", (q) =>
        q.eq("active", true).in("type", tipos).order("name").order("id"),
      );
    },
  });
  const ccsQ = useQuery({
    queryKey: ["fin-cc-active"],
    queryFn: () => carregarTudo("financial_cost_centers", "id, name", (q) => q.eq("active", true).order("name").order("id")),
  });

  const clientes = clientesQ.data ?? [];
  const categories = categoriasQ.data ?? [];
  const ccs = ccsQ.data ?? [];

  const sumInstallments = useMemo(() => installments.reduce((s, r) => s + (Number(r.amount) || 0), 0), [installments]);
  const diff = Math.round((sumInstallments - Number(form.total_amount || 0)) * 100) / 100;

  const validarReceivable = (): string | null =>
    validarNovaContaReceber({
      temSessao: !!user,
      description: form.description,
      customer_id: form.customer_id,
      category_id: form.category_id,
      categoriasAtivas: categories.map((c: any) => c.id),
      categoriasCarregadas: categoriasQ.isSuccess,
      cost_center_id: form.cost_center_id,
      centrosAtivos: ccs.map((c: any) => c.id),
      centrosCarregados: ccsQ.isSuccess,
      clientesCarregados: clientesQ.isSuccess,
      total_amount: form.total_amount,
      issue_date: form.issue_date,
      first_due_date: form.first_due_date,
      installment_count: Number(form.installment_count),
      installments,
    });

  const save = useMutation({
    retry: false,
    mutationFn: async () => {
      if (isReceivable) {
        if (exigeConferencia) throw new ErroNovaContaLocal(MSG_NOVA_CONTA_NAO_CONFIRMADA);
        const erro = validarReceivable();
        if (erro) throw new ErroNovaContaLocal(erro);
        if (erroParcelas) throw new ErroNovaContaLocal(erroParcelas);
      } else {
        if (!user) throw new Error("Sessão expirada");
        if (!form.description) throw new Error("Descrição é obrigatória");
        if (!form.category_id) throw new Error("Categoria é obrigatória");
        if (Math.abs(diff) > 0.01) throw new Error(`Soma das parcelas (${brl(sumInstallments)}) difere do total (${brl(form.total_amount)})`);
        if (!form.supplier_name) throw new Error("Fornecedor é obrigatório");
      }

      const payload: any = {
        description: isReceivable ? String(form.description).trim() : form.description,
        category_id: form.category_id,
        cost_center_id: form.cost_center_id || null,
        total_amount: Number(form.total_amount),
        issue_date: form.issue_date,
        first_due_date: form.first_due_date,
        installment_count: installments.length,
        notes: form.notes || null,
        installments: installments.map((r) => ({
          installment_number: r.installment_number,
          due_date: r.due_date,
          amount: r.amount,
        })),
      };

      if (isReceivable) {
        payload.customer_id = form.customer_id;
        payload.fiscal_invoice_required = !!form.fiscal_invoice_required;
      } else {
        payload.supplier_name = form.supplier_name || null;
        payload.supplier_invoice_date = form.supplier_invoice_date || null;
      }

      const chamar = async (signal: AbortSignal | undefined) => {
        let req = (supabase as any).rpc("rpc_create_financial_title" as any, {
          p_kind: kind,
          p_payload: payload,
        });
        if (signal && typeof req?.abortSignal === "function") req = req.abortSignal(signal);
        return await req;
      };

      const { data, error } = isReceivable
        ? await executarComDeadlineNovaConta(chamar)
        : await chamar(undefined);
      if (error) throw error;
      if (isReceivable && !criacaoBemSucedida(data)) {
        throw new ErroCriacaoIncerta();
      }
      return data;
    },
    onSuccess: () => {
      toast.success(isReceivable ? "Conta a receber criada" : "Conta a pagar criada");
      qc.invalidateQueries({ queryKey: [isReceivable ? "ar-list" : "ap-list"] });
      qc.invalidateQueries({ queryKey: ["financeiro-dashboard"] });
      qc.invalidateQueries({ queryKey: ["fluxo-caixa"] });
      qc.invalidateQueries({ queryKey: ["dre"] });
      onClose();
    },
    onError: (e: any) => {
      if (!isReceivable) {
        toast.error(e?.message || "Falha ao criar título financeiro");
        return;
      }
      const { mensagem, exigeConferencia: exige } = classificarErroNovaConta(e);
      if (exige) setExigeConferencia(true);
      toast.error(mensagem);
    },

  });

  const enviando = save.isPending;
  const travado = enviando || (isReceivable && exigeConferencia);
  const erroLocalReceivable = isReceivable ? (erroParcelas ?? validarReceivable()) : null;

  const blocoConsulta = (rotulo: string, q: { isLoading: boolean; isError: boolean; refetch: () => void }, vazio: boolean) => {
    if (q.isLoading) return <p className="text-xs text-muted-foreground mt-1">Carregando {rotulo}…</p>;
    if (q.isError) {
      return (
        <p className="text-xs text-destructive mt-1">
          Não foi possível carregar {rotulo}.{" "}
          <button type="button" className="underline" onClick={() => q.refetch()}>Tentar novamente</button>
        </p>
      );
    }
    if (vazio) return <p className="text-xs text-muted-foreground mt-1">Nenhum registro disponível em {rotulo}.</p>;
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !enviando) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova {isReceivable ? "Conta a Receber" : "Conta a Pagar"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isReceivable ? (
            <div className="sm:col-span-2">
              <Label htmlFor="nc-cliente">Cliente *</Label>
              <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })} disabled={travado}>
                <SelectTrigger id="nc-cliente"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c: any) => <SelectItem key={c.id} value={c.id}>{getClienteLabel(c)}</SelectItem>)}
                </SelectContent>
              </Select>
              {blocoConsulta("clientes", clientesQ, clientes.length === 0)}
            </div>
          ) : (
            <div className="sm:col-span-2">
              <Label htmlFor="nc-fornecedor">Fornecedor</Label>
              <Input id="nc-fornecedor" value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} placeholder="Nome do fornecedor" />
            </div>
          )}

          <div className="sm:col-span-2">
            <Label htmlFor="nc-descricao">Descrição *</Label>
            <Input id="nc-descricao" value={form.description} disabled={travado} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div>
            <Label htmlFor="nc-categoria">Categoria *</Label>
            <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })} disabled={travado}>
              <SelectTrigger id="nc-categoria"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>{categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            {blocoConsulta("categorias", categoriasQ, categories.length === 0)}
          </div>
          <div>
            <Label htmlFor="nc-cc">Centro de custo</Label>
            <Select value={form.cost_center_id || "none"} onValueChange={(v) => setForm({ ...form, cost_center_id: v === "none" ? "" : v })} disabled={travado}>
              <SelectTrigger id="nc-cc"><SelectValue placeholder="Sem centro" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem centro</SelectItem>
                {ccs.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {blocoConsulta("centros de custo", ccsQ, ccs.length === 0)}
          </div>

          <div>
            <Label htmlFor="nc-total">Valor total *</Label>
            <MoneyInput
              id="nc-total"
              value={form.total_amount}
              disabled={travado}
              onValueChange={(v) => setForm({ ...form, total_amount: v })}
            />
          </div>
          <div>
            <Label htmlFor="nc-parcelas">Nº de parcelas</Label>
            <Input
              id="nc-parcelas"
              type="number"
              min={PARCELAS_MIN}
              max={isReceivable ? PARCELAS_MAX : 120}
              disabled={travado}
              value={form.installment_count}
              onChange={(e) => setForm({ ...form, installment_count: Math.max(1, Number(e.target.value)) })}
            />
          </div>

          <div>
            <Label htmlFor="nc-emissao">Data de emissão</Label>
            <Input id="nc-emissao" type="date" disabled={travado} value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="nc-venc">1º vencimento</Label>
            <Input id="nc-venc" type="date" disabled={travado} value={form.first_due_date} onChange={(e) => setForm({ ...form, first_due_date: e.target.value })} />
          </div>
          {!isReceivable && (
            <div>
              <Label htmlFor="nc-nota">Data da nota do fornecedor</Label>
              <Input id="nc-nota" type="date" value={form.supplier_invoice_date} onChange={(e) => setForm({ ...form, supplier_invoice_date: e.target.value })} />
            </div>
          )}

          {isReceivable && (
            <div className="sm:col-span-2 flex items-center justify-between border rounded-md p-3">
              <Label htmlFor="nc-nfe" className="m-0">NF-e obrigatória</Label>
              <Switch id="nc-nfe" disabled={travado} checked={form.fiscal_invoice_required} onCheckedChange={(v) => setForm({ ...form, fiscal_invoice_required: v })} />
            </div>
          )}

          <div className="sm:col-span-2">
            <Label htmlFor="nc-obs">Observações</Label>
            <Textarea id="nc-obs" disabled={travado} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>

        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Parcelas</h3>
            <span className={`text-xs ${Math.abs(diff) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
              Soma: {brl(sumInstallments)} {Math.abs(diff) > 0.01 && `(diferença ${brl(diff)})`}
            </span>
          </div>
          {isReceivable && tentouEnviar && erroLocalReceivable && (
            <p className="text-xs text-destructive mb-2" role="alert">{erroLocalReceivable}</p>
          )}
          {isReceivable && exigeConferencia && (
            <p className="text-xs text-destructive mb-2" role="alert">{MSG_NOVA_CONTA_NAO_CONFIRMADA}</p>
          )}
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {installments.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{row.installment_number}</TableCell>
                    <TableCell><Input aria-label={`Vencimento da parcela ${row.installment_number}`} type="date" disabled={travado} value={row.due_date} onChange={(e) => {
                      const next = [...installments]; next[idx] = { ...row, due_date: e.target.value }; setInstallments(next);
                    }} /></TableCell>
                    <TableCell>
                      <MoneyInput
                        aria-label={`Valor da parcela ${row.installment_number}`}
                        value={row.amount}
                        disabled={travado}
                        onValueChange={(v) => {
                          const next = [...installments];
                          next[idx] = { ...row, amount: v ?? 0 };
                          setInstallments(next);
                        }}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button
            onClick={() => { setTentouEnviar(true); save.mutate(); }}
            disabled={enviando || travado || (!isReceivable && !form.description)}
          >
            {enviando ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
