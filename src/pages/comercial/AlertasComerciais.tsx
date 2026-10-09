import { useCommercialAlerts } from "@/hooks/useCommercial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { formatDateDisplay } from "@/lib/date-utils";

export default function AlertasComerciais() {
  const { data, isLoading, isError } = useCommercialAlerts();

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  if (isError || !data) return <div role="alert" className="p-6 text-sm text-muted-foreground">Não foi possível carregar os alertas comerciais.</div>;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="h-6 w-6 text-amber-500" /> Alertas Comerciais</h1>
        <p className="text-sm text-muted-foreground">Pontos de atenção do módulo B2B.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Pedidos aguardando aprovação</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{data.pedidos_aguardando_aprovacao ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Pedidos aguardando ajuste comercial</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{data.pedidos_aguardando_ajuste ?? 0}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Campanhas próximas do vencimento (15d)</CardTitle></CardHeader>
        <CardContent>
          {data.campanhas_disponiveis === false ? (
            <div role="status" className="text-sm text-muted-foreground py-4">Campanhas indisponíveis no momento.</div>
          ) : (data.campanhas_vencendo ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">Nenhuma.</div>
          ) : (
            <ul className="text-sm space-y-1">
              {data.campanhas_vencendo.map((c: any) => (
                <li key={c.id} className="flex justify-between border-b py-1">
                  <span>{c.nome}</span>
                  <Badge variant="outline">{formatDateDisplay(c.data_fim)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tabelas comerciais vencendo (15d)</CardTitle></CardHeader>
        <CardContent>
          {(data.tabelas_vencendo ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">Nenhuma.</div>
          ) : (
            <div className="text-sm">{data.tabelas_vencendo.length} tabela(s) vencem em breve.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Parceiros sem tabela vigente</CardTitle></CardHeader>
        <CardContent>
          {(data.parceiros_sem_tabela ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">Nenhum.</div>
          ) : (
            <ul className="text-sm space-y-1">
              {data.parceiros_sem_tabela.slice(0, 20).map((p: any) => (
                <li key={p.id} className="border-b py-1">{p.razao_social}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Parceiros sem compras há 30 dias</CardTitle></CardHeader>
        <CardContent>
          {(data.parceiros_sem_compras_30d ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">Nenhum.</div>
          ) : (
            <ul className="text-sm space-y-1">
              {data.parceiros_sem_compras_30d.slice(0, 20).map((p: any) => (
                <li key={p.id} className="flex justify-between border-b py-1">
                  <span>{p.razao_social}</span>
                  <span className="text-muted-foreground text-xs">
                    {p.ultima_compra ? `Última: ${formatDateDisplay(p.ultima_compra)}` : "Sem compras"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Parceiros sem compras há 60 dias</CardTitle></CardHeader>
        <CardContent>
          {(data.parceiros_sem_compras_60d ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">Nenhum.</div>
          ) : (
            <ul className="text-sm space-y-1">
              {data.parceiros_sem_compras_60d.slice(0, 20).map((p: any) => (
                <li key={p.id} className="flex justify-between border-b py-1">
                  <span>{p.razao_social}</span>
                  <span className="text-muted-foreground text-xs">
                    {p.ultima_compra ? `Última: ${formatDateDisplay(p.ultima_compra)}` : "Sem compras"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Mensagens não respondidas</CardTitle></CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{data.mensagens_nao_respondidas ?? 0}</div>
        </CardContent>
      </Card>
    </div>
  );
}
