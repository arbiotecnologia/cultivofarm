import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useB2BAgingDetalhado } from "@/hooks/useB2BFinanceiro";
import { AgingBarChart } from "@/components/financeiro/AgingBarChart";
import { BIExportButton } from "@/components/bi/BIExportButton";
import { brl } from "@/lib/financial/format";

export default function AgingFinanceiroB2B() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const { data = [], isLoading } = useB2BAgingDetalhado({
    from: from || undefined, to: to || undefined, status: status || undefined,
  });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Aging Financeiro B2B</h1>
        <p className="text-sm text-muted-foreground">Distribuição da carteira por faixa de vencimento.</p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div><Label>De</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><Label>Até</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div>
            <Label>Status</Label>
            <select className="w-full h-10 border rounded-md px-2 bg-background" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="OPEN">Em aberto</option>
              <option value="PARTIAL">Parcial</option>
              <option value="OVERDUE">Vencido</option>
            </select>
          </div>
          <BIExportButton
            data={data}
            headers={{ faixa: "Faixa", qtd_titulos: "Títulos", valor: "Valor", qtd_parceiros: "Parceiros", pct_carteira: "% Carteira", valor_medio_parceiro: "Valor médio por parceiro" }}
            filenamePrefix="aging-b2b"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Distribuição por faixa</CardTitle></CardHeader>
        <CardContent><AgingBarChart data={data} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Detalhamento</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Faixa</TableHead>
                <TableHead className="text-right">Títulos</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">% Carteira</TableHead>
                <TableHead className="text-right">Parceiros</TableHead>
                <TableHead className="text-right">Valor médio/parceiro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!isLoading && data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sem títulos em aberto.</TableCell></TableRow>}
              {data.map(a => (
                <TableRow key={a.faixa}>
                  <TableCell className="font-medium">{a.faixa} dias</TableCell>
                  <TableCell className="text-right">{a.qtd_titulos}</TableCell>
                  <TableCell className="text-right">{brl(a.valor)}</TableCell>
                  <TableCell className="text-right">{Number(a.pct_carteira).toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{a.qtd_parceiros}</TableCell>
                  <TableCell className="text-right">{brl(a.valor_medio_parceiro)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
