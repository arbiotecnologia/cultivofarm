import { useMemo, useState } from "react";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { fetchAllRows } from "@/lib/configuracoes/fetchAllRows";
import {
  CHAVES_INVALIDACAO_PAGAR,
  calcularKpisPagar,
  classificarParcela,
  inicioDoMes,
  inicioDoProximoMes,
} from "@/lib/financeiro/contasPagar";
import { mapearErroCancelamento, rotuloVencimento, STATUS_PARCELA_EM_ABERTO } from "@/lib/financeiro/contasReceber";
import { useHojeSaoPaulo } from "@/lib/financeiro/useHojeSaoPaulo";
import { Plus, Wallet, Eye, XCircle, ArrowUpCircle, Clock, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 50;
const EM_ABERTO: string[] = [...STATUS_PARCELA_EM_ABERTO];

export default function ContasPagar() {
  const qc = useQueryClient();
  const [novo, setNovo] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [baixa, setBaixa] = useState<any>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const hoje = useHojeSaoPaulo();

  // Somente leitura: esta tela não executa nenhuma RPC que altere dados ao montar.
  const lista = useInfiniteQuery({
    queryKey: ["ap-list"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const { data, error, count } = await supabase
        .from("accounts_payable")
        .select("*, category:financial_categories(name), installments:accounts_payable_installments(*)", { count: "exact" })
        // Ordem estável: created_at + id evitam repetição/omissão entre páginas.
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return {
        rows: (data as any[]) ?? [],
        total: typeof count === "number" ? count : null,
        page: pageParam as number,
      };
    },
    getNextPageParam: (ultima, todas) => {
      if (!ultima.rows.length || ultima.rows.length < PAGE_SIZE) return undefined;
      const carregadas = todas.reduce((s, p) => s + p.rows.length, 0);
      if (typeof ultima.total === "number" && carregadas >= ultima.total) return undefined;
      return ultima.page + 1;
    },
  });

  const data = useMemo(() => (lista.data?.pages ?? []).flatMap((p) => p.rows), [lista.data]);
  const totalConhecido = lista.data?.pages?.[0]?.total ?? null;

  // KPIs de saldo: todas as parcelas em páginas reais (nunca truncado em 1000).
  const parcelas = useQuery({
    queryKey: ["ap-kpi-installments"],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("accounts_payable_installments")
          .select(
            "id, payable_id, original_amount, paid_amount, interest_amount, penalty_amount, discount_amount, due_date, status",
          )
          .order("id", { ascending: true })
          .range(from, to),
      ),
  });

  // Pago no mês: eventos de caixa (inclui parciais e estornos negativos).
  const pagamentosMes = useQuery({
    queryKey: ["ap-kpi-payments", inicioDoMes(hoje)],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("payable_payments")
          .select("id, amount_paid, payment_date")
          .gte("payment_date", inicioDoMes(hoje))
          .lt("payment_date", inicioDoProximoMes(hoje))
          .order("id", { ascending: true })
          .range(from, to),
      ),
  });

  const { data: docsByOwner = {} } = useQuery({
    queryKey: ["ap-docs-count"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_documents").select("owner_id, document_type").eq("owner_type", "PAYABLE");
      const map: Record<string, string[]> = {};
      (data || []).forEach((d: any) => { (map[d.owner_id] ??= []).push(d.document_type); });
      return map;
    },
  });

  function invalidarFinanceiro() {
    CHAVES_INVALIDACAO_PAGAR.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }

  const cancel = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("rpc_cancel_accounts_payable" as any, { p_id: id, p_reason: reason });
      if (error) throw error;
    },
    retry: false,
    onSuccess: () => { toast.success("Conta cancelada"); invalidarFinanceiro(); },
    onError: (e: unknown) => toast.error(mapearErroCancelamento(e)),
  });

  const kpiIndisponivel = parcelas.isError || pagamentosMes.isError;
  const kpiCarregando = !kpiIndisponivel && (!parcelas.isSuccess || !pagamentosMes.isSuccess);
  const kpi = useMemo(
    () => calcularKpisPagar(parcelas.data ?? [], pagamentosMes.data ?? [], hoje),
    [parcelas.data, pagamentosMes.data, hoje],
  );
  // Carregando nunca exibe zero; erro nunca exibe zero.
  const kpiValor = (v: number) => (kpiIndisponivel ? "—" : kpiCarregando ? "…" : brl(v));

  const filtered = useMemo(() => data.filter((r: any) => {
    if (q && !`${r.description} ${r.supplier_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    const cancelada = r.status === "CANCELED";
    const insts = r.installments || [];
    const abertas = insts.filter((i: any) => EM_ABERTO.includes(i.status));
    const hasOpen = abertas.length > 0;
    // Conta cancelada nunca entra em atraso/vencendo hoje.
    const hasOverdue = !cancelada && abertas.some((i: any) => classificarParcela(i.due_date, hoje) === "vencida");
    const dueToday = !cancelada && abertas.some((i: any) => classificarParcela(i.due_date, hoje) === "vence_hoje");
    const docs = docsByOwner[r.id] || [];
    const hasReceipt = docs.includes("RECEIPT");
    const hasInvoice = docs.includes("INVOICE") || docs.includes("XML") || docs.includes("DANFE");
    switch (status) {
      case "all": return true;
      case "OPEN": return hasOpen && !cancelada;
      case "DUE_TODAY": return dueToday;
      case "OVERDUE": return hasOverdue;
      case "PAID": return r.status === "PAID";
      case "NO_RECEIPT": return r.status === "PAID" && !hasReceipt;
      case "WITH_INVOICE": return hasInvoice;
      default: return r.status === status;
    }
  }), [data, q, status, docsByOwner, hoje]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">Contas a Pagar</h1>
        <Button onClick={() => setNovo(true)}><Plus className="h-4 w-4 mr-1" />Nova conta</Button>
      </div>

      {kpiIndisponivel && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
          <span>Não foi possível calcular os indicadores. Os valores não são confiáveis agora.</span>
          <Button size="sm" variant="outline" onClick={() => { parcelas.refetch(); pagamentosMes.refetch(); }}>
            <RefreshCw className="h-3 w-3 mr-1" />Tentar novamente
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Em aberto" value={kpiValor(kpi.aberto)} icon={Clock} />
        <KpiCard label="Vencido" value={kpiValor(kpi.vencido)} icon={AlertTriangle} tone="danger" />
        <KpiCard label="Pago no mês" value={kpiValor(kpi.pagoMes)} icon={CheckCircle} tone="success" />
        <KpiCard label="Vencendo em 7 dias" value={kpiValor(kpi.vence7)} icon={ArrowUpCircle} tone="warning" />
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Buscar por fornecedor ou descrição…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { v: "all", l: "Todos" },
              { v: "OPEN", l: "Em aberto" },
              { v: "DUE_TODAY", l: "Vencendo hoje" },
              { v: "OVERDUE", l: "Vencidos" },
              { v: "PAID", l: "Pagos" },
              { v: "NO_RECEIPT", l: "Sem comprovante" },
              { v: "WITH_INVOICE", l: "Com NF do fornecedor" },
            ].map((f) => (
              <Button key={f.v} size="sm" variant={status === f.v ? "default" : "outline"} onClick={() => setStatus(f.v)}>{f.l}</Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A busca e os filtros consideram apenas as {data.length} conta(s) já carregadas. Use “Carregar mais” para ampliar a consulta.
          </p>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Descrição</TableHead><TableHead>Fornecedor</TableHead><TableHead>Categoria</TableHead><TableHead>Valor</TableHead><TableHead>1º vencimento</TableHead><TableHead>Situação</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {lista.isLoading && <TableRow><TableCell colSpan={8} className="text-center py-6">Carregando…</TableCell></TableRow>}
                {lista.isError && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 space-y-2">
                    <p className="text-destructive">Não foi possível carregar as contas a pagar.</p>
                    <Button size="sm" variant="outline" onClick={() => lista.refetch()}>
                      <RefreshCw className="h-3 w-3 mr-1" />Tentar novamente
                    </Button>
                  </TableCell></TableRow>
                )}
                {!lista.isLoading && !lista.isError && filtered.map((r: any) => {
                  const cancelada = r.status === "CANCELED";
                  const nextOpen = (r.installments || []).filter((i: any) => i.status !== "PAID" && i.status !== "CANCELED").sort((a: any, b: any) => a.installment_number - b.installment_number)[0];
                  const emCancelamento = cancel.isPending && cancel.variables?.id === r.id;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.description}</TableCell>
                      <TableCell>{r.supplier_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.category?.name ?? "—"}</TableCell>
                      <TableCell>{brl(r.total_amount)}</TableCell>
                      <TableCell>{fmtDate(r.first_due_date)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {cancelada ? "Cancelada" : r.status === "PAID" ? "Quitada" : rotuloVencimento(nextOpen?.due_date ?? r.first_due_date, hoje)}
                      </TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        <Button size="icon" variant="ghost" onClick={() => setDrawerId(r.id)} title="Visualizar"><Eye className="h-4 w-4" /></Button>
                        {nextOpen && !cancelada && <Button size="icon" variant="ghost" disabled={emCancelamento} onClick={() => setBaixa(nextOpen)} title="Registrar pagamento"><Wallet className="h-4 w-4" /></Button>}
                        {!cancelada && r.status !== "PAID" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={cancel.isPending}
                            onClick={() => {
                              if (cancel.isPending) return;
                              const reason = window.prompt("Motivo do cancelamento (mín. 5 caracteres):");
                              if (reason && reason.trim().length >= 5) cancel.mutate({ id: r.id, reason: reason.trim() });
                              else if (reason !== null) toast.error("Motivo precisa ter ao menos 5 caracteres");
                            }}
                            title="Cancelar"
                          ><XCircle className="h-4 w-4" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!lista.isLoading && !lista.isError && !filtered.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma conta encontrada</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
            <span>
              {lista.isError
                ? "Lista indisponível"
                : typeof totalConhecido === "number"
                  ? `Mostrando ${data.length} de ${totalConhecido}`
                  : `Mostrando ${data.length} conta(s)`}
            </span>
            {!lista.isError && lista.hasNextPage && (
              <Button size="sm" variant="outline" disabled={lista.isFetchingNextPage} onClick={() => lista.fetchNextPage()}>
                {lista.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <NovaContaDialog open={novo} onClose={() => { setNovo(false); invalidarFinanceiro(); }} kind="payable" />
      <ContaDrawer open={!!drawerId} onClose={() => { setDrawerId(null); invalidarFinanceiro(); }} kind="payable" contaId={drawerId} />
      <BaixaDialog open={!!baixa} onClose={() => { setBaixa(null); invalidarFinanceiro(); }} kind="payable" installment={baixa} />
    </div>
  );
}
