import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useB2BPartnerProfitability } from "@/hooks/useB2BFinanceiro";
import { BIExportButton } from "@/components/bi/BIExportButton";
import { RiskBadge } from "@/components/financeiro/RiskBadge";
import { brl } from "@/lib/financial/format";

export default function RentabilidadeParceirosB2B() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data = [], isLoading } = useB2BPartnerProfitability({ from: from || undefined, to: to || undefined });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Rentabilidade por Parceiro</h1>
        <p className="text-sm text-muted-foreground">Indicadores comerciais e financeiros consolidados por parceiro B2B.</p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div><Label>De</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><Label>Até</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <BIExportButton
            data={data}
            headers={{
              partner_name: "Parceiro",
              total_comprado: "Total comprado",
              total_recebido: "Total recebido",
              total_aberto: "Total em aberto",
              ticket_medio: "Ticket médio",
              qtd_pedidos: "Pedidos",
              prazo_medio_pgto: "Prazo médio (dias)",
              inadimplencia_pct: "Inadimplência %",
              risk_score: "Score",
              risk_level: "Risco",
            }}
            filenamePrefix="rentabilidade-b2b"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parceiro</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Comprado</TableHead>
                <TableHead className="text-right">Recebido</TableHead>
                <TableHead className="text-right">Em aberto</TableHead>
                <TableHead className="text-right">Ticket médio</TableHead>
                <TableHead className="text-right">Prazo médio</TableHead>
                <TableHead className="text-right">Inadimpl. %</TableHead>
                <TableHead className="text-right">Risco</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!isLoading && data.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Sem dados.</TableCell></TableRow>}
              {data.map(r => (
                <TableRow key={r.partner_id}>
                  <TableCell className="font-medium">{r.partner_name}</TableCell>
                  <TableCell className="text-right">{r.qtd_pedidos}</TableCell>
                  <TableCell className="text-right">{brl(r.total_comprado)}</TableCell>
                  <TableCell className="text-right">{brl(r.total_recebido)}</TableCell>
                  <TableCell className="text-right">{brl(r.total_aberto)}</TableCell>
                  <TableCell className="text-right">{brl(r.ticket_medio)}</TableCell>
                  <TableCell className="text-right">{Number(r.prazo_medio_pgto).toFixed(1)} d</TableCell>
                  <TableCell className="text-right">{Number(r.inadimplencia_pct).toFixed(1)}%</TableCell>
                  <TableCell className="text-right"><RiskBadge level={r.risk_level} score={r.risk_score} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
