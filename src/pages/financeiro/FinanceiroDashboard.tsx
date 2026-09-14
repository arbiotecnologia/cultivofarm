import { useRef, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { KpiCard } from "@/components/financeiro/KpiCard";
import { brl } from "@/lib/financial/format";
import {
  ArrowDownCircle, ArrowUpCircle, AlertTriangle, Wallet, Truck, RefreshCw,
  Receipt, TrendingUp, TrendingDown, BadgeDollarSign
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { PeriodoFilter, defaultPeriodo, validarPeriodo, type PeriodoState } from "@/components/financeiro/bi/PeriodoFilter";
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

export const MSG_ERRO_INDICADORES = "Não foi possível carregar os indicadores do período.";
export const MSG_ERRO_RANKINGS = "Não foi possível carregar os rankings do período.";
export const MSG_ERRO_VENCIDOS = "Não foi possível atualizar os vencidos. Tente novamente.";
const SEM_DADO = "—";

/** Cartão clicável acessível: mesmo comportamento no clique e no teclado. */
function CartaoAcionavel({ onAcionar, rotulo, children }: { onAcionar: () => void; rotulo: string; children: React.ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={rotulo}
      className="cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onAcionar}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAcionar();
        }
      }}
    >
      {children}
    </div>
  );
}

function BlocoErro({ mensagem, onTentar, ocupado }: { mensagem: string; onTentar: () => void; ocupado?: boolean }) {
  return (
    <div className="space-y-2 py-6 text-center" role="alert">
      <p className="text-sm text-destructive">{mensagem}</p>
      <Button size="sm" variant="outline" onClick={onTentar} disabled={ocupado}>
        <RefreshCw className="h-3 w-3 mr-1" /> Tentar novamente
      </Button>
    </div>
  );
}

