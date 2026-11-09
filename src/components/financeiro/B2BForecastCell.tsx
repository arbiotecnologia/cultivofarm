import { useB2BOrderForecast } from '@/hooks/useB2BFinanceiro';
import { brl, fmtDate } from '@/lib/financial/format';

export function B2BForecastCell({ orderId }: { orderId: string }) {
  const query = useB2BOrderForecast(orderId);
  if (query.isLoading && query.ready) return <span className="text-muted-foreground">Carregando previsão…</span>;
  if (!query.ready || query.isError || query.data === undefined) return <span className="text-muted-foreground">Previsão indisponível</span>;
  if (query.data === null) return <span className="text-muted-foreground">Sem previsão confirmada</span>;
  const f = query.data;
  const canceled = f.state === 'cancelado_antes_nf' || f.state === 'cancelado_residual';
  return <div className="space-y-1 text-sm">
    <div>{canceled ? 'Previsão cancelada' : f.residual_amount > 0 ? 'Previsão aguardando NF' : 'Recebível confirmado'}</div>
    <div className="text-muted-foreground">Residual não exigível: {brl(f.residual_amount)}</div>
    {f.residual_amount > 0 && <div className="text-xs text-muted-foreground">Datas estimadas: {f.schedule.map(s => fmtDate(s.due_date)).join(', ')}</div>}
    {f.state === 'faturado_parcial' && <div>Recebível confirmado parcialmente</div>}
  </div>;
}