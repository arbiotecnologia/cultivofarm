import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { StatusBadge } from "@/components/financeiro/StatusBadge";
import { KpiCard } from "@/components/financeiro/KpiCard";
import { NovaContaDialog } from "@/components/financeiro/NovaContaDialog";
import { ContaDrawer } from "@/components/financeiro/ContaDrawer";
import { BaixaDialog } from "@/components/financeiro/BaixaDialog";
import { brl, fmtDate } from "@/lib/financial/format";
import { Plus, Wallet, Eye, XCircle, ArrowDownCircle, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function ContasReceber() {
  const qc = useQueryClient();
  const [novo, setNovo] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [baixa, setBaixa] = useState<any>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const PAGE_SIZE = 50;
  const [pageCount, setPageCount] = useState(1);

  // marcar vencidos ao abrir
  useQuery({ queryKey: ["fin-mark-overdue"], queryFn: async () => { await supabase.rpc("fn_mark_financial_overdue"); return true; } });

  const { data: listPage, isLoading, isFetching } = useQuery({
    queryKey: ["ar-list", pageCount],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("accounts_receivable")
        .select("*, clientes(nome, codigo_cliente), category:financial_categories(name), installments:accounts_receivable_installments(*)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(0, pageCount * PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data as any[]) ?? [], total: count ?? 0 };
    },
    placeholderData: (prev) => prev,
  });
  const data = listPage?.rows ?? [];
  const total = listPage?.total ?? 0;

  // KPIs: consulta leve de todas as parcelas
  const { data: allInstallments = [] } = useQuery({
    queryKey: ["ar-kpi-installments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("accounts_receivable_installments")
        .select("original_amount, received_amount, discount_amount, due_date, status, paid_at");
      return (data as any[]) ?? [];
    },
  });

  const { data: docsByOwner = {} } = useQuery({
    queryKey: ["ar-docs-count"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_documents").select("owner_id, document_type").eq("owner_type", "RECEIVABLE");
      const map: Record<string, string[]> = {};
      (data || []).forEach((d: any) => { (map[d.owner_id] ??= []).push(d.document_type); });
      return map;
    },
  });

  const cancel = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("rpc_cancel_accounts_receivable" as any, { p_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Conta cancelada"); qc.invalidateQueries({ queryKey: ["ar-list"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const today = new Date(); const todayStr = today.toISOString().slice(0, 10);
  const in7 = new Date(); in7.setDate(today.getDate() + 7);
  const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const filtered = useMemo(() => data.filter((r: any) => {
    if (q && !`${r.description} ${r.clientes?.nome ?? ""} ${r.clientes?.codigo_cliente ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    const insts = r.installments || [];
    const hasOpen = insts.some((i: any) => ["OPEN", "PARTIAL", "OVERDUE"].includes(i.status));
    const hasOverdue = insts.some((i: any) => ["OPEN", "PARTIAL", "OVERDUE"].includes(i.status) && i.due_date < todayStr);
    const dueToday = insts.some((i: any) => ["OPEN", "PARTIAL", "OVERDUE"].includes(i.status) && i.due_date === todayStr);
    const hasReceipt = (docsByOwner[r.id] || []).some((t: string) => t === "RECEIPT");
    switch (status) {
      case "all": return true;
      case "OPEN": return hasOpen && r.status !== "CANCELED";
      case "OVERDUE": return hasOverdue;
      case "DUE_TODAY": return dueToday;
      case "PARTIAL": return r.status === "PARTIAL";
      case "PAID": return r.status === "PAID";
      case "NFE_PENDING": return r.fiscal_invoice_required && (r.fiscal_invoice_status === "PENDING" || !r.fiscal_invoice_status);
      case "NO_RECEIPT": return r.status === "PAID" && !hasReceipt;
      default: return r.status === status;
    }
  }), [data, q, status, docsByOwner, todayStr]);

  const kpi = useMemo(() => {
    let aberto = 0, vencido = 0, recebMes = 0, vence7 = 0;
    (allInstallments as any[]).forEach((i: any) => {
      if (i.status === "CANCELED" || i.status === "PAID") {
        if (i.status === "PAID" && i.paid_at && new Date(i.paid_at) >= startMonth) recebMes += Number(i.received_amount || 0);
        return;
      }
      const saldo = Number(i.original_amount) - Number(i.received_amount || 0) - Number(i.discount_amount || 0);
      aberto += saldo;
      const due = new Date(i.due_date + "T12:00:00");
      if (due < today) vencido += saldo;
      else if (due <= in7) vence7 += saldo;
    });
    return { aberto, vencido, recebMes, vence7 };
  }, [allInstallments]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">Contas a Receber</h1>
        <Button onClick={() => setNovo(true)}><Plus className="h-4 w-4 mr-1" />Nova conta</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Em aberto" value={brl(kpi.aberto)} icon={Clock} />
        <KpiCard label="Vencido" value={brl(kpi.vencido)} icon={AlertTriangle} tone="danger" />
        <KpiCard label="Recebido no mês" value={brl(kpi.recebMes)} icon={CheckCircle} tone="success" />
        <KpiCard label="Vencendo em 7 dias" value={brl(kpi.vence7)} icon={ArrowDownCircle} tone="warning" />
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Buscar por cliente ou descrição…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { v: "all", l: "Todos" },
              { v: "OPEN", l: "Em aberto" },
              { v: "DUE_TODAY", l: "Vencendo hoje" },
              { v: "OVERDUE", l: "Vencidos" },
              { v: "PARTIAL", l: "Parciais" },
              { v: "PAID", l: "Pagos" },
              { v: "NFE_PENDING", l: "NF-e pendente" },
              { v: "NO_RECEIPT", l: "Sem comprovante" },
            ].map((f) => (
              <Button key={f.v} size="sm" variant={status === f.v ? "default" : "outline"} onClick={() => setStatus(f.v)}>{f.l}</Button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-16">Cód.</TableHead><TableHead>Cliente</TableHead><TableHead>Descrição</TableHead><TableHead>Valor total</TableHead><TableHead>1º vencimento</TableHead><TableHead>Origem</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-6">Carregando…</TableCell></TableRow>}
                {!isLoading && filtered.map((r: any) => {
                  const nextOpen = (r.installments || []).filter((i: any) => i.status !== "PAID" && i.status !== "CANCELED").sort((a: any, b: any) => a.installment_number - b.installment_number)[0];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.clientes?.codigo_cliente || "—"}</TableCell>
                      <TableCell className="font-medium">{r.clientes?.nome ?? "—"}</TableCell>
                      <TableCell>{r.description}</TableCell>
                      <TableCell>{brl(r.total_amount)}</TableCell>
                      <TableCell>{fmtDate(r.first_due_date)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.origin_type}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        <Button size="icon" variant="ghost" onClick={() => setDrawerId(r.id)} title="Visualizar"><Eye className="h-4 w-4" /></Button>
                        {nextOpen && <Button size="icon" variant="ghost" onClick={() => setBaixa(nextOpen)} title="Registrar recebimento"><Wallet className="h-4 w-4" /></Button>}
                        {r.status !== "CANCELED" && r.status !== "PAID" && <Button size="icon" variant="ghost" onClick={() => { const reason = window.prompt("Motivo do cancelamento (mín. 5 caracteres):"); if (reason && reason.trim().length >= 5) cancel.mutate({ id: r.id, reason: reason.trim() }); else if (reason !== null) toast.error("Motivo precisa ter ao menos 5 caracteres"); }} title="Cancelar"><XCircle className="h-4 w-4" /></Button>}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!isLoading && !filtered.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma conta encontrada</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
            <span>Mostrando {data.length} de {total}</span>
            {data.length < total && (
              <Button size="sm" variant="outline" disabled={isFetching} onClick={() => setPageCount((p) => p + 1)}>
                {isFetching ? "Carregando…" : "Carregar mais"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <NovaContaDialog open={novo} onClose={() => setNovo(false)} kind="receivable" />
      <ContaDrawer open={!!drawerId} onClose={() => setDrawerId(null)} kind="receivable" contaId={drawerId} />
      <BaixaDialog open={!!baixa} onClose={() => setBaixa(null)} kind="receivable" installment={baixa} />
    </div>
  );
}
