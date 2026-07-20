import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { KpiCard } from "@/components/financeiro/KpiCard";
import { toast } from "sonner";
import { brl, fmtDate } from "@/lib/financial/format";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { PageHeader } from "@/components/ResponsiveHelpers";
import { MoneyInput } from "@/components/ui/money-input";
import { Plus, Play, Eye, Pause, PlayCircle, XCircle, Repeat, AlertTriangle, TrendingUp, TrendingDown, Wallet, BarChart as ChartIcon, List } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";


const FREQS = [
  { v: "MONTHLY", l: "Mensal" },
  { v: "WEEKLY", l: "Semanal" },
  { v: "BIWEEKLY", l: "Quinzenal" },
  { v: "QUARTERLY", l: "Trimestral" },
  { v: "YEARLY", l: "Anual" },
];

const FREQ_LABEL = (v: string) => FREQS.find(f => f.v === v)?.l || v;

export default function Recorrencias() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "paused" | "RECEIVABLE" | "PAYABLE">("all");

  const today = new Date().toISOString().slice(0, 10);
  const emptyForm = {
    type: "PAYABLE", description: "", customer_id: "", supplier_name: "",
    category_id: "", cost_center_id: "", amount: 0,
    recurrence_frequency: "MONTHLY", due_day: 10,
    start_date: today, end_date: "",
    auto_generate: true, fiscal_invoice_required: false,
    payment_method_id: "", bank_account_id: "", notes: "",
  };
  const [form, setForm] = useState<any>(emptyForm);

  const { data: items = [] } = useQuery({
    queryKey: ["recurring-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_financial_templates")
        .select("*, financial_categories(name), clientes(nome), financial_cost_centers(name)")
        .order("next_generation_date", { ascending: true, nullsFirst: false });
      if (error) throw error; return data;
    },
  });

  const { data: clientes = [] } = useQuery({ queryKey: ["rec-clientes"], queryFn: async () => { const { data } = await supabase.from("clientes").select("id, nome").order("nome"); return data || []; } });
  const { data: cats = [] } = useQuery({ queryKey: ["rec-cats"], queryFn: async () => { const { data } = await supabase.from("financial_categories").select("*").eq("active", true).order("name"); return data || []; } });
  const { data: ccs = [] } = useQuery({ queryKey: ["rec-ccs"], queryFn: async () => { const { data } = await supabase.from("financial_cost_centers").select("id, name").eq("active", true).order("name"); return data || []; } });

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sessão expirada");
      if (!form.description.trim()) throw new Error("Descrição é obrigatória");
      if (!form.category_id) throw new Error("Categoria é obrigatória");
      if (form.type === "RECEIVABLE" && !form.customer_id) throw new Error("Cliente é obrigatório");
      if (!form.amount || form.amount <= 0) throw new Error("Valor deve ser maior que zero");

      const payload: any = {
        type: form.type,
        description: form.description,
        category_id: form.category_id,
        cost_center_id: form.cost_center_id || null,
        amount: Number(form.amount),
        recurrence_frequency: form.recurrence_frequency,
        due_day: form.due_day ? Number(form.due_day) : null,
        start_date: form.start_date,
        end_date: form.end_date || null,
        auto_generate: form.auto_generate,
        fiscal_invoice_required: form.type === "RECEIVABLE" ? form.fiscal_invoice_required : false,
        notes: form.notes || null,
        customer_id: form.type === "RECEIVABLE" ? form.customer_id : null,
        supplier_name: form.type === "PAYABLE" ? (form.supplier_name || null) : null,
        created_by: user.id,
      };
      const { error } = await supabase.from("recurring_financial_templates").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Recorrência criada"); qc.invalidateQueries({ queryKey: ["recurring-list"] }); setOpen(false); setForm(emptyForm); },
    onError: (e: any) => toast.error(e.message),
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("fn_run_recurring_generation");
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const count = Array.isArray(data) ? data.length : 0;
      const success = Array.isArray(data) ? data.filter((d: any) => d.status === "SUCCESS").length : 0;
      toast.success(`Geração executada: ${success}/${count} sucesso`);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pause = useMutation({
    mutationFn: async ({ id, paused }: { id: string; paused: boolean }) => {
      const { error } = await supabase.from("recurring_financial_templates").update({ active: !paused, paused_at: paused ? new Date().toISOString() : null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Atualizado"); qc.invalidateQueries({ queryKey: ["recurring-list"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  // KPIs
  const kpi = useMemo(() => {
    const ativos = items.filter((i: any) => i.active);
    const startMonth = new Date(); startMonth.setDate(1);
    const endMonth = new Date(startMonth); endMonth.setMonth(endMonth.getMonth() + 1);
    const todayDate = new Date();
    const receitas = ativos.filter((i: any) => i.type === "RECEIVABLE" && i.next_generation_date && new Date(i.next_generation_date) < endMonth).reduce((s: number, i: any) => s + Number(i.amount), 0);
    const despesas = ativos.filter((i: any) => i.type === "PAYABLE" && i.next_generation_date && new Date(i.next_generation_date) < endMonth).reduce((s: number, i: any) => s + Number(i.amount), 0);
    const vencidas = ativos.filter((i: any) => i.next_generation_date && new Date(i.next_generation_date + "T12:00:00") < todayDate).length;
    return { ativos: ativos.length, receitas, despesas, saldo: receitas - despesas, vencidas };
  }, [items]);

  const filtered = useMemo(() => items.filter((r: any) => {
    if (filter === "active") return r.active;
    if (filter === "paused") return !r.active;
    if (filter === "RECEIVABLE" || filter === "PAYABLE") return r.type === filter;
    return true;
  }), [items, filter]);

  const projection = useMemo(() => {
    const result: any[] = [];
    const activeItems = items.filter((i: any) => i.active);
    for (let m = 0; m < 6; m++) {
      const d = new Date(); d.setMonth(d.getMonth() + m);
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      let receitas = 0; let despesas = 0;
      activeItems.forEach((i: any) => {
        const amt = Number(i.amount);
        if (i.recurrence_frequency === "MONTHLY") { receitas += i.type === "RECEIVABLE" ? amt : 0; despesas += i.type === "PAYABLE" ? amt : 0; }
        else if (i.recurrence_frequency === "WEEKLY") { receitas += i.type === "RECEIVABLE" ? amt * 4 : 0; despesas += i.type === "PAYABLE" ? amt * 4 : 0; }
        else if (i.recurrence_frequency === "BIWEEKLY") { receitas += i.type === "RECEIVABLE" ? amt * 2 : 0; despesas += i.type === "PAYABLE" ? amt * 2 : 0; }
        else if (i.recurrence_frequency === "QUARTERLY" && m % 3 === 0) { receitas += i.type === "RECEIVABLE" ? amt : 0; despesas += i.type === "PAYABLE" ? amt : 0; }
        else if (i.recurrence_frequency === "YEARLY" && m === 0) { receitas += i.type === "RECEIVABLE" ? amt : 0; despesas += i.type === "PAYABLE" ? amt : 0; }
      });
      result.push({ label, receitas, despesas, saldo: receitas - despesas });
    }
    return result;
  }, [items]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Recorrências financeiras"
        description="Contratos mensais, despesas fixas e geração automática de títulos"
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
              <Play className="h-4 w-4 mr-2" />Executar geração agora
            </Button>
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Nova recorrência</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Ativas" value={String(kpi.ativos)} icon={Repeat} />
        <KpiCard label="Receitas previstas no mês" value={brl(kpi.receitas)} icon={TrendingUp} tone="success" />
        <KpiCard label="Despesas previstas no mês" value={brl(kpi.despesas)} icon={TrendingDown} tone="warning" />
        <KpiCard label="Saldo recorrente mensal" value={brl(kpi.saldo)} icon={Wallet} tone={kpi.saldo >= 0 ? "success" : "danger"} />
        <KpiCard label="Com geração vencida" value={String(kpi.vencidas)} icon={AlertTriangle} tone={kpi.vencidas > 0 ? "danger" : "default"} />
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list"><List className="h-4 w-4 mr-2" />Lista de Templates</TabsTrigger>
          <TabsTrigger value="projection"><ChartIcon className="h-4 w-4 mr-2" />Projeção (6 meses)</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { v: "all", l: "Todas" },
                  { v: "active", l: "Ativas" },
                  { v: "paused", l: "Pausadas" },
                  { v: "RECEIVABLE", l: "Receitas" },
                  { v: "PAYABLE", l: "Despesas" },
                ].map(f => (
                  <Button key={f.v} size="sm" variant={filter === f.v ? "default" : "outline"} onClick={() => setFilter(f.v as any)}>{f.l}</Button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Cliente/Fornecedor</TableHead>
                      <TableHead>Frequência</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Próxima geração</TableHead>
                      <TableHead>Auto</TableHead>
                      <TableHead>Ativa</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhuma recorrência</TableCell></TableRow>
                    ) : filtered.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.description || r.name}</TableCell>
                        <TableCell><Badge variant={r.type === "RECEIVABLE" ? "default" : "secondary"}>{r.type === "RECEIVABLE" ? "Receita" : "Despesa"}</Badge></TableCell>
                        <TableCell className="text-sm">{r.clientes?.nome || r.supplier_name || "—"}</TableCell>
                        <TableCell>{FREQ_LABEL(r.recurrence_frequency)}</TableCell>
                        <TableCell className="font-semibold">{brl(r.amount)}</TableCell>
                        <TableCell>{fmtDate(r.next_generation_date)}</TableCell>
                        <TableCell>{r.auto_generate ? <Badge variant="outline">Sim</Badge> : <Badge variant="secondary">Não</Badge>}</TableCell>
                        <TableCell>
                          <Switch checked={r.active} onCheckedChange={(v) => pause.mutate({ id: r.id, paused: !v })} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => setDrawerId(r.id)}><Eye className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projection">
          <Card>
            <CardHeader><CardTitle className="text-base">Previsão de Receitas e Despesas Recorrentes (Próximos 6 meses)</CardTitle></CardHeader>
            <CardContent>
              <div style={{ width: "100%", height: 350 }}>
                <ResponsiveContainer>
                  <BarChart data={projection}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => brl(v)} />
                    <Legend />
                    <Bar dataKey="receitas" fill="#10b981" name="Receita Prevista" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesas" fill="#f43f5e" name="Despesa Prevista" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                {projection.map(p => (
                  <Card key={p.label} className="bg-muted/30">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs font-semibold uppercase">{p.label}</p>
                      <p className="text-sm font-bold text-emerald-600">{brl(p.receitas)}</p>
                      <p className="text-sm font-bold text-rose-600">{brl(p.despesas)}</p>
                      <hr className="my-1" />
                      <p className={`text-xs font-bold ${p.saldo >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{brl(p.saldo)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIALOG NOVA RECORRÊNCIA */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova recorrência</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECEIVABLE">Receita recorrente</SelectItem>
                  <SelectItem value="PAYABLE">Despesa recorrente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Frequência *</Label>
              <Select value={form.recurrence_frequency} onValueChange={(v) => setForm({ ...form, recurrence_frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FREQS.map(f => <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>Descrição *</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Contrato mensal Fazenda Aliança" /></div>

            {form.type === "RECEIVABLE" ? (
              <div className="sm:col-span-2"><Label>Cliente *</Label>
                <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>{clientes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div className="sm:col-span-2"><Label>Fornecedor</Label><Input value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} /></div>
            )}

            <div>
              <Label>Valor *</Label>
              <MoneyInput value={form.amount} onValueChange={(v) => setForm({ ...form, amount: v })} />
            </div>

            <div>
              <Label>Categoria *</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{cats.filter((c: any) => form.type === "RECEIVABLE" ? ["RECEITA", "AMBOS"].includes(c.type) : ["DESPESA", "AMBOS"].includes(c.type)).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Centro de custo</Label>
              <Select value={form.cost_center_id || "none"} onValueChange={(v) => setForm({ ...form, cost_center_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Sem centro" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Sem centro</SelectItem>{ccs.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div><Label>Valor *</Label><MoneyInput value={form.amount} onValueChange={(v) => setForm({ ...form, amount: v ?? 0 })} /></div>
            <div><Label>Dia de vencimento</Label><Input type="number" min={1} max={31} value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} /></div>

            <div><Label>Data inicial *</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><Label>Data final (opcional)</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>

            <div className="sm:col-span-2 flex items-center justify-between border rounded-md p-3">
              <Label className="m-0">Geração automática</Label>
              <Switch checked={form.auto_generate} onCheckedChange={(v) => setForm({ ...form, auto_generate: v })} />
            </div>

            {form.type === "RECEIVABLE" && (
              <div className="sm:col-span-2 flex items-center justify-between border rounded-md p-3">
                <Label className="m-0">NF-e obrigatória nos títulos gerados</Label>
                <Switch checked={form.fiscal_invoice_required} onCheckedChange={(v) => setForm({ ...form, fiscal_invoice_required: v })} />
              </div>
            )}

            <div className="sm:col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecorrenciaDrawer id={drawerId} onClose={() => setDrawerId(null)} />
    </div>
  );
}

// ============================================
// DRAWER DE DETALHES
// ============================================
function RecorrenciaDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [referenceDate, setReferenceDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const { data: t } = useQuery({
    queryKey: ["recurring-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_financial_templates")
        .select("*, financial_categories(name), clientes(nome), financial_cost_centers(name)")
        .eq("id", id!).maybeSingle();
      if (error) throw error; return data;
    },
  });

  const { data: titulos = [] } = useQuery({
    queryKey: ["recurring-titulos", id, t?.type],
    enabled: !!id && !!t,
    queryFn: async () => {
      const table = t!.type === "RECEIVABLE" ? "accounts_receivable" : "accounts_payable";
      const { data, error } = await supabase.from(table as any).select("id, description, total_amount, first_due_date, status, reference_month, created_at").eq("recurring_template_id", id!).order("created_at", { ascending: false });
      if (error) throw error; return data as any[];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["recurring-logs", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("recurring_generation_log").select("*").eq("template_id", id!).order("generated_at", { ascending: false }).limit(50);
      if (error) throw error; return data as any[];
    },
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ["recurring-audit", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_audit_log")
        .select("*")
        .eq("entity_id", id!)
        .eq("entity_type", "RECURRING_TEMPLATE")
        .order("created_at", { ascending: false });
      if (error) throw error; return data as any[];
    },
  });

  const revert = useMutation({
    mutationFn: async (logId: string) => {
      const { error } = await supabase.rpc("fn_revert_recurring_generation", { p_log_id: logId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Geração revertida e título removido");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const generateManual = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("fn_generate_recurring_title", { _template_id: id!, _reference_date: referenceDate, _is_manual: true });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data) toast.success("Título gerado manualmente");
      else toast.info("Geração ignorada (verifique logs)");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const endNow = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("recurring_financial_templates").update({ end_date: new Date().toISOString().slice(0, 10), active: false }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Recorrência encerrada"); qc.invalidateQueries(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!id) return null;

  return (
    <Sheet open={!!id} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t?.description || t?.name || "Recorrência"}</SheetTitle>
        </SheetHeader>

        {t && (
          <Tabs defaultValue="resumo" className="mt-4">
            <TabsList className="w-full justify-start flex-wrap h-auto">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="titulos">Títulos gerados</TabsTrigger>
              <TabsTrigger value="logs">Logs de Geração</TabsTrigger>
              <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
              <TabsTrigger value="acoes">Ações</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Tipo:</span> <Badge>{t.type === "RECEIVABLE" ? "Receita" : "Despesa"}</Badge></div>
                <div><span className="text-muted-foreground">Status:</span> {t.active ? <Badge variant="default">Ativa</Badge> : <Badge variant="secondary">Pausada/Encerrada</Badge>}</div>
                <div><span className="text-muted-foreground">{t.type === "RECEIVABLE" ? "Cliente" : "Fornecedor"}:</span> <strong>{t.clientes?.nome || t.supplier_name || "—"}</strong></div>
                <div><span className="text-muted-foreground">Categoria:</span> {t.financial_categories?.name || "—"}</div>
                <div><span className="text-muted-foreground">Centro de custo:</span> {t.financial_cost_centers?.name || "—"}</div>
                <div><span className="text-muted-foreground">Valor:</span> <strong>{brl(t.amount)}</strong></div>
                <div><span className="text-muted-foreground">Frequência:</span> {FREQ_LABEL(t.recurrence_frequency)}</div>
                <div><span className="text-muted-foreground">Dia vencimento:</span> {t.due_day || "—"}</div>
                <div><span className="text-muted-foreground">Início:</span> {fmtDate(t.start_date)}</div>
                <div><span className="text-muted-foreground">Fim:</span> {fmtDate(t.end_date)}</div>
                <div><span className="text-muted-foreground">Próxima geração:</span> <strong>{fmtDate(t.next_generation_date)}</strong></div>
                <div><span className="text-muted-foreground">Auto:</span> {t.auto_generate ? "Sim" : "Não"}</div>
                <div><span className="text-muted-foreground">Total gerado:</span> {titulos.length} título(s)</div>
              </div>
              {t.notes && <div className="text-sm pt-2 border-t"><span className="text-muted-foreground">Notas:</span> {t.notes}</div>}
            </TabsContent>

            <TabsContent value="titulos" className="mt-4">
              <Table>
                <TableHeader><TableRow><TableHead>Competência</TableHead><TableHead>Descrição</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {titulos.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhum título gerado</TableCell></TableRow> :
                    titulos.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell>{fmtDate(t.reference_month)}</TableCell>
                        <TableCell className="text-sm">{t.description}</TableCell>
                        <TableCell>{fmtDate(t.first_due_date)}</TableCell>
                        <TableCell>{brl(t.total_amount)}</TableCell>
                        <TableCell><Badge variant="outline">{t.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="logs" className="mt-4">
              <Table>
                <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Competência</TableHead><TableHead>Status</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader>
                <TableBody>
                  {logs.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem registros</TableCell></TableRow> :
                    logs.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="text-xs">{formatDateTimeDisplay(l.generated_at)}</div>
                          <div className="text-[10px] text-muted-foreground">{l.error_message}</div>
                        </TableCell>
                        <TableCell>{fmtDate(l.reference_date)}</TableCell>
                        <TableCell>
                          <Badge variant={l.status === "SUCCESS" ? "default" : l.status === "FAILED" ? "destructive" : "secondary"}>{l.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {l.status === "SUCCESS" && (
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => { if(confirm("Deseja reverter esta geração? O título financeiro correspondente será EXCLUÍDO.")) revert.mutate(l.id); }}
                              disabled={revert.isPending}
                            >
                              <XCircle className="h-4 w-4 mr-1" /> Reverter
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="auditoria" className="mt-4">
              <div className="space-y-4">
                {auditLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">Nenhum log de auditoria encontrado.</div>
                ) : (
                  auditLogs.map((log: any) => (
                    <div key={log.id} className="border-l-2 border-primary pl-4 py-2 space-y-1">
                      <div className="flex justify-between items-start">
                        <Badge variant="outline" className="text-[10px]">{log.action}</Badge>
                        <span className="text-[10px] text-muted-foreground">{formatDateTimeDisplay(log.created_at)}</span>
                      </div>
                      <p className="text-xs font-medium">{log.reason || "Alteração no template"}</p>
                      {log.new_data && log.action === "RECURRING_TEMPLATE_UPDATED" && (
                        <div className="text-[10px] text-muted-foreground bg-muted p-1 rounded">
                          Ver detalhes no log principal
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="acoes" className="mt-4 space-y-4">
              <Card>
                <CardContent className="pt-6 space-y-3">
                  <h3 className="font-semibold text-sm">Gerar competência manualmente</h3>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label>Data de referência</Label>
                      <Input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} />
                    </div>
                    <Button onClick={() => generateManual.mutate()} disabled={generateManual.isPending}>
                      <PlayCircle className="h-4 w-4 mr-2" />Gerar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Se a competência já tiver sido gerada, será registrada como SKIPPED.</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 space-y-3">
                  <h3 className="font-semibold text-sm text-destructive">Encerrar recorrência</h3>
                  <p className="text-xs text-muted-foreground">Define a data final como hoje e desativa. Títulos já gerados são mantidos.</p>
                  <Button variant="destructive" size="sm" onClick={() => { if (confirm("Encerrar esta recorrência?")) endNow.mutate(); }}>
                    <XCircle className="h-4 w-4 mr-2" />Encerrar agora
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
