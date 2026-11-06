import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { usePartnerOrders } from "@/hooks/usePartnerOrders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateDisplay as formatDate } from "@/lib/date-utils";
import { brl } from "@/lib/financial/format";
import {
  partnerOrderStatusLabelForPartner,
  partnerOrderStatusVariantForPartner,
} from "@/lib/partnerOrderStatus";
import { DetalhePedidoDrawer } from "@/components/pedidos-b2b/DetalhePedidoDrawer";

export default function Historico() {
  const { partner } = useOutletContext<{ partner: any }>();
  const { data: orders = [], isLoading } = usePartnerOrders(partner?.id);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Histórico de Pedidos</h1>
        <p className="text-sm text-muted-foreground">Todos os pedidos realizados</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{orders.length} pedido(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : orders.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Nenhum pedido encontrado.
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow
                        key={o.id}
                        onClick={() => setDetalheId(o.id)}
                        className="cursor-pointer hover:bg-accent/40"
                      >
                        <TableCell className="font-mono">{o.numero}</TableCell>
                        <TableCell>{formatDate(o.created_at)}</TableCell>
                        <TableCell>
                          <Badge variant={partnerOrderStatusVariantForPartner(o.status)}>
                            {partnerOrderStatusLabelForPartner(o.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{brl(o.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden space-y-2">
                {orders.map((o) => (
                  <div
                    key={o.id}
                    onClick={() => setDetalheId(o.id)}
                    className="border rounded-lg p-3 space-y-1 cursor-pointer hover:bg-accent/40"
                  >
                    <div className="flex justify-between items-start">
                      <div className="font-mono text-sm">{o.numero}</div>
                      <Badge variant={partnerOrderStatusVariantForPartner(o.status)}>{partnerOrderStatusLabelForPartner(o.status)}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDate(o.created_at)}</div>
                    <div className="flex justify-between text-base font-semibold border-t pt-1">
                      <span>Total</span>
                      <span>{brl(o.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <DetalhePedidoDrawer
        empresaNome={partner?.sellerName ?? null}
        orderId={detalheId}
        open={!!detalheId}
        onOpenChange={(o) => !o && setDetalheId(null)}
        viewerScope="parceiro_gestor"
      />
    </div>
  );
}
