import { useState } from "react";
import { useCommercialKpis } from "@/hooks/useCommercial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { brl as fmt } from "@/lib/financial/format";

export default function IndicadoresComerciais() {
  const today = new Date().toISOString().slice(0, 10);
  const thirty = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(thirty);
  const [to, setTo] = useState(today);

  const { data, isLoading } = useCommercialKpis({ from, to });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Indicadores Comerciais</h1>
        <p className="text-sm text-muted-foreground">KPIs do módulo B2B Cultivo Farm.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Período</CardTitle></CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3">
          <div>
            <label className="text-xs text-muted-foreground">De</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Até</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {isLoading ? <div className="text-sm text-muted-foreground">Carregando...</div> : data && (
        <div className="grid md:grid-cols-3 gap-3">
          <Kpi label="Pedidos no período" value={String(data.pedidos_total ?? 0)} />
          <Kpi label="Aprovados" value={String(data.pedidos_aprovados ?? 0)} />
          <Kpi label="Em negociação" value={String(data.pedidos_em_negociacao ?? 0)} />
          <Kpi label="Aguardando ajuste" value={String(data.pedidos_aguardando_ajuste ?? 0)} />
          <Kpi label="Receita prevista" value={fmt(data.receita_prevista ?? 0)} highlight />
          <Kpi label="Receita aprovada" value={fmt(data.receita_aprovada ?? 0)} highlight />
          <Kpi label="Parceiros ativos" value={String(data.parceiros_ativos ?? 0)} />
          <Kpi label="Parceiros novos" value={String(data.parceiros_novos ?? 0)} />
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`border rounded-md p-4 ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold text-2xl">{value}</div>
    </div>
  );
}
