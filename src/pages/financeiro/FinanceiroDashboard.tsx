import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { KpiCard } from "@/components/financeiro/KpiCard";
import { brl } from "@/lib/financial/format";
import {
  ArrowDownCircle, ArrowUpCircle, AlertTriangle, Wallet, Truck, RefreshCw,
  Receipt, TrendingUp, TrendingDown, BadgeDollarSign, FileText
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { PeriodoFilter, defaultPeriodo, type PeriodoState } from "@/components/financeiro/bi/PeriodoFilter";
import { AlertasGestor } from "@/components/financeiro/bi/AlertasGestor";

type DashSummary = {
  total_receivable_expected: number; total_receivable_received: number;
  total_receivable_open: number; total_receivable_overdue: number; total_receivable_partial: number;
  overdue_receivables_count: number; average_days_overdue: number;
  total_payable_expected: number; total_payable_paid: number;
  total_payable_open: number; total_payable_overdue: number; total_payable_partial: number;
  overdue_payables_count: number;
  projected_balance: number; realized_balance: number;
  collection_rate: number; payment_rate: number;
  pending_fiscal_invoice_count: number; pending_fiscal_invoice_amount: number;
  pending_billing_deliveries_count: number; pending_billing_deliveries_amount: number;
  active_recurring_receivables_amount: number; active_recurring_payables_amount: number;
  recurring_net_balance: number; recurring_generation_errors_count: number;
};

type Rankings = {
  top_customers_revenue: { customer_id: string; customer_name: string; total_revenue: number }[];
  top_revenue_categories: { category_id: string; category_name: string; total_amount: number }[];
  top_expense_categories: { category_id: string; category_name: string; total_amount: number }[];
  top_overdue_customers: { customer_id: string; customer_name: string; overdue_amount: number; overdue_count: number; max_days_overdue: number }[];
};

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "#f59e0b", "#10b981", "#ef4444", "#6366f1", "#14b8a6", "#a855f7", "#f97316"];

