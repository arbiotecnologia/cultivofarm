import { ReportShell } from "@/components/financeiro/relatorios/ReportShell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/financial/format";
import type { DelinquencyRow } from "./types";

export default function RelatorioInadimplencia() {
  return (
    <ReportShell<DelinquencyRow[]>
      title="Inadimplência"
      description="Títulos em atraso até a data de referência."
      reportType="delinquency"
      defaultFilters={{ _as_of: new Date().toISOString().slice(0, 10) }}
      renderPreview={(data) => (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Cliente</TableHead><TableHead>Descrição</TableHead><TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Saldo</TableHead><TableHead>Dias atraso</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).map((r) => (
                <TableRow key={r.installment_id}>
                  <TableCell>{r.customer_name}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.description}</TableCell>
                  <TableCell>{r.due_date}</TableCell>
                  <TableCell className="text-right font-medium">{brl(r.balance)}</TableCell>
                  <TableCell><Badge variant={r.days_overdue > 30 ? "destructive" : "secondary"}>{r.days_overdue}d</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    />
  );
}