export default function FinanceiroDashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState<PeriodoState>(defaultPeriodo());
  const [atualizandoVencidos, setAtualizandoVencidos] = useState(false);
  const vencidosRef = useRef(false);

  const periodoErro = validarPeriodo(periodo);
  const periodoValido = !periodoErro;

  const summaryQuery = useQuery({
    queryKey: ["fin-dashboard-summary", periodo.from, periodo.to],
    enabled: periodoValido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_financial_dashboard_summary" as any, {
        p_start_date: periodo.from, p_end_date: periodo.to,
      });
      if (error) throw error;
      return data as DashSummary;
    },
  });

  const rankingsQuery = useQuery({
    queryKey: ["fin-rankings", periodo.from, periodo.to],
    enabled: periodoValido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_top_financial_rankings" as any, {
        p_start_date: periodo.from, p_end_date: periodo.to, p_limit: 10,
      });
      if (error) throw error;
      return data as Rankings;
    },
  });

  const summaryIndisponivel = !periodoValido || summaryQuery.isError || summaryQuery.isLoading;
  const summary = summaryQuery.isError ? undefined : summaryQuery.data;
  const rankingsIndisponivel = !periodoValido || rankingsQuery.isError || rankingsQuery.isLoading;
  const rankings = rankingsQuery.isError ? undefined : rankingsQuery.data;

  const atualizandoSummary = summaryQuery.isFetching && !summaryQuery.isLoading;
  const atualizandoRankings = rankingsQuery.isFetching && !rankingsQuery.isLoading;

  /** Valor de KPI: nunca mostra R$ 0 quando o dado não existe. */
  const kpi = (fn: (s: DashSummary) => string) => (summaryIndisponivel || !summary ? SEM_DADO : fn(summary));

  const previstoRealizadoData = useMemo(() => (
    summary
      ? [
          { categoria: "Receitas", Previsto: Number(summary.total_receivable_expected || 0), Realizado: Number(summary.total_receivable_received || 0) },
          { categoria: "Despesas", Previsto: Number(summary.total_payable_expected || 0), Realizado: Number(summary.total_payable_paid || 0) },
        ]
      : []
  ), [summary]);

  const topClientes = rankings?.top_customers_revenue ?? [];
  const topRecCat = rankings?.top_revenue_categories ?? [];
  const topDespCat = rankings?.top_expense_categories ?? [];
  const topInad = rankings?.top_overdue_customers ?? [];

  const atualizarVencidos = async () => {
    if (vencidosRef.current) return;
    vencidosRef.current = true;
    setAtualizandoVencidos(true);
    try {
      const { error } = await supabase.rpc("fn_mark_financial_overdue" as any);
      if (error) {
        toast.error(MSG_ERRO_VENCIDOS);
        return;
      }
      toast.success("Status de vencimento atualizado");
      // Apenas as chaves financeiras desta tela.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["fin-dashboard-summary"] }),
        qc.invalidateQueries({ queryKey: ["fin-rankings"] }),
        qc.invalidateQueries({ queryKey: ["fin-alerts"] }),
      ]);
    } catch {
      toast.error(MSG_ERRO_VENCIDOS);
    } finally {
      vencidosRef.current = false;
      setAtualizandoVencidos(false);
    }
  };

  const conteudoGrafico = (vazio: boolean, mensagemVazio: string, grafico: React.ReactNode) => {
    if (!periodoValido) return <p className="text-sm text-muted-foreground py-6 text-center">Defina um período válido para ver este gráfico.</p>;
    if (rankingsQuery.isLoading) return <p className="text-sm text-muted-foreground py-6 text-center" role="status">Carregando…</p>;
    if (rankingsQuery.isError) return <BlocoErro mensagem={MSG_ERRO_RANKINGS} onTentar={() => void rankingsQuery.refetch()} ocupado={rankingsQuery.isFetching} />;
    if (vazio) return <p className="text-sm text-muted-foreground py-6 text-center">{mensagemVazio}</p>;
    return <div className={atualizandoRankings ? "opacity-60" : undefined}><div style={{ width: "100%", height: 280 }}>{grafico}</div></div>;
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard Financeiro</h1>
          <p className="text-sm text-muted-foreground">Visão gerencial — Cultivo Farm</p>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => void atualizarVencidos()}
          disabled={atualizandoVencidos}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${atualizandoVencidos ? "animate-spin" : ""}`} />
          {atualizandoVencidos ? "Atualizando…" : "Atualizar Vencidos"}
        </Button>
      </div>

      <PeriodoFilter value={periodo} onChange={setPeriodo} showRegime={false} />

      <p className="text-xs text-muted-foreground">
        Previsto considera a data de vencimento; realizado considera a data de pagamento. Os cartões de NF-e,
        entregas não faturadas, recorrências e o ranking de inadimplência mostram a posição atual, sem filtro de período.
      </p>

      {!periodoValido && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {periodoErro} Os indicadores não foram consultados.
        </div>
      )}

      {periodoValido && summaryQuery.isError && (
        <BlocoErro mensagem={MSG_ERRO_INDICADORES} onTentar={() => void summaryQuery.refetch()} ocupado={summaryQuery.isFetching} />
      )}

      {periodoValido && summaryQuery.isLoading && (
        <p className="text-sm text-muted-foreground" role="status">Carregando indicadores…</p>
      )}

      {atualizandoSummary && <p className="text-xs text-muted-foreground">Atualizando indicadores…</p>}

      {/* KPIs principais */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 ${atualizandoSummary ? "opacity-60" : ""}`}>
        <CartaoAcionavel rotulo="Abrir contas a receber" onAcionar={() => navigate("/financeiro/receber")}>
          <KpiCard label="Receitas previstas" value={kpi((s) => brl(s.total_receivable_expected || 0))} icon={ArrowDownCircle} tone="default" />
        </CartaoAcionavel>
        <CartaoAcionavel rotulo="Abrir contas a receber" onAcionar={() => navigate("/financeiro/receber")}>
          <KpiCard label="Receitas recebidas" value={kpi((s) => brl(s.total_receivable_received || 0))} icon={Wallet} tone="success" />
        </CartaoAcionavel>
        <CartaoAcionavel rotulo="Abrir contas a pagar" onAcionar={() => navigate("/financeiro/pagar")}>
          <KpiCard label="Despesas previstas" value={kpi((s) => brl(s.total_payable_expected || 0))} icon={ArrowUpCircle} tone="default" />
        </CartaoAcionavel>
        <CartaoAcionavel rotulo="Abrir contas a pagar" onAcionar={() => navigate("/financeiro/pagar")}>
          <KpiCard label="Despesas pagas" value={kpi((s) => brl(s.total_payable_paid || 0))} icon={BadgeDollarSign} tone="warning" />
        </CartaoAcionavel>
        <KpiCard
          label="Saldo projetado"
          value={kpi((s) => brl(s.projected_balance || 0))}
          icon={TrendingUp}
          tone={summary && (summary.projected_balance || 0) < 0 ? "danger" : summary ? "success" : "default"}
        />
        <KpiCard
          label="Saldo realizado"
          value={kpi((s) => brl(s.realized_balance || 0))}
          icon={TrendingDown}
          tone={summary && (summary.realized_balance || 0) < 0 ? "danger" : summary ? "success" : "default"}
        />
        <CartaoAcionavel rotulo="Abrir contas a receber" onAcionar={() => navigate("/financeiro/receber")}>
          <KpiCard label="Inadimplência" value={kpi((s) => brl(s.total_receivable_overdue || 0))} icon={AlertTriangle} tone="danger" />
        </CartaoAcionavel>
        <CartaoAcionavel rotulo="Abrir contas a pagar" onAcionar={() => navigate("/financeiro/pagar")}>
          <KpiCard label="Contas a pagar vencidas" value={kpi((s) => brl(s.total_payable_overdue || 0))} icon={AlertTriangle} tone="danger" />
        </CartaoAcionavel>
        <CartaoAcionavel rotulo="Abrir entregas não faturadas" onAcionar={() => navigate("/financeiro/entregas-nao-faturadas")}>
          <KpiCard
            label="Entregas não faturadas (posição atual)"
            value={kpi((s) => `${s.pending_billing_deliveries_count || 0} • ${brl(s.pending_billing_deliveries_amount || 0)}`)}
            icon={Truck}
            tone={summary && (summary.pending_billing_deliveries_count || 0) > 0 ? "warning" : "default"}
          />
        </CartaoAcionavel>
        <CartaoAcionavel rotulo="Abrir notas fiscais" onAcionar={() => navigate("/financeiro/notas-fiscais")}>
          <KpiCard
            label="NF-e pendente (posição atual)"
            value={kpi((s) => `${s.pending_fiscal_invoice_count || 0} • ${brl(s.pending_fiscal_invoice_amount || 0)}`)}
            icon={Receipt}
            tone={summary && (summary.pending_fiscal_invoice_count || 0) > 0 ? "warning" : "default"}
          />
        </CartaoAcionavel>
      </div>

      {/* Indicadores complementares */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 ${atualizandoSummary ? "opacity-60" : ""}`}>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Taxa de recebimento</p>
          <p className="text-2xl font-semibold text-emerald-600">{kpi((s) => `${((s.collection_rate || 0) * 100).toFixed(1)}%`)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Taxa de pagamento</p>
          <p className="text-2xl font-semibold">{kpi((s) => `${((s.payment_rate || 0) * 100).toFixed(1)}%`)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Atraso médio (dias)</p>
          <p className="text-2xl font-semibold">{kpi((s) => String(s.average_days_overdue || 0))}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Saldo líquido recorrências (posição atual)</p>
          <p className={`text-2xl font-semibold ${summary && (summary.recurring_net_balance || 0) < 0 ? "text-destructive" : "text-emerald-600"}`}>
            {kpi((s) => brl(s.recurring_net_balance || 0))}
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
            {!periodoValido ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Defina um período válido para ver este gráfico.</p>
            ) : summaryQuery.isLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center" role="status">Carregando…</p>
            ) : summaryQuery.isError ? (
              <BlocoErro mensagem={MSG_ERRO_INDICADORES} onTentar={() => void summaryQuery.refetch()} ocupado={summaryQuery.isFetching} />
            ) : previstoRealizadoData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem valores no período selecionado.</p>
            ) : (
              <div className={atualizandoSummary ? "opacity-60" : undefined}>
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
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 clientes por receita</CardTitle></CardHeader>
          <CardContent>
            {conteudoGrafico(
              topClientes.length === 0,
              "Nenhuma receita de cliente no período selecionado.",
              <ResponsiveContainer>
                <BarChart data={topClientes} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="customer_name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => brl(v)} />
                  <Bar dataKey="total_revenue" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>,
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Receita por categoria</CardTitle></CardHeader>
          <CardContent>
            {conteudoGrafico(
              topRecCat.length === 0,
              "Nenhuma receita por categoria no período selecionado.",
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={topRecCat} dataKey="total_amount" nameKey="category_name" outerRadius={100} label={(d: any) => d.category_name}>
                    {topRecCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => brl(v)} />
                </PieChart>
              </ResponsiveContainer>,
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Despesa por categoria</CardTitle></CardHeader>
          <CardContent>
            {conteudoGrafico(
              topDespCat.length === 0,
              "Nenhuma despesa por categoria no período selecionado.",
              <ResponsiveContainer>
                <BarChart data={topDespCat} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="category_name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => brl(v)} />
                  <Bar dataKey="total_amount" fill="hsl(var(--destructive))" />
                </BarChart>
              </ResponsiveContainer>,
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Inadimplência por cliente (posição atual)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!periodoValido ? (
              <p className="text-sm text-muted-foreground">Defina um período válido para ver esta lista.</p>
            ) : rankingsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground" role="status">Carregando…</p>
            ) : rankingsQuery.isError ? (
              <BlocoErro mensagem={MSG_ERRO_RANKINGS} onTentar={() => void rankingsQuery.refetch()} ocupado={rankingsQuery.isFetching} />
            ) : topInad.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum cliente inadimplente.</p>
            ) : (
              <div className={`overflow-x-auto ${atualizandoRankings ? "opacity-60" : ""}`}>
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
                      <tr
                        key={c.customer_id}
                        className="border-b last:border-0 hover:bg-muted/50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        tabIndex={0}
                        role="button"
                        aria-label={`Abrir contas a receber de ${c.customer_name}`}
                        onClick={() => navigate("/financeiro/receber")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate("/financeiro/receber");
                          }
                        }}
                      >
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
    </div>
  );
}