export default function FinanceiroDashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState<PeriodoState>(defaultPeriodo());

  const { data: summary, isLoading } = useQuery({
    queryKey: ["fin-dashboard-summary", periodo.from, periodo.to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_financial_dashboard_summary" as any, {
        p_start_date: periodo.from, p_end_date: periodo.to,
      });
      if (error) throw error;
      return data as DashSummary;
    },
  });

  const { data: rankings } = useQuery({
    queryKey: ["fin-rankings", periodo.from, periodo.to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_top_financial_rankings" as any, {
        p_start_date: periodo.from, p_end_date: periodo.to, p_limit: 10,
      });
      if (error) throw error;
      return data as Rankings;
    },
  });

  const previstoRealizadoData = useMemo(() => ([
    { categoria: "Receitas", Previsto: Number(summary?.total_receivable_expected || 0), Realizado: Number(summary?.total_receivable_received || 0) },
    { categoria: "Despesas", Previsto: Number(summary?.total_payable_expected || 0), Realizado: Number(summary?.total_payable_paid || 0) },
  ]), [summary]);

  const topClientes = rankings?.top_customers_revenue || [];
  const topRecCat = rankings?.top_revenue_categories || [];
  const topDespCat = rankings?.top_expense_categories || [];
  const topInad = rankings?.top_overdue_customers || [];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard Financeiro</h1>
          <p className="text-sm text-muted-foreground">Visão gerencial — AR Bio</p>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={async () => {
            const { error } = await supabase.rpc("fn_mark_financial_overdue" as any);
            if (error) toast.error("Erro ao atualizar vencidos: " + error.message);
            else { toast.success("Status de vencimento atualizado"); qc.invalidateQueries(); }
          }}
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Atualizar Vencidos
        </Button>
      </div>

      <PeriodoFilter value={periodo} onChange={setPeriodo} showRegime={false} />

      {/* KPIs principais (10) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="cursor-pointer" onClick={() => navigate(`/financeiro/receber?from=${periodo.from}&to=${periodo.to}&status=open`)}>
          <KpiCard label="Receitas previstas" value={brl(summary?.total_receivable_expected || 0)} icon={ArrowDownCircle} tone="default" />
        </div>
        <div className="cursor-pointer" onClick={() => navigate(`/financeiro/receber?from=${periodo.from}&to=${periodo.to}&status=paid`)}>
          <KpiCard label="Receitas recebidas" value={brl(summary?.total_receivable_received || 0)} icon={Wallet} tone="success" />
        </div>
        <div className="cursor-pointer" onClick={() => navigate(`/financeiro/pagar?from=${periodo.from}&to=${periodo.to}&status=open`)}>
          <KpiCard label="Despesas previstas" value={brl(summary?.total_payable_expected || 0)} icon={ArrowUpCircle} tone="default" />
        </div>
        <div className="cursor-pointer" onClick={() => navigate(`/financeiro/pagar?from=${periodo.from}&to=${periodo.to}&status=paid`)}>
          <KpiCard label="Despesas pagas" value={brl(summary?.total_payable_paid || 0)} icon={BadgeDollarSign} tone="warning" />
        </div>
        <KpiCard
          label="Saldo projetado"
          value={brl(summary?.projected_balance || 0)}
          icon={TrendingUp}
          tone={(summary?.projected_balance || 0) >= 0 ? "success" : "danger"}
        />
        <KpiCard
          label="Saldo realizado"
          value={brl(summary?.realized_balance || 0)}
          icon={TrendingDown}
          tone={(summary?.realized_balance || 0) >= 0 ? "success" : "danger"}
        />
        <div className="cursor-pointer" onClick={() => navigate("/financeiro/receber?vencidos=1")}>
          <KpiCard
            label="Inadimplência"
            value={`${brl(summary?.total_receivable_overdue || 0)}`}
            icon={AlertTriangle}
            tone="danger"
          />
        </div>
        <div className="cursor-pointer" onClick={() => navigate("/financeiro/pagar?vencidos=1")}>
          <KpiCard
            label="Contas a pagar vencidas"
            value={brl(summary?.total_payable_overdue || 0)}
            icon={AlertTriangle}
            tone="danger"
          />
        </div>
        <div className="cursor-pointer" onClick={() => navigate("/financeiro/entregas-nao-faturadas")}>
          <KpiCard
            label="Entregas não faturadas"
            value={`${summary?.pending_billing_deliveries_count || 0} • ${brl(summary?.pending_billing_deliveries_amount || 0)}`}
            icon={Truck}
            tone={(summary?.pending_billing_deliveries_count || 0) > 0 ? "warning" : "default"}
          />
        </div>
        <div className="cursor-pointer" onClick={() => navigate("/financeiro/notas-fiscais?status=pendente")}>
          <KpiCard
            label="NF-e pendente"
            value={`${summary?.pending_fiscal_invoice_count || 0} • ${brl(summary?.pending_fiscal_invoice_amount || 0)}`}
            icon={Receipt}
            tone={(summary?.pending_fiscal_invoice_count || 0) > 0 ? "warning" : "default"}
          />
        </div>
      </div>

      {/* Indicadores complementares */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Taxa de recebimento</p>
          <p className="text-2xl font-semibold text-emerald-600">{((summary?.collection_rate || 0) * 100).toFixed(1)}%</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Taxa de pagamento</p>
          <p className="text-2xl font-semibold">{((summary?.payment_rate || 0) * 100).toFixed(1)}%</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Atraso médio (dias)</p>
          <p className="text-2xl font-semibold">{summary?.average_days_overdue || 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Saldo líquido recorrências</p>
          <p className={`text-2xl font-semibold ${(summary?.recurring_net_balance || 0) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
            {brl(summary?.recurring_net_balance || 0)}
          </p>
        </CardContent></Card>
      </div>

      {/* Bloco Atenção do Gestor */}
      <AlertasGestor />

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Previsto x Realizado</CardTitle></CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={previstoRealizadoData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="categoria" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => brl(v)} />
                  <Legend />
                  <Bar dataKey="Previsto" fill="hsl(var(--primary))" />
                  <Bar dataKey="Realizado" fill="hsl(var(--secondary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 clientes por receita</CardTitle></CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={topClientes} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="customer_name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => brl(v)} />
                  <Bar dataKey="total_revenue" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Receita por categoria</CardTitle></CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={topRecCat} dataKey="total_amount" nameKey="category_name" outerRadius={100} label={(d: any) => d.category_name}>
                    {topRecCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => brl(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Despesa por categoria</CardTitle></CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={topDespCat} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="category_name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => brl(v)} />
                  <Bar dataKey="total_amount" fill="hsl(var(--destructive))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Inadimplência por cliente</CardTitle></CardHeader>
          <CardContent>
            {topInad.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum cliente inadimplente.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2">Cliente</th>
                      <th className="text-right">Em atraso</th>
                      <th className="text-right">Parcelas</th>
                      <th className="text-right">Máx. dias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topInad.map((c) => (
                      <tr key={c.customer_id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                        onClick={() => navigate(`/financeiro/receber?cliente=${c.customer_id}&vencidos=1`)}>
                        <td className="py-2">{c.customer_name}</td>
                        <td className="text-right text-destructive font-medium">{brl(Number(c.overdue_amount))}</td>
                        <td className="text-right">{c.overdue_count}</td>
                        <td className="text-right">{c.max_days_overdue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando indicadores…</p>}
    </div>
  );
}
