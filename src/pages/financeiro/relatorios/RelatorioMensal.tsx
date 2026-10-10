import { ReportShell } from "@/components/financeiro/relatorios/ReportShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hojeSaoPaulo } from "@/lib/financeiro/contasReceber";
import { brl } from "@/lib/financial/format";
import type { MonthlyReport } from "./types";

export default function RelatorioMensal() {
  const today = hojeSaoPaulo();
  const first = today.slice(0, 8) + "01";
  return (
    <ReportShell<MonthlyReport>
      title="Relatório Mensal Financeiro"
      description="Resumo de recebimentos, pagamentos e previsões do período."
      reportType="monthly"
      defaultFilters={{ _from: first, _to: today }}
      renderFilters={(filters, set) => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="monthly-from">De *</Label>
            <Input id="monthly-from" type="date" value={String(filters._from ?? "")}
              onChange={(e) => set({ ...filters, _from: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="monthly-to">Até *</Label>
            <Input id="monthly-to" type="date" value={String(filters._to ?? "")}
              onChange={(e) => set({ ...filters, _to: e.target.value })} />
          </div>
        </div>
      )}
      renderPreview={(data) => (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { l: "Recebido", v: data?.received },
            { l: "Pago", v: data?.paid },
            { l: "Previsto a receber", v: data?.expected_receivable },
            { l: "Previsto a pagar", v: data?.expected_payable },
            { l: "Caixa líquido", v: data?.net_cash },
          ].map((k) => (
            <Card key={k.l}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{k.l}</p><p className="text-lg font-bold">{brl(k.v)}</p></CardContent></Card>
          ))}
        </div>
      )}
    />
  );
}
