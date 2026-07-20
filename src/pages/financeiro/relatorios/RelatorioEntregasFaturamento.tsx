import { ReportShell } from "@/components/financeiro/relatorios/ReportShell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/financial/format";
import type { DeliveryBillingRow } from "./types";

export default function RelatorioEntregasFaturamento() {
  const today = new Date().toISOString().slice(0, 10);
  const first = today.slice(0, 8) + "01";
  return (
    <ReportShell<DeliveryBillingRow[]>
      title="Entregas x Faturamento"
      reportType="deliveries_billing"
      defaultFilters={{ _from: first, _to: today }}
      renderPreview={(data) => (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Cliente</TableHead>
              <TableHead className="text-right">Valor</TableHead><TableHead>Faturada?</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).map((r) => (
                <TableRow key={r.delivery_id}>
                  <TableCell>{r.delivery_date}</TableCell><TableCell>{r.customer_name}</TableCell>
                  <TableCell className="text-right">{brl(r.total_value)}</TableCell>
                  <TableCell><Badge variant={r.billed ? "default" : "destructive"}>{r.billed ? "Sim" : "Não"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    />
  );
}
