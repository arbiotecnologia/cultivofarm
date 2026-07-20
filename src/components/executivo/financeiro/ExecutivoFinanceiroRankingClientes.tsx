import { Card } from "@/components/ui/card";
import { brl } from "@/lib/financial/format";
import type { RankingCliente } from "@/hooks/useExecutivoFinanceiroRanking";

interface Props {
  ranking: RankingCliente[];
  isLoading?: boolean;
}

export function ExecutivoFinanceiroRankingClientes({ ranking, isLoading }: Props) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3">Ranking de clientes (pendências)</h3>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : ranking.length === 0 ? (
        <div className="text-sm text-muted-foreground">Sem pendências significativas.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-2 pr-2">Cliente</th>
                <th className="text-right py-2 px-2">A receber</th>
                <th className="text-right py-2 px-2">Vencido</th>
                <th className="text-right py-2 px-2">Títulos</th>
                <th className="text-right py-2 px-2">Não fat.</th>
                <th className="text-right py-2 pl-2">Sem compr.</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.cliente_id} className="border-b last:border-0">
                  <td className="py-2 pr-2 truncate max-w-[180px]">{r.cliente}</td>
                  <td className="py-2 px-2 text-right">{brl(r.valor_a_receber)}</td>
                  <td className="py-2 px-2 text-right text-destructive">{brl(r.valor_vencido)}</td>
                  <td className="py-2 px-2 text-right">{r.titulos_abertos}</td>
                  <td className="py-2 px-2 text-right">{r.entregas_nao_faturadas}</td>
                  <td className="py-2 pl-2 text-right">{r.entregas_sem_comprovante}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
