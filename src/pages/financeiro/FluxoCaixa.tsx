import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl } from "@/lib/financial/format";
import { PeriodoFilter, defaultPeriodo, type PeriodoState } from "@/components/financeiro/bi/PeriodoFilter";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EstornosResumoCard } from "@/components/financeiro/EstornosResumoCard";

type Row = {
  period_label: string; period_start: string;
  expected_inflows: number; expected_outflows: number;
  realized_inflows: number; realized_outflows: number;
  projected_balance: number; realized_balance: number;
  accumulated_projected_balance: number; accumulated_realized_balance: number;
};

export default function FluxoCaixa() {
  const [periodo, setPeriodo] = useState<PeriodoState>(defaultPeriodo());
  const [groupBy, setGroupBy] = useState<"DAY" | "WEEK" | "MONTH">("DAY");
  const [viewMode, setViewMode] = useState<"PROJECTED" | "REALIZED" | "COMPARATIVE">("PROJECTED");
  const [drillBucket, setDrillBucket] = useState<Row | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["fluxo-caixa", periodo.from, periodo.to, groupBy, viewMode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_financial_cashflow" as any, {
        p_start_date: periodo.from, p_end_date: periodo.to,
        p_view_mode: viewMode, p_group_by: groupBy,
      });
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const totais = useMemo(() => ({
    expIn: data.reduce((s, r) => s + Number(r.expected_inflows || 0), 0),
    expOut: data.reduce((s, r) => s + Number(r.expected_outflows || 0), 0),
    realIn: data.reduce((s, r) => s + Number(r.realized_inflows || 0), 0),
    realOut: data.reduce((s, r) => s + Number(r.realized_outflows || 0), 0),
  }), [data]);

  const chartData = data.map((r) => ({
    ...r,
    Previsto: Number(r.projected_balance),
    Realizado: Number(r.realized_balance),
    AccProj: Number(r.accumulated_projected_balance),
    AccReal: Number(r.accumulated_realized_balance),
  }));

  const showProj = viewMode !== "REALIZED";
  const showReal = viewMode !== "PROJECTED";

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Fluxo de Caixa</h1>
      <PeriodoFilter value={periodo} onChange={setPeriodo} showRegime={false} />

      {viewMode !== "PROJECTED" && <EstornosResumoCard from={periodo.from} to={periodo.to} />}


      <div className="flex flex-wrap gap-2">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
          <TabsList>
            <TabsTrigger value="PROJECTED">Projetado</TabsTrigger>
            <TabsTrigger value="REALIZED">Realizado</TabsTrigger>
            <TabsTrigger value="COMPARATIVE">Comparativo</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
          <TabsList>
            <TabsTrigger value="DAY">Diário</TabsTrigger>
            <TabsTrigger value="WEEK">Semanal</TabsTrigger>
            <TabsTrigger value="MONTH">Mensal</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {showProj && <>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Entradas previstas</p><p className="text-lg font-semibold text-emerald-600">{brl(totais.expIn)}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Saídas previstas</p><p className="text-lg font-semibold text-destructive">{brl(totais.expOut)}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Saldo projetado</p><p className={`text-lg font-semibold ${(totais.expIn - totais.expOut) >= 0 ? "text-emerald-600" : "text-destructive"}`}>{brl(totais.expIn - totais.expOut)}</p></CardContent></Card>
        </>}
        {showReal && <>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Entradas realizadas</p><p className="text-lg font-semibold text-emerald-600">{brl(totais.realIn)}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Saídas realizadas</p><p className="text-lg font-semibold text-destructive">{brl(totais.realOut)}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Saldo realizado</p><p className={`text-lg font-semibold ${(totais.realIn - totais.realOut) >= 0 ? "text-emerald-600" : "text-destructive"}`}>{brl(totais.realIn - totais.realOut)}</p></CardContent></Card>
        </>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Evolução do saldo acumulado</CardTitle></CardHeader>
        <CardContent>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period_label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => brl(v)} />
                <Legend />
                {showProj && <Line type="monotone" dataKey="AccProj" stroke="hsl(var(--primary))" name="Acumulado projetado" strokeWidth={2} dot={false} />}
                {showReal && <Line type="monotone" dataKey="AccReal" stroke="hsl(var(--secondary))" name="Acumulado realizado" strokeWidth={2} dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {viewMode === "COMPARATIVE" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Saldo por período — previsto vs realizado</CardTitle></CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period_label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => brl(v)} />
                  <Legend />
                  <Bar dataKey="Previsto" fill="hsl(var(--primary))" />
                  <Bar dataKey="Realizado" fill="hsl(var(--secondary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Detalhamento por período</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Período</TableHead>
              {showProj && <TableHead className="text-right">Entr. prev.</TableHead>}
              {showProj && <TableHead className="text-right">Saíd. prev.</TableHead>}
              {showProj && <TableHead className="text-right">Saldo proj.</TableHead>}
              {showReal && <TableHead className="text-right">Entr. real.</TableHead>}
              {showReal && <TableHead className="text-right">Saíd. real.</TableHead>}
              {showReal && <TableHead className="text-right">Saldo real.</TableHead>}
              <TableHead className="text-right">Acumulado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!isLoading && data.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Sem dados no período</TableCell></TableRow>}
              {chartData.map((r) => (
                <TableRow key={r.period_start} className="cursor-pointer hover:bg-muted/40" onClick={() => setDrillBucket(r)}>
                  <TableCell className="font-medium">{r.period_label}</TableCell>
                  {showProj && <TableCell className="text-right text-emerald-600">{brl(Number(r.expected_inflows))}</TableCell>}
                  {showProj && <TableCell className="text-right text-destructive">{brl(Number(r.expected_outflows))}</TableCell>}
                  {showProj && <TableCell className={`text-right font-medium ${r.Previsto >= 0 ? "text-emerald-600" : "text-destructive"}`}>{brl(r.Previsto)}</TableCell>}
                  {showReal && <TableCell className="text-right text-emerald-600">{brl(Number(r.realized_inflows))}</TableCell>}
                  {showReal && <TableCell className="text-right text-destructive">{brl(Number(r.realized_outflows))}</TableCell>}
                  {showReal && <TableCell className={`text-right font-medium ${r.Realizado >= 0 ? "text-emerald-600" : "text-destructive"}`}>{brl(r.Realizado)}</TableCell>}
                  <TableCell className={`text-right ${(showReal ? r.AccReal : r.AccProj) >= 0 ? "" : "text-destructive"}`}>
                    {brl(showReal ? r.AccReal : r.AccProj)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DrillDownDialog row={drillBucket} groupBy={groupBy} viewMode={viewMode} onClose={() => setDrillBucket(null)} />
    </div>
  );
}

function DrillDownDialog({ row, groupBy, viewMode, onClose }: { row: Row | null; groupBy: string; viewMode: string; onClose: () => void }) {
  const open = !!row;
  const dateRange = useMemo(() => {
    if (!row) return null;
    const start = new Date(row.period_start);
    const end = new Date(start);
    if (groupBy === "WEEK") end.setDate(end.getDate() + 6);
    else if (groupBy === "MONTH") { end.setMonth(end.getMonth() + 1); end.setDate(0); }
    const pad = (n: number) => String(n).padStart(2, "0");
    const f = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { from: f(start), to: f(end) };
  }, [row, groupBy]);

  const { data: receber = [] } = useQuery({
    enabled: open && !!dateRange && viewMode !== "REALIZED",
    queryKey: ["drill-receber", dateRange?.from, dateRange?.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_receivable_installments")
        .select("id, due_date, original_amount, received_amount, discount_amount, status, accounts_receivable!inner(description, clientes!inner(nome))")
        .gte("due_date", dateRange!.from).lte("due_date", dateRange!.to)
        .neq("status", "CANCELED").order("due_date").limit(100);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: pagar = [] } = useQuery({
    enabled: open && !!dateRange && viewMode !== "REALIZED",
    queryKey: ["drill-pagar", dateRange?.from, dateRange?.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_payable_installments")
        .select("id, due_date, original_amount, paid_amount, discount_amount, status, accounts_payable!inner(supplier_name, description)")
        .gte("due_date", dateRange!.from).lte("due_date", dateRange!.to)
        .neq("status", "CANCELED").order("due_date").limit(100);
      if (error) throw error;
      return data as any[];
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Títulos de {row?.period_label}</DialogTitle></DialogHeader>
        {receber.length > 0 && (
          <div>
            <h3 className="font-medium text-sm mb-2 text-emerald-700">A receber ({receber.length})</h3>
            <Table>
              <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {receber.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.accounts_receivable?.clientes?.nome}</TableCell>
                    <TableCell className="text-sm">{r.accounts_receivable?.description}</TableCell>
                    <TableCell className="text-right">{brl(Number(r.original_amount))}</TableCell>
                    <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {pagar.length > 0 && (
          <div>
            <h3 className="font-medium text-sm mb-2 text-destructive">A pagar ({pagar.length})</h3>
            <Table>
              <TableHeader><TableRow><TableHead>Fornecedor</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {pagar.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.accounts_payable?.supplier_name}</TableCell>
                    <TableCell className="text-sm">{r.accounts_payable?.description}</TableCell>
                    <TableCell className="text-right">{brl(Number(r.original_amount))}</TableCell>
                    <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {receber.length === 0 && pagar.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum título a abrir neste período.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
