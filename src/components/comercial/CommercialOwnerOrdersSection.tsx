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
 * Sempre montada: pedidos já visíveis na lista administrativa são deduplicados
 * por ID (excludeIds). Contrato ausente ou ator sem papel => seção quieta;
 * erro de transporte/indisponibilidade => aviso explícito (nunca confundido
 * com "carteira vazia"); lista vazia de verdade => quieta.
 */
export function CommercialOwnerOrdersSection({ statusFilter, excludeIds = [] }: { statusFilter: string; excludeIds?: string[] }) {
  const result = useCommercialOwnerOrders({ status: statusFilter === "all" ? null : statusFilter });
  const state = result.data;
  if (!result.ready || result.isLoading) return null;
  if (result.isError || (state && state.state === "blocked" && state.reason === "unavailable")) {
    return (
      <Card>
        <CardContent className="py-4">
          <p role="status" className="text-sm text-muted-foreground">
            Acompanhamento da carteira da empresa indisponível no momento. A lista acima não foi afetada.
          </p>
        </CardContent>
      </Card>
    );
  }
  if (!state || state.state !== "allowed") return null;
  const visible = state.orders.filter((o) => !excludeIds.includes(o.id));
  if (visible.length === 0) return null;
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
            {visible.map((o) => (
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
