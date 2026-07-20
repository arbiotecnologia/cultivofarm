import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import type { NotificacaoItem } from "@/hooks/useAlertasNotificacoes";

interface Props {
  historico: NotificacaoItem[];
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  enviado: "default",
  pendente: "secondary",
  falhou: "destructive",
  cooldown: "outline",
  bloqueado: "outline",
  ignorado: "outline",
};

export function AlertasNotificacoesHistorico({ historico }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de notificações (últimas 50)</CardTitle>
      </CardHeader>
      <CardContent>
        {historico.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma notificação registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left py-2 pr-2">Data</th>
                  <th className="text-left py-2 pr-2">Canal</th>
                  <th className="text-left py-2 pr-2">Destino</th>
                  <th className="text-left py-2 pr-2">Status</th>
                  <th className="text-left py-2 pr-2">Tent.</th>
                  <th className="text-left py-2 pr-2">Enviado em</th>
                  <th className="text-left py-2">Erro</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((n) => (
                  <tr key={n.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 whitespace-nowrap">{formatDateTimeDisplay(n.created_at)}</td>
                    <td className="py-2 pr-2"><Badge variant="outline" className="text-[10px]">{n.canal}</Badge></td>
                    <td className="py-2 pr-2 max-w-[200px] truncate">{n.destino}</td>
                    <td className="py-2 pr-2">
                      <Badge variant={STATUS_VARIANT[n.status] ?? "outline"} className="text-[10px]">
                        {n.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-2">{n.tentativa}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {n.enviado_em ? formatDateTimeDisplay(n.enviado_em) : "—"}
                    </td>
                    <td className="py-2 max-w-[260px] truncate text-xs text-muted-foreground">
                      {n.erro ?? "—"}
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
