import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/financeiro/KpiCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useB2BExecutiveDashboard } from "@/hooks/useB2BFinanceiro";
import { brl } from "@/lib/financial/format";
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, Users, Ban, BarChart3, Activity, ShieldCheck as ShieldIcon } from "lucide-react";

export default function DashboardSociosB2B() {
  const { data, isLoading } = useB2BExecutiveDashboard();
  const k = data?.kpis ?? {};
  const f = data?.forecast ?? {};
  const top = data?.top_parceiros ?? [];
  const prods = data?.top_produtos ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard Executivo dos Sócios</h1>
        <p className="text-sm text-muted-foreground">Visão consolidada da operação B2B Cultivo Farm.</p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Receita mês" value={brl(k.receita_mes ?? 0)} icon={TrendingUp} tone="success" />
        <KpiCard label="Receita ano" value={brl(k.receita_ano ?? 0)} icon={TrendingUp} tone="success" />
        <KpiCard label="Receita prevista 90d" value={brl(f.confirmada_90 ?? 0)} icon={Activity} />
        <KpiCard label="Receita em risco" value={brl(f.em_risco ?? 0)} icon={AlertTriangle} tone="danger" />
        <KpiCard label="Carteira em aberto" value={brl(k.carteira_aberto ?? 0)} icon={Wallet} />
        <KpiCard label="Carteira vencida" value={brl(k.carteira_vencida ?? 0)} icon={TrendingDown} tone="danger" />
        <KpiCard label="Parceiros ativos" value={String(data?.parceiros_ativos ?? 0)} icon={Users} />
        <KpiCard label="Parceiros bloqueados" value={String(data?.parceiros_bloqueados ?? 0)} icon={Ban} tone="danger" />
        <KpiCard label="Inadimplência %" value={`${k.inadimplencia_pct ?? 0}%`} icon={BarChart3} tone="warning" />
        <KpiCard label="Ticket médio" value={brl(k.ticket_medio ?? 0)} icon={Wallet} />
        <KpiCard label="Prazo médio recebto" value={`${Number(k.prazo_medio_recebimento ?? 0).toFixed(1)} d`} icon={Activity} />
        <KpiCard label="Score médio carteira" value={String(data?.score_medio ?? 0)} icon={ShieldIcon} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 Parceiros (ano)</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Parceiro</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {top.length === 0 && <TableRow><TableCell colSpan={2} className="text-center py-4 text-muted-foreground">Sem dados.</TableCell></TableRow>}
                {top.map((p: any) => (
                  <TableRow key={p.partner_id}><TableCell>{p.nome}</TableCell><TableCell className="text-right">{brl(p.total)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 Produtos (ano)</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {prods.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">Sem dados.</TableCell></TableRow>}
                {prods.map((p: any) => (
                  <TableRow key={p.produto_id}><TableCell>{p.nome}</TableCell><TableCell className="text-right">{Number(p.quantidade).toFixed(2)}</TableCell><TableCell className="text-right">{brl(p.total)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
