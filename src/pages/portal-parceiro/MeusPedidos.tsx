import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, Link, useSearchParams } from "react-router-dom";
import { usePartnerOrders } from "@/hooks/usePartnerOrders";
import { useUnreadCountsByOrder } from "@/hooks/usePartnerUnreadMessages";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart, Eye, MessageSquare, FlaskConical } from "lucide-react";
import { formatDateDisplay as formatDate } from "@/lib/date-utils";
import { TimelinePedidoDialog } from "@/components/portal-parceiro/TimelinePedidoDialog";
import { FaseSlaBadge } from "@/components/comercial/FaseSlaBadge";
import { useOrdersSlaMap } from "@/hooks/useOrdersSlaMap";
import { MensagensPedidoDialog } from "@/components/portal-parceiro/MensagensPedidoDialog";
import { DetalhePedidoDrawer } from "@/components/pedidos-b2b/DetalhePedidoDrawer";
import { brl } from "@/lib/financial/format";
import {
  partnerOrderStatusLabelForPartner,
  partnerOrderStatusVariantForPartner,
} from "@/lib/partnerOrderStatus";

const TERMINAL = ["entregue", "faturado", "cancelado", "reprovado"];

export default function MeusPedidos() {
  const { partner } = useOutletContext<{ partner: any }>();
  const { data: orders = [], isLoading } = usePartnerOrders(partner?.id);
  const [timelineOrderId, setTimelineOrderId] = useState<string | null>(null);
  const [msgOrder, setMsgOrder] = useState<{ id: string; numero: string } | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const highlight = searchParams.get("highlight");
  const rowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (highlight && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight, orders.length]);


  const ativos = orders.filter((o) => !TERMINAL.includes(o.status));
  const ativoIds = useMemo(() => ativos.map((o) => o.id), [ativos]);
  const { data: unread = {} } = useUnreadCountsByOrder(ativoIds);

  const { data: slaMap } = useOrdersSlaMap(ativoIds);

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Meus Pedidos</h1>
          <p className="text-sm text-muted-foreground">Pedidos em andamento</p>
        </div>
        <Button asChild>
          <Link to="/portal-parceiro/catalogo">
            <ShoppingCart className="h-4 w-4 mr-2" /> Catálogo
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pedidos ativos ({ativos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : ativos.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Nenhum pedido ativo.
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Desejada</TableHead>
                      <TableHead>Prevista</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ativos.map((o) => {
                      const n = unread[o.id] ?? 0;
                      const isHl = highlight === o.id;
                      return (
                        <TableRow
                          key={o.id}
                          ref={isHl ? rowRef : undefined}
                          onClick={() => setDetalheId(o.id)}
                          className={`cursor-pointer hover:bg-accent/40 ${isHl ? "bg-primary/5 ring-2 ring-primary/40" : ""}`}
                        >
                          <TableCell className="font-mono">
                            <div className="flex items-center gap-1">
                              {o.numero}
                              {(o as any).origin_simulation_id && (
                                <FlaskConical
                                  className="h-3 w-3 text-primary"
                                  aria-label="Originado de simulação técnica"
                                />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(o.created_at)}</TableCell>
                          <TableCell>{o.requested_delivery_date ? formatDate(o.requested_delivery_date) : "—"}</TableCell>
                          <TableCell>{o.estimated_delivery_date ? formatDate(o.estimated_delivery_date) : "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant={partnerOrderStatusVariantForPartner(o.status)}>
                                {partnerOrderStatusLabelForPartner(o.status)}
                              </Badge>
                              <FaseSlaBadge info={slaMap?.get(o.id) ?? null} modoParceiro />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {brl(o.total)}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); setMsgOrder({ id: o.id, numero: o.numero }); }}
                                aria-label="Abrir mensagens do pedido"
                                className="relative"
                              >
                                <MessageSquare className="h-4 w-4 mr-1" /> Mensagens
                                {n > 0 && (
                                  <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{n}</Badge>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); setTimelineOrderId(o.id); }}
                                aria-label="Ver andamento do pedido"
                              >
                                <Eye className="h-4 w-4 mr-1" /> Andamento
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {ativos.map((o) => {
                  const n = unread[o.id] ?? 0;
                  return (
                    <div
                      key={o.id}
                      onClick={() => setDetalheId(o.id)}
                      className="border rounded-lg p-3 space-y-1 cursor-pointer hover:bg-accent/40"
                    >
                      <div className="flex justify-between items-start">
                        <div className="font-mono text-sm">{o.numero}</div>
                        <Badge variant={partnerOrderStatusVariantForPartner(o.status)}>
                          {partnerOrderStatusLabelForPartner(o.status)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Criado em {formatDate(o.created_at)}
                        {o.requested_delivery_date && ` · Desej. ${formatDate(o.requested_delivery_date)}`}
                        {o.estimated_delivery_date && ` · Prev. ${formatDate(o.estimated_delivery_date)}`}
                      </div>
                      <div className="flex justify-between items-center border-t pt-1 gap-1">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); setMsgOrder({ id: o.id, numero: o.numero }); }}
                            aria-label="Abrir mensagens do pedido"
                            className="relative h-8 px-2"
                          >
                            <MessageSquare className="h-4 w-4" />
                            {n > 0 && (
                              <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{n}</Badge>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); setTimelineOrderId(o.id); }}
                            aria-label="Ver andamento do pedido"
                            className="h-8 px-2"
                          >
                            <Eye className="h-4 w-4 mr-1" /> Andamento
                          </Button>
                        </div>
                        <span className="font-semibold">{brl(o.total)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <TimelinePedidoDialog
        orderId={timelineOrderId}
        open={!!timelineOrderId}
        onOpenChange={(o) => !o && setTimelineOrderId(null)}
      />

      <MensagensPedidoDialog
        orderId={msgOrder?.id ?? null}
        numero={msgOrder?.numero}
        open={!!msgOrder}
        onOpenChange={(o) => !o && setMsgOrder(null)}
      />

      <DetalhePedidoDrawer
        orderId={detalheId}
        open={!!detalheId}
        onOpenChange={(o) => !o && setDetalheId(null)}
        viewerScope="parceiro_gestor"
      />
    </div>
  );
}
