import { useMemo, useState } from "react";
import { usePartnerOrdersAdmin } from "@/hooks/usePartnerOrdersAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { brl as fmt } from "@/lib/financial/format";

export default function DashboardB2B() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { data: orders = [], isLoading } = usePartnerOrdersAdmin({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    let totalSolicitado = 0;
    let totalAprovado = 0;
    const byPartner: Record<string, { name: string; count: number; total: number }> = {};
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
      totalSolicitado += Number(o.total ?? 0);
      if (o.status === "aprovado") totalAprovado += Number(o.total ?? 0);
      const key = o.partner_id;
      const name = o.partner_accounts?.razao_social ?? "—";
      byPartner[key] = byPartner[key] ?? { name, count: 0, total: 0 };
      byPartner[key].count += 1;
      byPartner[key].total += Number(o.total ?? 0);
    }
    return {
      byStatus,
      totalSolicitado,
      totalAprovado,
      byPartner: Object.values(byPartner).sort((a, b) => b.total - a.total),
    };
  }, [orders]);

  const KPI = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Dashboard B2B</h1>
        <p className="text-sm text-muted-foreground">Indicadores operacionais dos pedidos B2B.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Período</CardTitle></CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-2">
          <div className="space-y-1 flex-1">
            <label className="text-xs text-muted-foreground">De</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1 flex-1">
            <label className="text-xs text-muted-foreground">Até</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Solicitados" value={stats.byStatus.solicitado ?? 0} />
            <KPI label="Em análise" value={stats.byStatus.em_analise_comercial ?? 0} />
            <KPI label="Aprovados" value={stats.byStatus.aprovado ?? 0} />
            <KPI label="Reprovados" value={stats.byStatus.reprovado ?? 0} />
            <KPI label="Total solicitado" value={fmt(stats.totalSolicitado)} />
            <KPI label="Total aprovado" value={fmt(stats.totalAprovado)} />
            <KPI label="Pedidos" value={orders.length} />
            <KPI label="Parceiros ativos" value={stats.byPartner.length} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Por parceiro</CardTitle></CardHeader>
            <CardContent>
              {stats.byPartner.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sem dados.</div>
              ) : (
                <div className="divide-y">
                  {stats.byPartner.map((p) => (
                    <div key={p.name} className="py-2 flex justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.count} pedido(s)</div>
                      </div>
                      <div className="font-semibold whitespace-nowrap">{fmt(p.total)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
