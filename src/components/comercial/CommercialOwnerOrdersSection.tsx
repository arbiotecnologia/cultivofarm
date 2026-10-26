import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCommercialOwnerOrders } from "@/hooks/useCommercialOwnerOrders";
import { formatDateDisplay as fmtDate } from "@/lib/date-utils";
import { brl as fmt } from "@/lib/financial/format";
import { partnerOrderStatusLabel, partnerOrderStatusVariant } from "@/lib/partnerOrderStatus";
import { AccountingPendingBadge } from "@/components/pedidos/AccountingPendingNotice";
import { isAccountingPending } from "@/lib/orderAccountingState";

/**
 * Lista somente leitura dos pedidos externos da carteira da própria empresa.
 * Renderiza apenas quando o canal canônico devolve linhas; contrato ausente,
 * ator sem papel ou lista vazia => seção quieta (fail-closed, sem promessa).
 */
export function CommercialOwnerOrdersSection({ statusFilter }: { statusFilter: string }) {
  const result = useCommercialOwnerOrders({ status: statusFilter === "all" ? null : statusFilter });
  const state = result.data;
  if (!result.ready || result.isLoading || result.isError || !state || state.state !== "allowed" || state.orders.length === 0) {
    return null;
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pedidos da carteira da empresa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Pedidos enviados pelos parceiros da carteira desta empresa. Esta lista é somente leitura:
          análise, aprovação, cobrança, nota fiscal e entrega seguem pelo canal interno autorizado e
          podem permanecer bloqueadas.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Parceiro</TableHead>
              <TableHead>Criado</TableHead>
              <TableHead>Desejada</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono">{o.numero}</TableCell>
                <TableCell>{o.partner_razao_social}</TableCell>
                <TableCell>{fmtDate(o.created_at)}</TableCell>
                <TableCell>{o.requested_delivery_date ? fmtDate(o.requested_delivery_date) : "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant={partnerOrderStatusVariant(o.status)}>{partnerOrderStatusLabel(o.status)}</Badge>
                    {isAccountingPending(o) && <AccountingPendingBadge />}
                  </div>
                </TableCell>
                <TableCell className="text-right">{fmt(o.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
