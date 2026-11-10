import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/financeiro/KpiCard";
import { useB2BRevenueForecast } from "@/hooks/useB2BFinanceiro";
import { brl } from "@/lib/financial/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { CheckCircle, AlertTriangle, TrendingUp, Calendar } from "lucide-react";

export default function PrevisaoReceitaB2B() {
  const { data, isLoading, isError, ready } = useB2BRevenueForecast();
  if (!ready || isError || !data) return <div className="p-4 sm:p-6 space-y-4"><h1 className="text-2xl font-semibold">Previsão de Receita B2B</h1><p role="status">{ready && isLoading ? 'Carregando…' : 'Previsão indisponível para esta sessão'}</p></div>;
  const f = data;

  const chart = [
    { periodo: "30 dias", confirmada: Number(f.confirmada_30 || 0), projetada: Number(f.projetada || 0), risco: Number(f.em_risco || 0) },
    { periodo: "60 dias", confirmada: Number(f.confirmada_60 || 0), projetada: Number(f.projetada || 0), risco: Number(f.em_risco || 0) },
    { periodo: "90 dias", confirmada: Number(f.confirmada_90 || 0), projetada: Number(f.projetada || 0), risco: Number(f.em_risco || 0) },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Previsão de Receita B2B</h1>
        <p className="text-sm text-muted-foreground">Projeção consolidada de recebimentos para 30/60/90 dias.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Confirmada 30 dias" value={brl(f.confirmada_30)} icon={CheckCircle} tone="success" />
        <KpiCard label="Confirmada 60 dias" value={brl(f.confirmada_60)} icon={Calendar} tone="success" />
        <KpiCard label="Confirmada 90 dias" value={brl(f.confirmada_90)} icon={Calendar} tone="success" />
        <KpiCard label="Receita projetada" value={brl(f.projetada)} icon={TrendingUp} />
        <KpiCard label="Receita em risco" value={brl(f.em_risco)} icon={AlertTriangle} tone="danger" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Composição da previsão</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="periodo" />
                <YAxis tickFormatter={(v) => brl(Number(v))} width={90} />
                <Tooltip formatter={(v: any) => brl(Number(v))} />
                <Legend />
                <Bar dataKey="confirmada" fill="hsl(var(--primary))" name="Confirmada acumulada" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
