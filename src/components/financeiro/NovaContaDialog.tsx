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
import { addMonths, brl, generateInstallments } from "@/lib/financial/format";
import { MoneyInput } from "@/components/ui/money-input";
import { getClienteLabel } from "@/lib/clienteLabel";


type Kind = "receivable" | "payable";

interface Props { open: boolean; onClose: () => void; kind: Kind; }

export function NovaContaDialog({ open, onClose, kind }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
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
    origin_type: kind === "receivable" ? "MANUAL" : "MANUAL",
  };
  const [form, setForm] = useState<any>(empty);
  const [installments, setInstallments] = useState<{ installment_number: number; due_date: string; amount: number }[]>([]);

  useEffect(() => { if (open) { setForm(empty); setInstallments(generateInstallments(0, 1, today)); } /* eslint-disable-line */ }, [open]);

  useEffect(() => {
    setInstallments(generateInstallments(Number(form.total_amount) || 0, Number(form.installment_count) || 1, form.first_due_date));
  }, [form.total_amount, form.installment_count, form.first_due_date]);

  const { data: clientes = [] } = useQuery({
    queryKey: ["fin-clientes"],
    queryFn: async () => { const { data, error } = await (supabase as any).from("clientes").select("id, nome, codigo_cliente").order("nome"); if (error) throw error; return data; },
    enabled: kind === "receivable",
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["fin-categories-active", kind],
    queryFn: async () => {
      const tipos = kind === "receivable" ? ["RECEITA", "AMBOS"] : ["DESPESA", "AMBOS"];
      const { data, error } = await (supabase as any).from("financial_categories").select("*").eq("active", true).in("type", tipos).order("name");
      if (error) throw error; return data;
    },
  });
  const { data: ccs = [] } = useQuery({
    queryKey: ["fin-cc-active"],
    queryFn: async () => { const { data, error } = await (supabase as any).from("financial_cost_centers").select("id, name").eq("active", true).order("name"); if (error) throw error; return data; },
  });

  const sumInstallments = useMemo(() => installments.reduce((s, r) => s + (Number(r.amount) || 0), 0), [installments]);
  const diff = Math.round((sumInstallments - Number(form.total_amount || 0)) * 100) / 100;

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sessão expirada");
      if (!form.description) throw new Error("Descrição é obrigatória");
      if (!form.category_id) throw new Error("Categoria é obrigatória");
      if (Math.abs(diff) > 0.01) throw new Error(`Soma das parcelas (${brl(sumInstallments)}) difere do total (${brl(form.total_amount)})`);
      if (kind === "receivable" && !form.customer_id) throw new Error("Cliente é obrigatório");
      if (kind === "payable" && !form.supplier_name) throw new Error("Fornecedor é obrigatório");

      const payload: any = {
        description: form.description,
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

      if (kind === "receivable") {
        payload.customer_id = form.customer_id;
        payload.fiscal_invoice_required = !!form.fiscal_invoice_required;
      } else {
        payload.supplier_name = form.supplier_name || null;
        payload.supplier_invoice_date = form.supplier_invoice_date || null;
      }

      const { data, error } = await (supabase as any).rpc("rpc_create_financial_title" as any, {
        p_kind: kind,
        p_payload: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(kind === "receivable" ? "Conta a receber criada" : "Conta a pagar criada");
      qc.invalidateQueries({ queryKey: [kind === "receivable" ? "ar-list" : "ap-list"] });
      qc.invalidateQueries({ queryKey: ["financeiro-dashboard"] });
      qc.invalidateQueries({ queryKey: ["fluxo-caixa"] });
      qc.invalidateQueries({ queryKey: ["dre"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message || "Falha ao criar título financeiro"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova {kind === "receivable" ? "Conta a Receber" : "Conta a Pagar"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {kind === "receivable" ? (
            <div className="sm:col-span-2">
              <Label>Cliente *</Label>
              <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c: any) => <SelectItem key={c.id} value={c.id}>{getClienteLabel(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <Label>Fornecedor</Label>
              <Input value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} placeholder="Nome do fornecedor" />
            </div>
          )}

          <div className="sm:col-span-2"><Label>Descrição *</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>

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

          <div>
            <Label>Valor total *</Label>
            <MoneyInput
              value={form.total_amount}
              onValueChange={(v) => setForm({ ...form, total_amount: v })}
            />
          </div>
          <div><Label>Nº de parcelas</Label><Input type="number" min={1} max={120} value={form.installment_count} onChange={(e) => setForm({ ...form, installment_count: Math.max(1, Number(e.target.value)) })} /></div>

          <div><Label>Data de emissão</Label><Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></div>
          <div><Label>1º vencimento</Label><Input type="date" value={form.first_due_date} onChange={(e) => setForm({ ...form, first_due_date: e.target.value })} /></div>
          {kind === "payable" && (
            <div><Label>Data da nota do fornecedor</Label><Input type="date" value={form.supplier_invoice_date} onChange={(e) => setForm({ ...form, supplier_invoice_date: e.target.value })} /></div>
          )}

          {kind === "receivable" && (
            <div className="sm:col-span-2 flex items-center justify-between border rounded-md p-3">
              <Label className="m-0">NF-e obrigatória</Label>
              <Switch checked={form.fiscal_invoice_required} onCheckedChange={(v) => setForm({ ...form, fiscal_invoice_required: v })} />
            </div>
          )}

          <div className="sm:col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
        </div>

        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Parcelas</h3>
            <span className={`text-xs ${Math.abs(diff) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
              Soma: {brl(sumInstallments)} {Math.abs(diff) > 0.01 && `(diferença ${brl(diff)})`}
            </span>
          </div>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {installments.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{row.installment_number}</TableCell>
                    <TableCell><Input type="date" value={row.due_date} onChange={(e) => {
                      const next = [...installments]; next[idx] = { ...row, due_date: e.target.value }; setInstallments(next);
                    }} /></TableCell>
                    <TableCell>
                      <MoneyInput
                        value={row.amount}
                        onValueChange={(v) => {
                          const next = [...installments];
                          next[idx] = { ...row, amount: v };
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
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.description}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
