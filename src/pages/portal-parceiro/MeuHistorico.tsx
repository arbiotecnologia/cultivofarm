import { useOutletContext } from "react-router-dom";
import { usePartnerCommercialHistory } from "@/hooks/useCommercial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateDisplay } from "@/lib/date-utils";
import { brl as fmt } from "@/lib/financial/format";

export default function MeuHistorico() {
  const { partner } = useOutletContext<{ partner: any }>();
  const { data, isLoading } = usePartnerCommercialHistory(partner?.id);

  if (!partner?.id) {
    return <div className="text-sm text-muted-foreground">Selecione um parceiro para visualizar o histórico.</div>;
  }

  const qtd = Number(data?.qtd_pedidos ?? 0);
  const valorAcum = Number(data?.valor_acumulado ?? 0);
  const ticket = Number(data?.ticket_medio ?? 0);
  const ultima = data?.ultima_compra ?? null;
  const topProdutos: any[] = Array.isArray(data?.top_produtos) ? data!.top_produtos : [];

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Meu Histórico Comercial</h1>
        <p className="text-sm text-muted-foreground">Resumo dos últimos 12 meses.</p>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <Kpi label="Pedidos" value={isLoading ? "…" : String(qtd)} />
        <Kpi label="Valor acumulado" value={isLoading ? "…" : fmt(valorAcum)} highlight />
        <Kpi label="Ticket médio" value={isLoading ? "…" : fmt(ticket)} />
        <Kpi label="Última compra" value={isLoading ? "…" : ultima ? formatDateDisplay(ultima) : "—"} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Top produtos comprados</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground text-center py-4">Carregando...</div>
          ) : topProdutos.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              Nenhuma compra registrada nos últimos 12 meses.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProdutos.map((p: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell>{p.produto ?? "—"}</TableCell>
                    <TableCell className="text-right">{Number(p.quantidade).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{fmt(p.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`border rounded-md p-4 ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold text-xl">{value}</div>
    </div>
  );
}
