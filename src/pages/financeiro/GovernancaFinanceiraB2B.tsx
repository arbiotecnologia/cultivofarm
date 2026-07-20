import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/financeiro/KpiCard";
import { useB2BGovernanceKpis, useB2BAging } from "@/hooks/useB2BFinanceiro";
import { brl } from "@/lib/financial/format";
import {
  Wallet, AlertTriangle, CheckCircle, Users, TrendingDown, TrendingUp, Ban, BarChart3,
} from "lucide-react";

export default function GovernancaFinanceiraB2B() {
  const { data: k, isLoading } = useB2BGovernanceKpis();
  const { data: aging = [] } = useB2BAging();

  const totalAging = aging.reduce((s, a) => s + Number(a.valor || 0), 0);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Governança Financeira B2B</h1>
        <p className="text-sm text-muted-foreground">
          Crédito, exposição e inadimplência consolidados dos parceiros B2B.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Crédito total concedido" value={brl(k?.credito_total_concedido ?? 0)} icon={Wallet} />
        <KpiCard label="Crédito utilizado" value={brl(k?.credito_utilizado ?? 0)} icon={TrendingUp} tone="warning" />
        <KpiCard label="Crédito disponível" value={brl(k?.credito_disponivel ?? 0)} icon={CheckCircle} tone="success" />
        <KpiCard label="Parceiros bloqueados" value={String(k?.parceiros_bloqueados ?? 0)} icon={Ban} tone="danger" />
        <KpiCard label="Títulos vencidos" value={brl(k?.titulos_vencidos ?? 0)} icon={AlertTriangle} tone="danger" />
        <KpiCard label="Recebimentos do mês" value={brl(k?.recebimentos_mes ?? 0)} icon={TrendingDown} tone="success" />
        <KpiCard label="Inadimplência %" value={`${k?.inadimplencia_pct ?? 0}%`} icon={BarChart3} tone="warning" />
        <KpiCard label="Receita B2B mês" value={brl(k?.receita_b2b_mes ?? 0)} icon={Users} />
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Atualizando…</div>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aging financeiro</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Faixa</TableHead>
                <TableHead className="text-right">Títulos</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Parceiros</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aging.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    Sem títulos em aberto.
                  </TableCell>
                </TableRow>
              )}
              {aging.map((a) => (
                <TableRow key={a.faixa}>
                  <TableCell className="font-medium">{a.faixa} dias</TableCell>
                  <TableCell className="text-right">{a.qtd_titulos}</TableCell>
                  <TableCell className="text-right">{brl(Number(a.valor || 0))}</TableCell>
                  <TableCell className="text-right">{a.parceiros}</TableCell>
                  <TableCell className="text-right">
                    {totalAging > 0 ? `${((Number(a.valor || 0) / totalAging) * 100).toFixed(1)}%` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
