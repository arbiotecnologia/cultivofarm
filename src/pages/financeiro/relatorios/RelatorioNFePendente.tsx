import { ReportShell } from "@/components/financeiro/relatorios/ReportShell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl } from "@/lib/financial/format";
import type { NFePendingRow } from "./types";

export default function RelatorioNFePendente() {
  return (
    <ReportShell<NFePendingRow[]>
      title="NF-e Pendente"
      reportType="nfe_pending"
      defaultFilters={{ _filters: {} }}
      renderPreview={(data) => (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Emissão</TableHead><TableHead>Cliente</TableHead><TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).map((r) => (
                <TableRow key={r.receivable_id}>
                  <TableCell>{r.issue_date}</TableCell><TableCell>{r.customer_name}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.description}</TableCell>
                  <TableCell className="text-right">{brl(r.total_amount)}</TableCell>
                  <TableCell>{r.fiscal_invoice_status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    />
  );
}
