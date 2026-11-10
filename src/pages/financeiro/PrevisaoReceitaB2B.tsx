import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/financeiro/KpiCard";
import { useB2BRevenueForecast } from "@/hooks/useB2BFinanceiro";
import { brl } from "@/lib/financial/format";
import { CheckCircle, AlertTriangle, TrendingUp, Calendar } from "lucide-react";

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="p-4 sm:p-6 space-y-4"><h1 className="text-2xl font-semibold">Previsão de Receita B2B</h1>{children}</div>;
}

export default function PrevisaoReceitaB2B() {
  const { data, isLoading, isError, ready } = useB2BRevenueForecast();
  if (ready && isLoading) return <Shell><p role="status">Carregando…</p></Shell>;
  if (!ready || isError || data === undefined) return <Shell><p role="status">Previsão indisponível para esta sessão</p></Shell>;
  if (data === null) return <Shell><p role="status">A previsão de receita ainda não está disponível para a sua empresa.</p></Shell>;
  const t = data.confirmed_titles;
  return (
    <Shell>
      <p className="text-sm text-muted-foreground">Títulos confirmados e previsão não exigível são mostrados separadamente e nunca somados.</p>
      <Card>
        <CardHeader><CardTitle className="text-base">Títulos com NF autorizada em aberto</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Vencidos" value={brl(t.vencido)} icon={AlertTriangle} tone="danger" />
          <KpiCard label="Até 30 dias" value={brl(t.ate_30)} icon={CheckCircle} tone="success" />
          <KpiCard label="31 a 60 dias" value={brl(t.ate_60)} icon={Calendar} tone="success" />
          <KpiCard label="61 a 90 dias" value={brl(t.ate_90)} icon={Calendar} tone="success" />
          <KpiCard label="Total em aberto" value={brl(t.total_aberto)} icon={CheckCircle} />
          {(t => t.unproven + t.legacy + t.inconsistent > 0 && <p role="note" aria-label="Títulos fora do total" className="col-span-full text-sm text-muted-foreground">
            {t.unproven + t.legacy + t.inconsistent} parcela(s) sem NF autorizada comprovada ou com dados divergentes: valor indisponível, fora do total.</p>)(data.titles_unavailable)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Previsão aguardando NF (não exigível)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <KpiCard label="Residual previsto" value={brl(data.forecast_residual.amount)} icon={TrendingUp} />
          <p className="text-sm text-muted-foreground">{data.forecast_residual.orders} pedido(s) aprovados comercialmente e no crédito; datas estimadas, sem cobrança até NF autorizada.</p>
          {data.legacy_unproven_orders > 0 && <p role="note" className="text-sm text-muted-foreground">{data.legacy_unproven_orders} pedido(s) antigos sem previsão comprovada: valor indisponível.</p>}
          {data.forecast_residual.inconsistent > 0 && <p className="text-sm text-muted-foreground">{data.forecast_residual.inconsistent} previsão(ões) com dados divergentes: fora do total.</p>}
        </CardContent>
      </Card>
    </Shell>
  );
}
