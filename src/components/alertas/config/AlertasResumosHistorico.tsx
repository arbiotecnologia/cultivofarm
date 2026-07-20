import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import type { ResumoItem } from "@/hooks/useAlertasNotificacoes";

interface Props {
  historico: ResumoItem[];
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  enviado: "default",
  pendente: "secondary",
  falhou: "destructive",
  bloqueado: "outline",
  ignorado: "outline",
};

export function AlertasResumosHistorico({ historico }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de resumos (últimos 50)</CardTitle>
      </CardHeader>
      <CardContent>
        {historico.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum resumo gerado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left py-2 pr-2">Data</th>
                  <th className="text-left py-2 pr-2">Tipo</th>
                  <th className="text-left py-2 pr-2">Período</th>
                  <th className="text-left py-2 pr-2">Destino</th>
                  <th className="text-left py-2 pr-2">Status</th>
                  <th className="text-left py-2 pr-2">Tot.</th>
                  <th className="text-left py-2 pr-2">Crít.</th>
                  <th className="text-left py-2 pr-2">Alta</th>
                  <th className="text-left py-2 pr-2">Resol.</th>
                  <th className="text-left py-2 pr-2">Enviado</th>
                  <th className="text-left py-2">Erro</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 whitespace-nowrap">{formatDateTimeDisplay(r.created_at)}</td>
                    <td className="py-2 pr-2">
                      <Badge variant="outline" className="text-[10px]">{r.tipo_resumo}</Badge>
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTimeDisplay(r.periodo_inicio)} → {formatDateTimeDisplay(r.periodo_fim)}
                    </td>
                    <td className="py-2 pr-2 max-w-[200px] truncate">{r.destino}</td>
                    <td className="py-2 pr-2">
                      <Badge variant={STATUS_VARIANT[r.status] ?? "outline"} className="text-[10px]">
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-2">{r.total_alertas}</td>
                    <td className="py-2 pr-2">{r.total_criticos}</td>
                    <td className="py-2 pr-2">{r.total_alta}</td>
                    <td className="py-2 pr-2">{r.total_resolvidos}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {r.enviado_em ? formatDateTimeDisplay(r.enviado_em) : "—"}
                    </td>
                    <td className="py-2 max-w-[220px] truncate text-xs text-muted-foreground">
                      {r.erro ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
