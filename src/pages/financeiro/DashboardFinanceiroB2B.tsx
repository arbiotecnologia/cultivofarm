import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KpiCard } from "@/components/financeiro/KpiCard";
import { useB2BFinancialKpis } from "@/hooks/useB2BFinanceiro";
import { brl } from "@/lib/financial/format";
import {
  Wallet, AlertTriangle, CheckCircle, Clock, TrendingUp, Users, FileWarning, Calendar,
} from "lucide-react";

export default function DashboardFinanceiroB2B() {
  const today = new Date().toISOString().slice(0, 10);
  const first = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(today);
  const { data, isLoading } = useB2BFinancialKpis({ from, to });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard Financeiro B2B</h1>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total a receber" value={brl(data?.total_a_receber ?? 0)} icon={Wallet} />
        <KpiCard label="Total recebido" value={brl(data?.total_recebido ?? 0)} icon={CheckCircle} tone="success" />
        <KpiCard label="Vencido" value={brl(data?.total_vencido ?? 0)} icon={AlertTriangle} tone="danger" />
        <KpiCard label="Em aberto" value={brl(data?.total_em_aberto ?? 0)} icon={Clock} />
        <KpiCard label="Ticket médio" value={brl(data?.ticket_medio ?? 0)} icon={TrendingUp} />
        <KpiCard label="Vencendo em 7 dias" value={brl(data?.vencendo_7d ?? 0)} icon={Calendar} tone="warning" />
        <KpiCard label="Entregues sem cobrança" value={String(data?.pedidos_entregues_sem_cobranca ?? 0)} icon={FileWarning} tone="warning" />
        <KpiCard label="Parceiros inadimplentes" value={String(data?.parceiros_inadimplentes ?? 0)} icon={Users} tone="danger" />
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Atualizando…</div>}

      <Card>
        <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Os indicadores consideram apenas títulos com origem em pedidos B2B (origem <code>B2B_ORDER</code>).
          Pedidos cuja cobrança ainda não foi gerada aparecem em <em>Entregues sem cobrança</em>.
        </CardContent>
      </Card>
    </div>
  );
}
